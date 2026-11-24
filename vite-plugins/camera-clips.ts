import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, readFileSync } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { chairModel, detectChairs } from '../helper/camera/chairs';
import { CameraVideoError, normalizeCameraVideo, readDetections } from '../helper/camera/frames';
import { generateFloorPlan, hasFloorPlanModels } from '../helper/camera/scenes';
import type { GeneratedFloorPlan } from '../src/core/camera/floor-plan';
import {
  CAMERA_CHAIRS_PATH, CAMERA_LAYOUT_PREVIEW_PATH, CAMERA_LAYOUT_SAVE_PATH, CAMERA_MEDIA_PREFIX, CAMERA_OPERATOR_PATH, CAMERA_PUBLISH_PATH, CAMERA_REANALYZE_PATH, CAMERA_UPLOAD_PATH,
  CAMERA_GENERATE_SCENE_PATH, CAMERA_SCENE_PREFIX, createCameraReplay, createGeneratedReplay, type CameraDraft,
} from '../src/core/camera/feed';
import { OFFICE_CALIBRATION } from '../src/core/camera/office';
import { officeRegion, readOfficeCalibration, readOfficeLayout, type OfficeLayout } from '../src/core/camera/office-layout';
import type { CameraPersonDetection } from '../src/core/camera/tracking';

const MAX_UPLOAD = 200 * 1024 * 1024;
const CLIP_ID = /^[0-9a-f]{24}$/;

interface SavedClip extends CameraDraft {
  id: string;
  sceneData?: GeneratedFloorPlan;
}
interface Library {
  draftId: string | null;
  publishedId: string | null;
  publishedAt: number;
  publishedSnapshot?: SavedClip;
}

function publicClip(clip: SavedClip) {
  const { sceneData: _sceneData, ...draft } = clip;
  return draft;
}

class ClipError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function localOperator(request: IncomingMessage, write: boolean): boolean {
  const { headers, socket } = request;
  const host = headers.host ?? '';
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const localSocket = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket.remoteAddress ?? '');
  if (!localHost || !localSocket || Object.keys(headers).some((name) =>
    name === 'forwarded' || name === 'via' || name === 'x-real-ip'
    || /^(x-forwarded-|cf-|ngrok-|x-vercel-)/.test(name))) return false;
  if (headers['sec-fetch-site'] === 'cross-site' || headers['sec-fetch-site'] === 'same-site') return false;
  if ((write || headers.origin) && headers.origin !== `http://${host}` && headers.origin !== `https://${host}`) return false;
  return true;
}

function json(response: ServerResponse, status: number, data: unknown) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { return null; }
}

async function readEdit(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 16_384) {
      request.resume();
      throw new ClipError(413, 'ข้อมูลแก้ไขมีขนาดใหญ่เกินไป');
    }
    chunks.push(chunk);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value && typeof value === 'object') {
      return value as { id?: unknown; revision?: unknown; layout?: unknown; timeMs?: unknown; calibration?: unknown };
    }
  } catch { /* Return the same validation message for malformed input. */ }
  throw new ClipError(400, 'อ่านข้อมูลแก้ไขไม่ได้');
}

