import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createOfficeDemoReplay, OFFICE_DEMO_PATH } from '../../src/core/camera/office';
import type { CameraPersonDetection } from '../../src/core/camera/tracking';
import { normalizeCameraVideo, readDetections } from './frames';

const [source] = process.argv.slice(2);
if (!source) throw new Error('Usage: pnpm camera:prepare-demo <video path>');

const root = process.cwd();
const directory = resolve(root, 'public', '.' + OFFICE_DEMO_PATH);
const data = resolve(root, '.wdt-data');
await Promise.all([mkdir(directory, { recursive: true }), mkdir(data, { recursive: true })]);
const staging = await mkdtemp(resolve(data, 'office-demo-'));
try {
  const video = resolve(staging, 'video.mp4');
  await normalizeCameraVideo(resolve(source), video, new AbortController().signal);

  const detections: CameraPersonDetection[][] = [];
  for await (const frame of readDetections(root, { type: 'file', path: video })) detections.push(frame);
  const replay = createOfficeDemoReplay(detections);
  if (!replay.sceneFrames?.some((frame) => frame.some(({ position }) => position))) {
    throw new Error('No people detected in the demo clip');
  }

  const hash = createHash('sha256');
  for await (const chunk of createReadStream(video)) hash.update(chunk);
  const id = hash.digest('hex').slice(0, 16);
  const filename = id + '.mp4';
  const media = { id, title: basename(source), url: OFFICE_DEMO_PATH + '/' + filename };
  const manifest = resolve(staging, 'replay.json');
  await writeFile(manifest, JSON.stringify({ media, replay }) + '\n');
  await rename(video, resolve(directory, filename));
  await rename(manifest, resolve(directory, 'replay.json'));
  console.log(`Prepared ${detections.length} frames for the office demo`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
