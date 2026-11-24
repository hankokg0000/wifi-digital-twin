import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { importPdfRoom, importUsdRoom, PlanImportError } from '../helper/camera/import-room-plan';
import { reconstructWalkthrough } from '../helper/camera/room-walkthrough';
import { planModelDirectory, sceneModel } from '../helper/camera/scenes';
import { referenceScale } from '../src/core/camera/plan-import';
import { roomForMonitor } from '../src/core/camera/room-monitor';
import {
  doorScale, PLAN_IMPORT_MAX_BYTES, ROOM_SCAN_API, ROOM_SCAN_PAGE, SCAN_MAX_BYTES, SCAN_MAX_SECONDS, SCAN_MIN_SECONDS,
  type DoorScale, type ScanDraft,
} from '../src/core/camera/room-scan';
import { localOperator, openMedia } from './camera-clips';

const run = promisify(execFile);
const ID = /^[a-f0-9]{24}$/;
const INVITE_TTL = 60 * 60 * 1000;
const MAX_INVITES = 6;

class ScanError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function respond(response: ServerResponse, status: number, body: unknown) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readScale(request: IncomingMessage): Promise<DoorScale> {
  let body = '';
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    body += chunk.toString();
    if (body.length > 2048) {
      request.resume();
      throw new ScanError(413, 'ข้อมูลระยะอ้างอิงยาวเกินไป');
    }
  }
  try {
    const value = JSON.parse(body) as DoorScale;
    if (value && typeof value.doorId === 'string' && typeof value.widthMeters === 'number') return value;
  } catch { /* An invalid measurement is returned below. */ }
  throw new ScanError(400, 'เลือกประตูและใส่ความกว้างเป็นเมตร');
}

