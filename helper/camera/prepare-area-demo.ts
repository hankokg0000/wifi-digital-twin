import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAreaReplay, demoArea, SITE_MEDIA_PATH } from '../../src/core/camera/site-demo';
import type { CameraPersonDetection } from '../../src/core/camera/tracking';
import { normalizeCameraVideo, readDetections } from './frames';

const [id, source] = process.argv.slice(2);
const area = demoArea(id ?? null);
if (!area || !area.credit || !source) throw new Error('Usage: pnpm camera:prepare-area <meeting|hall|studio|briefing> <video path>');

const root = process.cwd();
const data = resolve(root, '.wdt-data');
const destination = resolve(root, 'public', '.' + SITE_MEDIA_PATH, area.id);
await Promise.all([mkdir(data, { recursive: true }), mkdir(destination, { recursive: true })]);
const stage = await mkdtemp(resolve(data, 'area-demo-'));
try {
  const video = resolve(stage, 'video.mp4');
  const signal = new AbortController().signal;
  await normalizeCameraVideo(resolve(source), video, signal);
  const detections: CameraPersonDetection[][] = [];
  for await (const frame of readDetections(root, { type: 'file', path: video }, signal)) detections.push(frame);
  const replay = createAreaReplay(detections, area);
  if (!replay.sceneFrames?.length) throw new Error('No frames were decoded from this video');
  const assetId = createHash('sha256').update(await readFile(video)).digest('hex').slice(0, 16);
  const filename = assetId + '.mp4';
  const media = { id: assetId, title: area.name, url: `${SITE_MEDIA_PATH}/${area.id}/${filename}` };
  const manifest = resolve(stage, 'replay.json');
  await writeFile(manifest, JSON.stringify({ media, replay }) + '\n');
  await rename(video, resolve(destination, filename));
  await rename(manifest, resolve(destination, 'replay.json'));
  console.log(`Prepared ${area.id}: ${detections.length} frames, ${replay.sceneFrames.filter(frame => frame.length).length} with detections`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