function titleFrom(header: string | string[] | undefined): string {
  try {
    const title = typeof header === 'string' ? decodeURIComponent(header) : '';
    return title.replace(/[\\/\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 140) || 'คลิปออฟฟิศ';
  } catch {
    return 'คลิปออฟฟิศ';
  }
}

export async function openMedia(path: string, request: IncomingMessage, response: ServerResponse) {
  const { size } = await stat(path);
  const range = request.headers.range;
  let start = 0;
  let end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && match[1]) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    } else if (match && match[2]) {
      start = Math.max(0, size - Number(match[2]));
    } else {
      start = size;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
  }
  response.writeHead(range ? 206 : 200, {
    'Accept-Ranges': 'bytes',
    'Content-Type': 'video/mp4',
    'Content-Length': end - start + 1,
    'Cache-Control': 'private, no-store',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  if (request.method === 'HEAD') response.end();
  else await pipeline(createReadStream(path, { start, end }), response);
}

export function createCameraClips(root: string, signal: AbortSignal, live: boolean) {
  const directory = resolve(root, '.wdt-data');
  const libraryPath = resolve(directory, 'camera-library.json');
  const clipDirectory = resolve(directory, 'camera-clips');
  let library: Library = readJson<Library>(libraryPath) ?? { draftId: null, publishedId: null, publishedAt: 0 };
  let processing = false;
  let publishing = false;

  function load(id: string | null) {
    return id && CLIP_ID.test(id) ? readJson<SavedClip>(resolve(clipDirectory, id, 'clip.json')) : null;
  }

  let draft = load(library.draftId);
  let published = library.publishedSnapshot ?? load(library.publishedId);

  async function save(next: Library) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${libraryPath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
    await rename(temporary, libraryPath);
    library = next;
  }

  async function detectionsFor(id: string, video: string) {
    const path = resolve(clipDirectory, id, 'detections-v2.json');
    const cached = readJson<CameraPersonDetection[][]>(path);
    if (cached?.length) return cached;
    const detections: CameraPersonDetection[][] = [];
    for await (const boxes of readDetections(root, { type: 'file', path: video }, signal)) detections.push(boxes);
    if (signal.aborted || !detections.length) throw new ClipError(422, 'คลิปนี้ยังไม่มีเฟรมให้พรีวิว');
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(detections), { mode: 0o600 });
    await rename(temporary, path);
    return detections;
  }

  async function generate(rootVideo: string, detections: CameraPersonDetection[][]) {
    if (!hasFloorPlanModels(root)) {
      throw new ClipError(503, 'ยังไม่ได้เตรียมโมเดลสร้างแปลนบน Mac เครื่องนี้');
    }
    try {
      return await generateFloorPlan(root, rootVideo, detections, signal);
    } catch {
      throw new ClipError(422, 'สร้างแปลนจากคลิปนี้ไม่ได้ ลองใช้คลิปที่กล้องอยู่กับที่และเห็นพื้นชัด');
    }
  }

  async function storeDraft(clip: SavedClip, room: string) {
    // Freeze an older publication that refers to clip.json before replacing the draft.
    if (published?.id === clip.id && !library.publishedSnapshot) {
      await save({ ...library, publishedSnapshot: published });
    }
    const temporary = resolve(room, `clip.${process.pid}.tmp`);
    await writeFile(temporary, JSON.stringify(clip), { mode: 0o600 });
    await rename(temporary, resolve(room, 'clip.json'));
    draft = clip;
  }

  async function edit(path: string, request: IncomingMessage) {
    const body = await readEdit(request);
    const clip = draft;
    if (live || processing || publishing || !clip || body.id !== clip.id || body.revision !== (clip.revision ?? 0)) {
      throw new ClipError(409, 'ร่างคลิปเปลี่ยนไปแล้วหรือกำลังทำงานอยู่ ลองเปิดหน้าควบคุมใหม่');
    }
    processing = true;
    try {
      const room = resolve(clipDirectory, clip.id);
      const video = resolve(room, 'video.mp4');
      if (path === CAMERA_GENERATE_SCENE_PATH) {
        const detections = await detectionsFor(clip.id, video);
        const sceneData = await generate(video, detections);
        const revision = (clip.revision ?? 0) + 1;
        const next: SavedClip = { ...clip, revision, needsCalibration: undefined,
          scene: { kind: 'floor-plan', url: `${CAMERA_SCENE_PREFIX}${clip.id}?revision=${revision}` },
          sceneData, replay: createGeneratedReplay(detections, sceneData) };
        await storeDraft(next, room);
        return publicClip(next);
      }
      if (clip.scene) throw new ClipError(409, 'คลิปนี้ใช้ฉากที่สร้างจากวิดีโอ');
      if (path === CAMERA_CHAIRS_PATH) {
        const calibration = body.calibration === undefined ? clip.layout?.calibration : readOfficeCalibration(body.calibration);
        if (calibration === null || (clip.needsCalibration && !calibration)) {
          throw new ClipError(409, 'ปรับเทียบมุมกล้องก่อนค้นหาเก้าอี้บนผัง');
        }
        const time = body.timeMs;
        const duration = clip.replay.frames.length * clip.replay.stepMs;
        if (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time >= duration) {
          throw new ClipError(400, 'เลือกเวลาในคลิปก่อนค้นหาเก้าอี้');
        }
        if (!(await stat(chairModel(root)).catch(() => null))?.isDirectory()) {
          throw new ClipError(503, 'ยังไม่ได้เตรียมโมเดลตรวจเก้าอี้บน Mac เครื่องนี้');
        }
        try {
          return await detectChairs(root, video, time, signal, calibration);
        } catch {
          throw new ClipError(422, 'ค้นหาเก้าอี้จากเฟรมนี้ไม่สำเร็จ ลองหยุดที่เฟรมอื่น');
        }
      }

      const reanalyzing = path === CAMERA_REANALYZE_PATH;
      let layout: OfficeLayout | undefined = clip.layout;
      if (!reanalyzing) {
        const raw = body.layout;
        const withCalibration = clip.layout?.calibration && raw && typeof raw === 'object' && !('calibration' in raw)
          ? { ...raw, calibration: clip.layout.calibration }
          : raw;
        const edited = readOfficeLayout(withCalibration);
        if (!edited) throw new ClipError(400, 'เขตติดตามหรือจุดเก้าอี้อยู่นอกผัง หรือเส้นเขตตัดกัน');
        if (clip.needsCalibration && !edited.calibration) throw new ClipError(409, 'จับคู่จุดบนพื้น 4 จุดเพื่อปรับเทียบมุมใหม่ก่อน');
        layout = edited;
      }
      const needsCalibration = clip.needsCalibration && !layout?.calibration;
      const detections = await detectionsFor(clip.id, video);
      const calibration = layout?.calibration;
      const region = layout ? officeRegion(layout.region, calibration) ?? undefined : undefined;
      const replay = createCameraReplay(detections, needsCalibration ? null : calibration ?? OFFICE_CALIBRATION, region);
      const next: SavedClip = { ...clip, layout, replay, needsCalibration: needsCalibration || undefined, revision: (clip.revision ?? 0) + 1 };
      if (path === CAMERA_LAYOUT_SAVE_PATH || reanalyzing) await storeDraft(next, room);
      return publicClip(next);
    } finally {
      processing = false;
    }
  }

  async function upload(request: IncomingMessage) {
    if (live || processing || publishing) throw new ClipError(409, 'คลิปหรือกล้องกำลังทำงานอยู่ ลองใหม่อีกครั้ง');
    const length = Number(request.headers['content-length']);
    if (!Number.isFinite(length) || length <= 0) throw new ClipError(400, 'เลือกไฟล์วิดีโอก่อนอัปโหลด');
    if (length > MAX_UPLOAD) throw new ClipError(413, 'ไฟล์ต้องมีขนาดไม่เกิน 200 MB');

    processing = true;
    const id = randomBytes(12).toString('hex');
    const room = resolve(clipDirectory, id);
    const raw = resolve(room, 'upload');
    const video = resolve(room, 'video.mp4');
    let committed = false;
    try {
      await mkdir(room, { recursive: true, mode: 0o700 });
      await pipeline(request, createWriteStream(raw, { mode: 0o600 }), { signal });
      await normalizeCameraVideo(raw, video, signal);
      const mode = request.headers['x-camera-angle'];
      const needsCalibration = mode === 'new';
      const detections = await detectionsFor(id, video);
      const sceneData = mode === 'auto' ? await generate(video, detections) : undefined;
      const replay = sceneData ? createGeneratedReplay(detections, sceneData)
        : createCameraReplay(detections, needsCalibration ? null : OFFICE_CALIBRATION);
      const clip: SavedClip = {
        id,
        media: { id, title: titleFrom(request.headers['x-camera-file']), url: `${CAMERA_MEDIA_PREFIX}${id}` },
        replay,
        needsCalibration: needsCalibration || undefined,
        scene: sceneData ? { kind: 'floor-plan', url: `${CAMERA_SCENE_PREFIX}${id}?revision=0` } : undefined,
        sceneData,
      };
      await writeFile(resolve(room, 'clip.json'), JSON.stringify(clip), { mode: 0o600 });
      const previousDraft = draft;
      await save({ ...library, draftId: id });
      draft = clip;
      committed = true;
      if (previousDraft && previousDraft.id !== published?.id) {
        await rm(resolve(clipDirectory, previousDraft.id), { recursive: true, force: true }).catch(() => {});
      }
      return publicClip(clip);
    } finally {
      try {
        if (committed) await rm(raw, { force: true });
        else await rm(room, { recursive: true, force: true });
      } catch {
        console.warn('[camera-twin] Could not clean the temporary local video.');
      }
      processing = false;
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse, path: string) {
    if (path.startsWith(CAMERA_SCENE_PREFIX)) {
      const search = new URL(request.url!, 'http://localhost').search;
      const url = path + search;
      const scene = draft?.scene?.kind === 'floor-plan' && draft.scene.url === url && localOperator(request, false)
        ? draft.sceneData
        : published?.scene?.kind === 'floor-plan' && published.scene.url === url ? published.sceneData : null;
      if (request.method !== 'GET') json(response, 405, { error: 'วิธีเรียกใช้งานไม่ถูกต้อง' });
      else if (!scene) json(response, 404, { error: 'ไม่พบฉาก 3D ของคลิปนี้' });
      else json(response, 200, scene);
      return true;
    }

    if (path.startsWith(CAMERA_MEDIA_PREFIX)) {
      const id = path.slice(CAMERA_MEDIA_PREFIX.length);
      const ownerCanRead = localOperator(request, false) && id === draft?.id;
      if (!CLIP_ID.test(id) || (id !== published?.id && !ownerCanRead)) {
        json(response, 404, { error: 'ไม่พบวิดีโอที่เผยแพร่' });
      } else if (request.method === 'HEAD' || request.method === 'GET') {
        await openMedia(resolve(clipDirectory, id, 'video.mp4'), request, response);
      } else {
        json(response, 405, { error: 'วิธีเรียกใช้งานไม่ถูกต้อง' });
      }
      return true;
    }

    if (![CAMERA_OPERATOR_PATH, CAMERA_UPLOAD_PATH, CAMERA_PUBLISH_PATH, CAMERA_CHAIRS_PATH,
      CAMERA_LAYOUT_PREVIEW_PATH, CAMERA_LAYOUT_SAVE_PATH, CAMERA_REANALYZE_PATH, CAMERA_GENERATE_SCENE_PATH].includes(path)) return false;
    const write = path !== CAMERA_OPERATOR_PATH;
    if (!localOperator(request, write)) {
      json(response, 403, { error: 'เปิดหน้าควบคุมบน Mac ที่ทำงานอยู่' });
    } else if (request.method !== (write ? 'POST' : 'GET')) {
      json(response, 405, { error: 'วิธีเรียกใช้งานไม่ถูกต้อง' });
    } else if (!write) {
      json(response, 200, { draft: draft && publicClip(draft), publishedId: published?.id ?? null, publishedRevision: published?.revision ?? 0, processing });
    } else if (path === CAMERA_UPLOAD_PATH) {
      json(response, 201, await upload(request));
    } else if (path !== CAMERA_PUBLISH_PATH) {
      json(response, 200, await edit(path, request));
    } else {
      const parameters = new URL(request.url!, 'http://localhost').searchParams;
      const revision = parameters.get('revision') ?? '0';
      if (!draft || parameters.get('id') !== draft.id || revision !== String(draft.revision ?? 0) ||
          processing || publishing || live) {
        throw new ClipError(409, 'ร่างนี้ยังเผยแพร่ไม่ได้');
      }
      if (draft.scene && draft.scene.kind !== 'floor-plan') throw new ClipError(409, 'สร้างแปลนจากคลิปนี้ก่อนเผยแพร่');
      if (draft.needsCalibration) throw new ClipError(409, 'บันทึกการปรับเทียบมุมใหม่ก่อนเผยแพร่');
      publishing = true;
      try {
        const previousPublished = published;
        await save({ ...library, publishedId: draft.id, publishedAt: Date.now(), publishedSnapshot: draft });
        published = draft;
        if (previousPublished && previousPublished.id !== published.id) {
          await rm(resolve(clipDirectory, previousPublished.id), { recursive: true, force: true }).catch(() => {});
        }
        json(response, 200, { publishedId: published.id, publishedRevision: published.revision ?? 0 });
      } finally {
        publishing = false;
      }
    }
    return true;
  }

  return {
    published: () => published && ({ ...published, epoch: library.publishedAt }),
    middleware(request: IncomingMessage, response: ServerResponse, path: string, next: () => void) {
      void handle(request, response, path).then((handled) => { if (!handled) next(); }).catch((error: unknown) => {
        if (response.headersSent) {
          if (!response.writableEnded) response.destroy();
        } else {
          const known = error instanceof ClipError || error instanceof CameraVideoError;
          json(response, known ? error.status : 422, {
            error: known ? error.message : 'อ่านหรือวิเคราะห์คลิปไม่ได้ ลองใช้ไฟล์วิดีโออื่น',
          });
        }
      });
    },
  };
}
