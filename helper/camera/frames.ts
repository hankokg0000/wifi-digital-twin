import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { CAMERA_FPS, CAMERA_VIDEO_FPS } from '../../src/core/camera/feed';
import type { CameraPersonDetection, FloorCalibration } from '../../src/core/camera/tracking';

export const WIDTH = 960;
export const HEIGHT = 540;
export const FRAME_LAYOUT = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
const run = promisify(execFile);
const LOCAL_VIDEO = ['-protocol_whitelist', 'file,crypto', '-format_whitelist', 'mov,matroska'];

export class CameraVideoError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function normalizeCameraVideo(raw: string, video: string, signal: AbortSignal) {
  const probe = await run('ffprobe', [
    '-v', 'error', ...LOCAL_VIDEO, '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', raw,
  ], { signal, timeout: 15_000 });
  const info = JSON.parse(probe.stdout) as { streams?: unknown[]; format?: { duration?: string } };
  const duration = Number(info.format?.duration);
  if (!info.streams?.length || !Number.isFinite(duration) || duration <= 0) {
    throw new CameraVideoError(422, 'อ่านวิดีโอจากไฟล์นี้ไม่ได้');
  }
  if (duration > 180) throw new CameraVideoError(413, 'คลิปต้องยาวไม่เกิน 3 นาที');
  await run('ffmpeg', [
    '-nostdin', '-v', 'error', ...LOCAL_VIDEO, '-i', raw, '-map', '0:v:0',
    '-map_metadata', '-1', '-vf', `${FRAME_LAYOUT},fps=${CAMERA_VIDEO_FPS}`, '-an', '-c:v', 'libx264',
    '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video,
  ], { signal, timeout: 160_000 });
}

type CameraInput =
  | { type: 'file'; path: string; start?: number; duration?: number }
  | { type: 'rtsp'; url: string };

function visionExecutable(root: string): string {
  const directory = resolve(root, '.wdt-data');
  const binary = resolve(directory, 'camera-person-detector');
  const source = resolve(root, 'helper/camera/person-detector.swift');
  if ((statSync(binary, { throwIfNoEntry: false })?.mtimeMs ?? 0) >= statSync(source).mtimeMs) {
    return binary;
  }
  mkdirSync(directory, { recursive: true });
  execFileSync('swiftc', ['-O', source, '-o', binary], {
    env: { ...process.env, CLANG_MODULE_CACHE_PATH: resolve(directory, 'swift-modules') },
    stdio: 'ignore',
  });
  return binary;
}

function waitForExit(child: ReturnType<typeof spawn>) {
  return new Promise<boolean>((done) => {
    child.once('error', () => done(false));
    child.once('close', (code) => done(code === 0));
  });
}

type MonitorFrame = { detections: CameraPersonDetection[]; marker?: FloorCalibration['image']; jpeg: string };

async function* readVision<T>(root: string, input: CameraInput, monitor: boolean, signal?: AbortSignal) {
  const vision = visionExecutable(root);
  const source = input.type === 'file'
    ? [...(input.start === undefined ? [] : ['-ss', String(input.start)]), '-i', input.path,
        ...(input.duration === undefined ? [] : ['-t', String(input.duration)])]
    : ['-rtsp_transport', 'tcp', '-timeout', '5000000', '-i', input.url];
  const decoder = spawn('ffmpeg', [
    '-nostdin', '-v', 'error', ...source, '-map', '0:v:0',
    '-vf', `fps=${CAMERA_FPS},${FRAME_LAYOUT}`,
    '-an', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'], signal });
  const detector = spawn(vision, [String(WIDTH), String(HEIGHT), ...(monitor ? ['--monitor'] : [])], {
    stdio: ['pipe', 'pipe', 'ignore'], signal,
  });
  const completed = Promise.all([
    waitForExit(decoder),
    waitForExit(detector),
    pipeline(decoder.stdout, detector.stdin).then(() => true, () => false),
  ]);
  const lines = createInterface({ input: detector.stdout, crlfDelay: Infinity });
  let drained = false;
  try {
    for await (const line of lines) {
      yield JSON.parse(line) as T;
    }
    drained = true;
  } finally {
    lines.close();
    if (!drained) {
      decoder.kill();
      detector.kill();
    }
    const results = await completed;
    if (drained && !signal?.aborted && results.some((ok) => !ok)) {
      throw new Error('FFmpeg or Apple Vision stopped while reading camera frames');
    }
  }
}

export function readDetections(root: string, input: CameraInput, signal?: AbortSignal) {
  return readVision<CameraPersonDetection[]>(root, input, false, signal);
}

export function readMonitorFrames(root: string, input: CameraInput, signal: AbortSignal) {
  return readVision<MonitorFrame>(root, input, true, signal);
}
