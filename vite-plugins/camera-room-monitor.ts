import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createEspCsiMonitor } from '../helper/camera/esp32-csi';
import { CameraVideoError, normalizeCameraVideo, readDetections, readMonitorFrames } from '../helper/camera/frames';
import { createSceneTracker } from '../src/core/camera/generated-scene';
import {
  ROOM_MONITOR_API, boardPlacements, roomProjector, validBoardImage,
  type MonitorDemo, type MonitorRoom, type MonitorStatus, type RoomCameraSource, type RoomWifiSource,
} from '../src/core/camera/room-monitor';
import type { FloorCalibration } from '../src/core/camera/tracking';
import { localOperator, openMedia } from './camera-clips';

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const LIVE_FRAME_AGE = 2_200;
const ID = /^[0-9a-f]{24}$/;

interface SavedDemo extends MonitorDemo {
  id: string;
  title: string;
}
interface SavedCalibration {
  key: string;
  placement: number;
  calibration: FloorCalibration;
}

class MonitorError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { return null; }
}

function sendJson(response: ServerResponse, status: number, data: unknown) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

function filename(request: IncomingMessage) {
  const name = request.headers['x-camera-file'];
  try {
    if (typeof name === 'string' && name.length <= 1600) {
      return decodeURIComponent(name).replace(/[\\/\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, 140) || 'คลิปเดโม';
    }
  } catch { /* The track is usable without a filename. */ }
  return 'คลิปเดโม';
}

export function createRoomMonitor(root: string, activeRoom: () => Promise<MonitorRoom | null>, signal: AbortSignal) {
  const directory = resolve(root, '.wdt-data', 'room-monitor');
  const demoPath = resolve(directory, 'demo.json');
  const prefsPath = resolve(directory, 'preferences.json');
  const urlValue = process.env.WDT_ROOM_CAMERA_RTSP ?? process.env.WDT_CAMERA_RTSP;
  const rtsp = urlValue && /^rtsps?:\/\//i.test(urlValue) ? urlValue : null;
  const saved = readJson<{ camera?: RoomCameraSource; wifi?: RoomWifiSource }>(prefsPath);
  let camera: RoomCameraSource = saved?.camera === 'live' && rtsp ? 'live' : 'demo';
  let wifi: RoomWifiSource = saved?.wifi === 'esp32' ? 'esp32' : 'simulated';
  let demo = readJson<SavedDemo>(demoPath);
  let uploading = false;
  let simulatedUntil = 0;
  const esp32 = createEspCsiMonitor();

  let roomKey = '';
  let room: MonitorRoom | null = null;
  let running: AbortController | null = null;
  let liveStarted = 0;
  let lastFrame = 0;
  let frame: MonitorStatus['frame'] = null;
  let placementIndex = 0;
  let calibration: FloorCalibration | null = null;
  let looking = false;
  let stableBoard: { image: FloorCalibration['image']; frames: number; at: number } | null = null;
  let placements: ReturnType<typeof boardPlacements> = [];
  let track = createSceneTracker(() => null);

  function save(path: string, value: unknown) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temp = path + '.tmp';
    writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
    renameSync(temp, path);
  }

  function setPreferences(nextCamera: RoomCameraSource, nextWifi: RoomWifiSource) {
    save(prefsPath, { camera: nextCamera, wifi: nextWifi });
    camera = nextCamera;
    wifi = nextWifi;
    simulatedUntil = 0;
  }

  function calibrationPath() {
    return resolve(directory, `camera-${room?.id}.json`);
  }

  function calibrationKey() {
    return createHash('sha256').update(JSON.stringify([rtsp, roomKey])).digest('hex');
  }

  function assignCalibration(value: FloorCalibration | null) {
    calibration = value;
    track = createSceneTracker(room ? roomProjector(value, room.plan) : () => null);
    if (frame) frame = { ...frame, observations: [] };
  }

  function stopLive() {
    running?.abort();
    running = null;
    liveStarted = 0;
    lastFrame = 0;
    frame = null;
    stableBoard = null;
  }

  function observeBoard(image: FloorCalibration['image'], now: number) {
    const placement = placements[placementIndex];
    if (!looking || !placement || !validBoardImage(image)) return;
    const same = stableBoard && now - stableBoard.at < 1_250 &&
      stableBoard.image.every(([x, y], i) => Math.hypot(x - image[i]![0], y - image[i]![1]) < 0.007);
    stableBoard = { image, frames: same ? stableBoard!.frames + 1 : 1, at: now };
    if (stableBoard.frames < 3) return;
    const candidate = { image, floor: placement.points };
    // Validate before persisting or allowing positions on the plan.
    const project = roomProjector(candidate, room!.plan);
    if (image.some((point) => !project(point))) {
      stableBoard = null;
      return;
    }
    save(calibrationPath(), { key: calibrationKey(), placement: placementIndex, calibration: candidate } satisfies SavedCalibration);
    assignCalibration(candidate);
    looking = false;
    stableBoard = null;
  }

  async function watchLive(url: string, controller: AbortController) {
    const life = AbortSignal.any([signal, controller.signal]);
    while (!life.aborted) {
      try {
        for await (const next of readMonitorFrames(root, { type: 'rtsp', url }, life)) {
          if (life.aborted) break;
          const now = Date.now();
          if (next.marker) observeBoard(next.marker, now);
          frame = { jpeg: next.jpeg, observations: track(next.detections) };
          lastFrame = now;
        }
      } catch {
        // Do not include camera URLs or credentials in logs.
      }
      if (!life.aborted) {
        frame = null;
        lastFrame = 0;
        stableBoard = null;
        assignCalibration(calibration);
        await delay(1_200, undefined, { signal: life });
      }
    }
  }

  function sync(next: MonitorRoom | null) {
    const key = next ? `${next.id}:${next.metersPerUnit ?? ''}` : '';
    if (key !== roomKey) {
      stopLive();
      esp32.setEnabled(false);
      simulatedUntil = 0;
      room = next;
      roomKey = key;
      placements = room ? boardPlacements(room) : [];
      looking = false;
      placementIndex = 0;
      assignCalibration(null);
      const prior = next && rtsp ? readJson<SavedCalibration>(calibrationPath()) : null;
      if (prior?.key === calibrationKey() && placements[prior.placement] &&
          validBoardImage(prior.calibration.image)) {
        placementIndex = prior.placement;
        assignCalibration(prior.calibration);
      }
    }
    if (room && rtsp && camera === 'live' && !running) {
      running = new AbortController();
      liveStarted = Date.now();
      void watchLive(rtsp, running).catch(() => {});
    } else if ((!room || camera !== 'live') && running) stopLive();
    esp32.setEnabled(Boolean(room && wifi === 'esp32'));
  }

  signal.addEventListener('abort', () => { stopLive(); esp32.setEnabled(false); }, { once: true });

  function snapshot(): MonitorStatus {
    const now = Date.now();
    const fresh = lastFrame > 0 && now - lastFrame < LIVE_FRAME_AGE;
    return {
      roomId: room?.id ?? null, camera, liveAvailable: Boolean(rtsp),
      liveState: fresh ? 'ready' : liveStarted && now - liveStarted < 6_000 ? 'connecting' : 'offline',
      demo: demo ? { id: demo.id, title: demo.title, url: `${ROOM_MONITOR_API}video/${demo.id}` } : null,
      uploading, frame: camera === 'live' && fresh ? frame : null,
      calibration: !placements.length ? 'unscaled' : calibration ? 'ready' : looking ? 'looking' : 'choose',
      placement: placements[placementIndex] ?? null, placements: placements.length,
      wifi: wifi === 'esp32' ? { source: wifi, ...esp32.status(now) }
        : { source: wifi, state: now < simulatedUntil ? 'motion' : 'idle' },
    };
  }

  async function upload(request: IncomingMessage) {
    if (uploading) throw new MonitorError(409, 'กำลังวิเคราะห์คลิปเดโมอยู่');
    const bytes = Number(request.headers['content-length']);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new MonitorError(400, 'เลือกไฟล์คลิปเดโมก่อน');
    if (bytes > MAX_VIDEO_BYTES) throw new MonitorError(413, 'ไฟล์ต้องมีขนาดไม่เกิน 200 MB');
    uploading = true;
    const id = randomBytes(12).toString('hex');
    const folder = resolve(directory, id);
    const raw = resolve(folder, 'upload');
    const video = resolve(folder, 'video.mp4');
    let stored = false;
    try {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await pipeline(request, createWriteStream(raw, { mode: 0o600 }), { signal });
      await normalizeCameraVideo(raw, video, signal);
      const observe = createSceneTracker(() => null, true);
      const frames: MonitorDemo['frames'] = [];
      for await (const detections of readDetections(root, { type: 'file', path: video }, signal)) frames.push(observe(detections));
      if (!frames.length) throw new MonitorError(422, 'คลิปนี้ไม่มีเฟรมให้แสดงผล');
      const next = { id, title: filename(request), frames };
      save(demoPath, next);
      const previous = demo;
      demo = next;
      stored = true;
      if (previous && ID.test(previous.id)) await rm(resolve(directory, previous.id), { recursive: true, force: true }).catch(() => {});
    } finally {
      try {
        if (stored) await rm(raw, { force: true });
        else await rm(folder, { force: true, recursive: true });
      } finally {
        uploading = false;
      }
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse, path: string) {
    const get = request.method === 'GET' || request.method === 'HEAD';
    if (!localOperator(request, !get)) throw new MonitorError(403, 'เปิด Camera Twin จาก Mac ที่รันไว้');
    const route = path.slice(ROOM_MONITOR_API.length);
    const selected = await activeRoom();
    sync(selected);
    if (route === 'room' && request.method === 'GET') {
      sendJson(response, 200, selected);
      return;
    }
    if (!selected) throw new MonitorError(404, 'เลือกห้องที่ต้องการใช้ก่อน');
    if (route === 'status' && request.method === 'GET') {
      sendJson(response, 200, snapshot());
      return;
    }
    if (route.startsWith('video/') && get && demo?.id === route.slice(6) && ID.test(demo.id)) {
      await openMedia(resolve(directory, demo.id, 'video.mp4'), request, response);
      return;
    }
    if (route.startsWith('observations/') && request.method === 'GET' && demo?.id === route.slice(13)) {
      sendJson(response, 200, { frames: demo?.frames ?? [] } satisfies MonitorDemo);
      return;
    }
    if (request.method !== 'POST') throw new MonitorError(404, 'ไม่พบข้อมูลที่ขอ');
    if (route === 'upload') {
      await upload(request);
      setPreferences('demo', wifi);
    } else if (route === 'camera/demo' || route === 'camera/live') {
      if (route === 'camera/live' && !rtsp) throw new MonitorError(409, 'ยังไม่ได้ตั้ง URL กล้อง RTSP บน Mac');
      setPreferences(route === 'camera/live' ? 'live' : 'demo', wifi);
      if (camera !== 'live') looking = false;
    } else if (route === 'wifi/simulated' || route === 'wifi/esp32') {
      setPreferences(camera, route === 'wifi/esp32' ? 'esp32' : 'simulated');
    } else if (route === 'wifi/test' && wifi === 'simulated') {
      simulatedUntil = Date.now() + 8_000;
    } else if (route === 'wifi/baseline' && wifi === 'esp32') {
      if (!esp32.baseline(Date.now())) throw new MonitorError(409, 'รอข้อมูลจาก ESP32 ก่อนเริ่มบันทึก');
    } else if (route === 'board/next' && placements.length > 1 && !calibration) {
      placementIndex = (placementIndex + 1) % placements.length;
      stableBoard = null;
    } else if (route === 'board/align' && camera === 'live' && placements.length) {
      save(calibrationPath(), null);
      assignCalibration(null);
      looking = true;
      stableBoard = null;
    } else {
      throw new MonitorError(404, 'ใช้คำสั่งนี้กับสถานะปัจจุบันไม่ได้');
    }
    sync(await activeRoom());
    sendJson(response, 200, snapshot());
  }

  return (request: IncomingMessage, response: ServerResponse, path: string) => {
    void handle(request, response, path).catch((error: unknown) => {
      if (response.headersSent) {
        if (!response.writableEnded) response.destroy();
        return;
      }
      const known = error instanceof MonitorError || error instanceof CameraVideoError;
      sendJson(response, known ? error.status : 422, { error: known ? error.message : 'เปิดข้อมูลไม่ได้ ลองตรวจไฟล์หรือการเชื่อมต่อ' });
    });
  };
}