function configuredOrigin() {
  try {
    const url = new URL(process.env.WDT_CAMERA_SCAN_ORIGIN ?? '');
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function createRoomScanner(root: string, signal: AbortSignal) {
  const directory = resolve(root, '.wdt-data', 'room-scans');
  const origin = configuredOrigin();
  const invites = new Map<string, { expiresAt: number; draft: string | null }>();
  const rebuildingModels = new Map<string, Promise<string>>();
  let busy = false;

  async function saveDraft(id: string, draft: ScanDraft) {
    const destination = resolve(directory, id, 'scan.json');
    const temp = `${destination}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(draft), { mode: 0o600 });
      await rename(temp, destination);
    } finally {
      await rm(temp, { force: true });
    }
  }

  async function draftOf(id: string): Promise<ScanDraft | null> {
    try { return JSON.parse(await readFile(resolve(directory, id, 'scan.json'), 'utf8')) as ScanDraft; }
    catch { return null; }
  }

  async function latest() {
    const id = await readFile(resolve(directory, 'latest'), 'utf8').catch(() => '');
    return ID.test(id) ? draftOf(id) : null;
  }

  async function activeRoom() {
    const id = await readFile(resolve(directory, 'active'), 'utf8').catch(() => '');
    if (!ID.test(id)) return null;
    const draft = await draftOf(id);
    if (!draft) return null;
    return roomForMonitor(draft, draft.document?.type === 'usdz' ? `${ROOM_SCAN_API}${id}/model` : undefined);
  }

  async function activate(draft: ScanDraft) {
    const room = roomForMonitor(draft);
    if (!room) throw new ScanError(422, 'เลือกไฟล์ที่สร้างแปลน 3D ได้ก่อนใช้ห้องนี้');
    if (draft.document?.type === 'usdz') await roomModel(draft.id);
    const temp = resolve(directory, `active-${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(temp, draft.id, { mode: 0o600 });
      await rename(temp, resolve(directory, 'active'));
    } finally {
      await rm(temp, { force: true });
    }
    return room;
  }

  async function saveLatest(id: string, draft: ScanDraft) {
    await saveDraft(id, draft);
    const temp = resolve(directory, `latest.${id}.tmp`);
    try {
      await writeFile(temp, id, { mode: 0o600 });
      await rename(temp, resolve(directory, 'latest'));
    } finally {
      await rm(temp, { force: true });
    }
  }

  function documentName(request: IncomingMessage, type: 'pdf' | 'usdz') {
    const value = request.headers['x-plan-name'];
    if (typeof value !== 'string' || value.length > 1200) return `แปลนห้อง.${type}`;
    try {
      return decodeURIComponent(value).replace(/[\p{Cc}\p{Cf}]/gu, '').split(/[\\/]/).at(-1)?.trim().slice(-160) || `แปลนห้อง.${type}`;
    } catch {
      return `แปลนห้อง.${type}`;
    }
  }

  async function roomModel(id: string) {
    const room = resolve(directory, id);
    const path = resolve(room, 'model.json');
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const pending = rebuildingModels.get(id);
    if (pending) return await pending;
    const rebuild = (async () => {
      const scratch = await mkdtemp(resolve(room, '.model-'));
      try {
        const { model } = await importUsdRoom(resolve(room, 'source.usdz'), scratch, signal);
        const data = JSON.stringify(model);
        const temp = resolve(scratch, 'model.json');
        await writeFile(temp, data, { mode: 0o600 });
        await rename(temp, path);
        return data;
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    })();
    rebuildingModels.set(id, rebuild);
    try {
      return await rebuild;
    } finally {
      rebuildingModels.delete(id);
    }
  }

  async function importDocument(request: IncomingMessage, type: 'pdf' | 'usdz', previous?: ScanDraft) {
    if (busy) throw new ScanError(409, 'กำลังสร้างแปลนอยู่ ลองอีกครั้งเมื่อเสร็จ');
    const bytes = Number(request.headers['content-length']);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new ScanError(400, 'เลือกไฟล์แปลนก่อนอัปโหลด');
    if (bytes > PLAN_IMPORT_MAX_BYTES) throw new ScanError(413, 'ไฟล์แปลนต้องมีขนาดไม่เกิน 25 MB');
    busy = true;
    const id = previous?.id ?? randomBytes(12).toString('hex');
    const room = resolve(directory, id);
    const scratch = resolve(room, 'import-temp');
    const raw = resolve(scratch, `source.${type}`);
    const preview = resolve(scratch, 'preview');
    let saved = false;
    try {
      await mkdir(scratch, { recursive: true, mode: 0o700 });
      await pipeline(request, createWriteStream(raw, { mode: 0o600 }), { signal });
      const name = documentName(request, type);
      if (previous?.document && previous.plan) {
        const pdf = await importPdfRoom(raw, preview, signal);
        if (!pdf) throw new ScanError(422, 'อ่านขนาดจาก PDF นี้ไม่ได้ ให้ใช้ Sketch PDF ของห้องเดียวกัน');
        const scale = referenceScale(previous.plan.visibleFloor, pdf.plan.visibleFloor);
        if (scale === null) throw new ScanError(422, 'รูปทรงใน PDF ไม่ตรงกับโมเดล USDZ กรุณาเลือกแปลนของห้องเดียวกัน');
        const view = `reference-${randomBytes(6).toString('hex')}.png`;
        const path = resolve(room, view);
        const draft: ScanDraft = { ...previous, document: {
          ...previous.document, preview: view, referenceName: name, areaMeters: pdf.area, metersPerUnit: scale,
        } };
        await rename(`${preview}.png`, path);
        try {
          await saveDraft(id, draft);
        } catch (error) {
          await rm(path, { force: true });
          throw error;
        }
        if (previous.document.preview) await rm(resolve(room, previous.document.preview), { force: true }).catch(() => {});
        return draft;
      }

      const pdf = type === 'pdf' ? await importPdfRoom(raw, preview, signal) : null;
      const usd = type === 'usdz' ? await importUsdRoom(raw, scratch, signal) : null;
      const draft: ScanDraft = {
        id, plan: usd?.plan ?? pdf?.plan ?? null, doors: [], issues: [], recordedSeconds: 0, registeredFrames: 0, attemptedFrames: 0,
        document: { type, name, ...(type === 'pdf' ? { preview: 'preview.png' } : {}),
          ...(pdf ? { areaMeters: pdf.area, metersPerUnit: 1 } : {}) },
      };
      if (type === 'pdf') await rename(`${preview}.png`, resolve(room, 'preview.png'));
      if (usd) await writeFile(resolve(room, 'model.json'), JSON.stringify(usd.model), { mode: 0o600 });
      await rename(raw, resolve(room, `source.${type}`));
      await saveLatest(id, draft);
      saved = true;
      return draft;
    } catch (error) {
      if (error instanceof ScanError || error instanceof PlanImportError) throw error;
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') throw new ScanError(503, 'เครื่องนี้ยังขาดโปรแกรมอ่านไฟล์แปลน');
      throw new ScanError(422, 'เปิดไฟล์แปลนนี้ไม่ได้ ลองส่งออกไฟล์ใหม่จาก magicplan');
    } finally {
      try {
        await rm(saved || previous ? scratch : room, { recursive: true, force: true });
      } finally {
        busy = false;
      }
    }
  }

  async function upload(request: IncomingMessage) {
    if (busy) throw new ScanError(409, 'กำลังสร้างแปลนอยู่ ลองอีกครั้งเมื่อเสร็จ');
    const bytes = Number(request.headers['content-length']);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new ScanError(400, 'เลือกคลิปเดินถ่ายห้องก่อนอัปโหลด');
    if (bytes > SCAN_MAX_BYTES) throw new ScanError(413, 'คลิปต้องมีขนาดไม่เกิน 180 MB');
    const model = planModelDirectory(root);
    if (!['segformer.onnx', 'labels.json', 'venv/bin/python'].every((name) => existsSync(resolve(model, name))) ||
        !existsSync(sceneModel(root))) throw new ScanError(503, 'เครื่องนี้ยังไม่ได้เตรียมโมเดลสแกนห้อง');

    busy = true;
    const id = randomBytes(12).toString('hex');
    const room = resolve(directory, id);
    const raw = resolve(room, 'upload');
    const video = resolve(room, 'video.mp4');
    const cache = resolve(room, 'scratch');
    let saved = false;
    try {
      await mkdir(cache, { recursive: true, mode: 0o700 });
      await pipeline(request, createWriteStream(raw, { mode: 0o600 }), { signal });
      const probe = async (path: string) => {
        const { stdout } = await run('ffprobe', [
          '-v', 'error', '-protocol_whitelist', 'file,crypto', '-format_whitelist', 'mov,matroska',
          '-select_streams', 'v:0', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', path,
        ], { signal, timeout: 15000 });
        const info = JSON.parse(stdout) as { streams?: unknown[]; format?: { duration?: string } };
        if (!info.streams?.length) throw new ScanError(422, 'อ่านวิดีโอจากไฟล์นี้ไม่ได้');
        return Number(info.format?.duration);
      };
      function validateDuration(duration: number) {
        if (duration < SCAN_MIN_SECONDS || duration > SCAN_MAX_SECONDS) {
          throw new ScanError(422, `ความยาวคลิปต้องอยู่ระหว่าง ${SCAN_MIN_SECONDS} ถึง ${SCAN_MAX_SECONDS} วินาที`);
        }
      }
      const sourceDuration = await probe(raw);
      if (Number.isFinite(sourceDuration)) validateDuration(sourceDuration);
      await run('ffmpeg', [
        '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,crypto', '-format_whitelist', 'mov,matroska',
        '-i', raw, '-map', '0:v:0', '-map_metadata', '-1', '-vf', "scale=w='min(960,iw)':h=-2,setsar=1,fps=24",
        '-t', String(SCAN_MAX_SECONDS + 1), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video,
      ], { signal, timeout: 140_000 });
      // Some browser recorders omit duration in a WebM header. The normalized MP4 has it.
      const duration = await probe(video);
      if (!Number.isFinite(duration)) throw new ScanError(422, 'อ่านความยาวคลิปไม่ได้');
      validateDuration(duration);
      const result = await reconstructWalkthrough(root, video, cache, duration, signal);
      const draft = { id, ...result };
      await saveLatest(id, draft);
      saved = true;
      return draft;
    } finally {
      try {
        if (saved) {
          await Promise.all([rm(raw, { force: true }), rm(cache, { recursive: true, force: true })]);
        } else await rm(room, { recursive: true, force: true });
      } finally {
        busy = false;
      }
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse, path: string) {
    const route = path.slice(ROOM_SCAN_API.length);
    const { method, headers } = request;
    const write = method !== 'GET' && method !== 'HEAD';
    const owner = localOperator(request, write);
    const token = /^Bearer ([a-f0-9]{64})$/.exec(headers.authorization ?? '')?.[1];
    const invited = token && origin && (!headers.origin || headers.origin === origin) && (!write || headers.origin === origin)
      ? invites.get(token) : undefined;
    const access = invited && invited.expiresAt > Date.now() ? invited : undefined;
    if (!owner && !access) throw new ScanError(403, 'เปิดจาก Mac หรือใช้ลิงก์สแกนส่วนตัว');

    if (route === 'access' && method === 'GET') {
      respond(response, 200, { owner, canInvite: owner && Boolean(origin), busy, draft: owner ? await latest() : access?.draft ? await draftOf(access.draft) : null });
    } else if (route === 'access' && method === 'POST' && owner) {
      if (!origin) throw new ScanError(409, 'ต้องกำหนด URL HTTPS ของ Camera Twin สำหรับมือถือก่อน');
      for (const [key, invitation] of invites) if (invitation.expiresAt <= Date.now()) invites.delete(key);
      if (invites.size >= MAX_INVITES) throw new ScanError(429, 'มีลิงก์สแกนที่ยังใช้งานอยู่หลายลิงก์');
      const key = randomBytes(32).toString('hex');
      invites.set(key, { expiresAt: Date.now() + INVITE_TTL, draft: null });
      respond(response, 201, { url: `${origin}${ROOM_SCAN_PAGE}#scan=${key}` });
    } else if (route === 'upload' && method === 'POST') {
      const draft = await upload(request);
      if (access) access.draft = draft.id;
      respond(response, 201, draft);
    } else if ((route === 'import/pdf' || route === 'import/usdz') && method === 'POST') {
      const draft = await importDocument(request, route === 'import/pdf' ? 'pdf' : 'usdz');
      if (access) access.draft = draft.id;
      respond(response, 201, draft);
    } else {
      const [id = '', action, extra] = route.split('/');
      if (!ID.test(id) || extra || (!owner && access?.draft !== id)) throw new ScanError(404, 'ไม่พบร่างแปลน');
      const previous = await draftOf(id);
      if (!previous) throw new ScanError(404, 'ไม่พบร่างแปลน');
      if (!previous.document && action === 'video' && (method === 'GET' || method === 'HEAD')) {
        await openMedia(resolve(directory, id, 'video.mp4'), request, response);
      } else if (action === 'preview' && method === 'GET' && previous.document?.preview) {
        const image = await readFile(resolve(directory, id, previous.document.preview));
        response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(image);
      } else if (action === 'model' && method === 'GET' && previous.document?.type === 'usdz') {
        const data = await roomModel(id);
        if (response.destroyed || response.writableEnded) return;
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' });
        response.end(data);
      } else if (action === 'activate' && method === 'POST' && owner) {
        respond(response, 200, await activate(previous));
      } else if (action === 'reference' && method === 'POST' && previous.document?.type === 'usdz' && previous.plan) {
        respond(response, 200, await importDocument(request, 'pdf', previous));
      } else if (!previous.document && action === 'scale' && method === 'POST') {
        const scale = await readScale(request);
        if (doorScale(previous.doors, scale) === null) throw new ScanError(400, 'เลือกประตูที่ตรวจพบและใส่ความกว้าง 0.20–5 เมตร');
        const draft = { ...previous, scale };
        await saveDraft(id, draft);
        respond(response, 200, draft);
      } else throw new ScanError(404, 'ไม่พบหน้านี้');
    }
  }

  function middleware(request: IncomingMessage, response: ServerResponse, path: string) {
    void handle(request, response, path).catch((error: unknown) => {
      if (response.headersSent) {
        if (!response.writableEnded) response.destroy();
        return;
      }
      const known = error instanceof ScanError || error instanceof PlanImportError;
      if (!known) console.warn('[room-scan] Processing a local scan failed:', error instanceof Error ? error.message.split('\n').filter(Boolean).at(-1)?.slice(0, 160) : 'unknown error');
      respond(response, known ? error.status : 422, {
        error: known ? error.message : 'เปิดหรือวิเคราะห์คลิปไม่ได้ ลองถ่ายใหม่หรือใช้ไฟล์ MP4',
      });
    });
  }
  return { activeRoom, middleware };
}
