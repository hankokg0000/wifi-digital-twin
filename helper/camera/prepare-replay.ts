import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCameraReplay } from '../../src/core/camera/feed';
import { OFFICE_CALIBRATION } from '../../src/core/camera/office';
import type { CameraPersonDetection } from '../../src/core/camera/tracking';
import { readDetections } from './frames';

const [path, startArg, durationArg] = process.argv.slice(2);
const start = startArg === undefined ? undefined : Number(startArg);
const duration = durationArg === undefined ? undefined : Number(durationArg);
if (!path || (start !== undefined && (!Number.isFinite(start) || start < 0))
  || (duration !== undefined && (!Number.isFinite(duration) || duration <= 0))) {
  throw new Error('Usage: pnpm camera:prepare <video path> [start seconds] [duration seconds]');
}

const detections: CameraPersonDetection[][] = [];
for await (const frame of readDetections(process.cwd(), { type: 'file', path, start, duration })) {
  detections.push(frame);
}
const replay = createCameraReplay(detections, OFFICE_CALIBRATION);

if (!replay.frames.length) throw new Error('The source did not yield any video frames');
const directory = resolve('.wdt-data');
mkdirSync(directory, { recursive: true });
const dest = resolve(directory, 'camera-replay.json');
const temporary = `${dest}.${process.pid}.tmp`;
writeFileSync(temporary, `${JSON.stringify(replay)}\n`, { mode: 0o600 });
renameSync(temporary, dest);
console.log(`Prepared ${replay.frames.length} frames, ${replay.frames.filter((track) => track?.visibility === 'visible').length} with a visible track`);
