import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Plugin, ViteDevServer } from 'vite';
import { ROOM_SCAN_API } from '../src/core/camera/room-scan';
import { ROOM_MONITOR_API } from '../src/core/camera/room-monitor';
import { createRoomScanner } from './camera-room-scan';
import { createRoomMonitor } from './camera-room-monitor';
import { createIndoorWifi } from './indoor-wifi';
import { createWifiCsiMonitor } from '../helper/camera/wifi-csi';
import { createEspCsiMonitor } from '../helper/camera/esp32-csi';
import { INDOOR_WIFI_API } from '../src/core/camera/csi-monitor';
import { DEMO_AREAS } from '../src/core/camera/site-demo';
import { createCameraClips } from './camera-clips';
import { readDetections } from '../helper/camera/frames';
import {
  CAMERA_API, CAMERA_SNAPSHOT_PATH, CAMERA_STEP_MS, CAMERA_STREAM_PATH, INDOOR_CLIP_API, replaySnapshot, type CameraReplay, type CameraSnapshot,
} from '../src/core/camera/feed';
import { createCameraTracker, type CameraTrackingFrame, type FloorCalibration } from '../src/core/camera/tracking';

function loadReplay(root: string): CameraReplay | null {
  try {
    const replay = JSON.parse(readFileSync(resolve(root, '.wdt-data/camera-replay.json'), 'utf8')) as CameraReplay;
    if (replay.version === 1 && replay.stepMs === CAMERA_STEP_MS
      && Array.isArray(replay.frames) && replay.frames.length > 0) return replay;
  } catch {
    // The viewer can open before a replay is prepared.
  }
  return null;
}

function feed(root: string, httpServer: ViteDevServer['httpServer']) {
  const rtsp = process.env.WDT_CAMERA_RTSP;
  const source = rtsp ? 'camera' : 'replay';
  const replay = rtsp ? null : loadReplay(root);
  const epoch = Date.now();
  const abort = new AbortController();
  const clips = createCameraClips(root, abort.signal, Boolean(rtsp));
  const indoor = new Map(DEMO_AREAS.map(({ id }) => [id, createCameraClips(root, abort.signal, false, id)]));
  const esp32 = createEspCsiMonitor();
  const indoorWifi = createIndoorWifi(createWifiCsiMonitor(abort.signal));
  const scanner = createRoomScanner(root, abort.signal);
  const monitor = createRoomMonitor(root, scanner.activeRoom, abort.signal, esp32);
  let area: FloorCalibration['floor'] | null = null;
  let latest: CameraTrackingFrame | null = null;
  let lastFrame = 0;
  const viewers = new Set<ServerResponse>();

  async function watchCamera(url: string) {
    if (!/^rtsps?:\/\//i.test(url)) throw new Error('WDT_CAMERA_RTSP must be an RTSP URL');
    const calibrationFile = process.env.WDT_CAMERA_CALIBRATION;
    if (!calibrationFile) throw new Error('WDT_CAMERA_CALIBRATION must point to the camera floor calibration');
    const calibration = JSON.parse(readFileSync(calibrationFile, 'utf8')) as FloorCalibration;
    // Check before starting or publishing the camera's floor polygon.
    createCameraTracker(calibration);
    area = calibration.floor;
    while (!abort.signal.aborted) {
      const tracker = createCameraTracker(calibration);
      try {
        for await (const detections of readDetections(root, { type: 'rtsp', url }, abort.signal)) {
          latest = tracker.update(performance.now(), detections);
          lastFrame = Date.now();
        }
      } catch {
        if (abort.signal.aborted) break;
        console.warn('[camera-twin] Could not read RTSP frames. Reconnecting.');
      }
      latest = null;
      lastFrame = 0;
      if (!abort.signal.aborted) await delay(2_000, undefined, { signal: abort.signal });
    }
  }

  if (rtsp && process.env.WDT_CAMERA_CALIBRATION) void watchCamera(rtsp).catch(() => {
    if (!abort.signal.aborted) console.warn('[camera-twin] Check the local RTSP and calibration settings.');
  });

  function snapshotFromSource(): CameraSnapshot {
    const now = Date.now();
    const fresh = now - lastFrame < 2_000;
    const published = !rtsp && clips.published();
    if (published) return {
      ...replaySnapshot(published.replay, published.epoch, now),
      media: published.media, layout: published.layout, scene: published.scene,
    };
    return replay ? replaySnapshot(replay, epoch, now) : {
      source,
      state: rtsp ? (fresh ? 'ready' : 'offline') : 'waiting',
      track: rtsp && fresh ? latest?.track ?? null : null,
      imageDetection: rtsp && fresh ? latest?.imageDetection ?? null : null,
      area,
      elapsedMs: null,
      durationMs: null,
      media: null,
    };
  }

  function send(viewer?: ServerResponse) {
    if (!viewer && !viewers.size) return;
    const chunk = `data: ${JSON.stringify(snapshotFromSource())}\n\n`;
    for (const response of viewer ? [viewer] : viewers) {
      if (!response.writableNeedDrain && !response.writableEnded) response.write(chunk);
    }
  }
  const interval = setInterval(send, CAMERA_STEP_MS);
  interval.unref();
  httpServer?.once('close', () => {
    abort.abort();
    clearInterval(interval);
  });

  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = request.url?.split('?')[0];
    if (path?.startsWith(INDOOR_WIFI_API)) {
      indoorWifi.handle(request, response, path);
      return;
    }
    if (path?.startsWith(INDOOR_CLIP_API + '/')) {
      const slug = path.startsWith(INDOOR_CLIP_API + '/areas/') ? path.slice((INDOOR_CLIP_API + '/areas/').length).split('/')[0] : 'office';
      const room = DEMO_AREAS.find(({ id }) => id === slug);
      const library = room && indoor.get(room.id);
      if (library) library.middleware(request, response, path, next);
      else next();
      return;
    }
    if (path?.startsWith(ROOM_MONITOR_API)) {
      monitor(request, response, path);
      return;
    }
    if (path?.startsWith(ROOM_SCAN_API)) {
      scanner.middleware(request, response, path);
      return;
    }
    if (path !== CAMERA_STREAM_PATH && path !== CAMERA_SNAPSHOT_PATH) {
      if (path?.startsWith(CAMERA_API + '/')) clips.middleware(request, response, path, next);
      else next();
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' }).end();
      return;
    }
    if (path === CAMERA_SNAPSHOT_PATH) {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      }).end(JSON.stringify(snapshotFromSource()));
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    response.on('close', () => viewers.delete(response));
    viewers.add(response);
    send(response);
  };
}

export function cameraTwinPlugin(): Plugin {
  return {
    name: 'camera-twin',
    configureServer(server) {
      server.middlewares.use(feed(server.config.root, server.httpServer));
    },
    configurePreviewServer(server) {
      server.middlewares.use(feed(server.config.root, server.httpServer));
    },
  };
}
