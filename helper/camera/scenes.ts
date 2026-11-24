import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { CAMERA_STEP_MS } from '../../src/core/camera/feed';
import {
  createGeneratedScene, mergeSceneBackground, SCENE_HEIGHT, SCENE_WIDTH, type BackgroundSample,
} from '../../src/core/camera/generated-scene';
import { createFloorPlan, type PlanSemantics } from '../../src/core/camera/floor-plan';
import type { CameraPersonDetection } from '../../src/core/camera/tracking';

const run = promisify(execFile);
const MODEL = 'DepthAnythingV2SmallF16P6';

export function sceneModel(root: string) {
  return resolve(root, '.wdt-data', 'scene-model', `${MODEL}.mlmodelc`);
}

export function planModelDirectory(root: string) {
  return resolve(root, '.wdt-data', 'plan-model');
}

export function hasFloorPlanModels(root: string) {
  const folder = planModelDirectory(root);
  return existsSync(sceneModel(root)) &&
    ['venv/bin/python', 'segformer.onnx', 'labels.json', 'grounding.onnx', 'vocab.txt']
      .every((name) => existsSync(resolve(folder, name)));
}

export async function sceneExecutable(root: string, signal?: AbortSignal) {
  const directory = resolve(root, '.wdt-data');
  const binary = resolve(directory, 'camera-depth-map');
  const source = resolve(root, 'helper/camera/depth-map.swift');
  if ((statSync(binary, { throwIfNoEntry: false })?.mtimeMs ?? 0) < statSync(source).mtimeMs) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await run('swiftc', ['-O', source, '-o', binary], {
      signal, timeout: 90_000, env: { ...process.env, CLANG_MODULE_CACHE_PATH: resolve(directory, 'swift-modules') },
    });
  }
  return binary;
}

export async function generateFloorPlan(root: string, video: string, detections: CameraPersonDetection[][], signal: AbortSignal) {
  const binary = await sceneExecutable(root, signal);
  const count = Math.min(detections.length, 9);
  const samples: BackgroundSample[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.min(detections.length - 1, Math.floor((i + 0.5) * detections.length / count));
    const seconds = Math.max(0, (index * CAMERA_STEP_MS - 5) / 1_000);
    const { stdout } = await run('ffmpeg', [
      '-nostdin', '-v', 'error', '-ss', String(seconds), '-i', video, '-map', '0:v:0',
      '-vf', `scale=${SCENE_WIDTH}:${SCENE_HEIGHT}`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1',
    ], { signal, timeout: 15_000, encoding: 'buffer' });
    if (stdout.length === SCENE_WIDTH * SCENE_HEIGHT * 3) {
      samples.push({ rgb: stdout, detections: detections[index]! });
    }
  }
  const background = mergeSceneBackground(samples, SCENE_WIDTH, SCENE_HEIGHT);
  const temporary = await mkdtemp(resolve(root, '.wdt-data/scene-frame-'));
  try {
    const framePath = resolve(temporary, 'background.rgb');
    await writeFile(framePath, background.rgb, { mode: 0o600 });
    const reference = samples[Math.min(samples.length - 1, 1)]!;
    const referencePath = resolve(temporary, 'reference.rgb');
    await writeFile(referencePath, reference.rgb, { mode: 0o600 });
    const dimensions = [String(SCENE_WIDTH), String(SCENE_HEIGHT)];
    const modelDirectory = planModelDirectory(root);
    const [depth, segments] = await Promise.all([
      run(binary, [sceneModel(root), framePath, ...dimensions], { signal, timeout: 45_000 }),
      run(resolve(modelDirectory, 'venv/bin/python'), [
        resolve(root, 'helper/camera/segment-plan.py'), modelDirectory, framePath, ...dimensions, referencePath,
      ], { signal, timeout: 80_000 }),
    ]);
    const surfaces = createGeneratedScene(SCENE_WIDTH, SCENE_HEIGHT, JSON.parse(depth.stdout) as number[], background);
    return createFloorPlan(surfaces, JSON.parse(segments.stdout) as PlanSemantics);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
