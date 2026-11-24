import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { chairSuggestions } from '../../src/core/camera/office-layout';
import type { FloorCalibration, PersonDetection } from '../../src/core/camera/tracking';

const run = promisify(execFile);
const MODEL_NAME = 'YOLOv3Int8LUT';

export async function chairExecutable(root: string, signal?: AbortSignal) {
  const directory = resolve(root, '.wdt-data');
  const binary = resolve(directory, 'camera-chair-detector');
  const source = resolve(root, 'helper/camera/chair-detector.swift');
  if ((statSync(binary, { throwIfNoEntry: false })?.mtimeMs ?? 0) < statSync(source).mtimeMs) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await run('swiftc', ['-O', source, '-o', binary], {
      signal, timeout: 60_000,
      env: { ...process.env, CLANG_MODULE_CACHE_PATH: resolve(directory, 'swift-modules') },
    });
  }
  return binary;
}

export function chairModel(root: string, extension = 'mlmodelc') {
  return resolve(root, '.wdt-data', `${MODEL_NAME}.${extension}`);
}

export async function detectChairs(root: string, video: string, timeMs: number, signal: AbortSignal, calibration?: FloorCalibration) {
  const binary = await chairExecutable(root, signal);
  const temporary = await mkdtemp(resolve(root, '.wdt-data/chair-frame-'));
  try {
    const image = resolve(temporary, 'frame.jpg');
    // Seek just before the displayed frame to avoid rounding up at its start timestamp.
    await run('ffmpeg', [
      '-nostdin', '-v', 'error', '-ss', String(Math.max(0, (timeMs - 5) / 1000)), '-i', video, '-frames:v', '1', '-q:v', '2', image,
    ], { signal, timeout: 15_000 });
    const result = await run(binary, [chairModel(root), image], { signal, timeout: 30_000 });
    return chairSuggestions(JSON.parse(result.stdout) as PersonDetection[], timeMs, calibration);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
