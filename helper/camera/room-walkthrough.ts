import { execFile } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { FloorPlanGeometry } from '../../src/core/camera/floor-plan';
import { scanIssues, type ScanDoor, type ScanDraft } from '../../src/core/camera/room-scan';
import { planModelDirectory, sceneExecutable, sceneModel } from './scenes';

const run = promisify(execFile);
const DEPTH_WIDTH = 192;
const DEPTH_HEIGHT = 128;

type InterpretedScan = {
  plan: FloorPlanGeometry | null;
  doors: ScanDoor[];
  observedSides: number;
};

export async function reconstructWalkthrough(
  root: string, video: string, directory: string, recordedSeconds: number, signal: AbortSignal,
): Promise<Omit<ScanDraft, 'id'>> {
  const frames = resolve(directory, 'frames');
  const cache = resolve(directory, 'reconstruction');
  await mkdir(frames, { recursive: true, mode: 0o700 });
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const fps = Math.min(3, 100 / recordedSeconds);
  await run('ffmpeg', [
    '-nostdin', '-v', 'error', '-i', video, '-map', '0:v:0',
    '-vf', `fps=${fps.toFixed(5)},scale=w='min(760,iw)':h=-2`, '-q:v', '3',
    '-frames:v', '102', resolve(frames, '%06d.jpg'),
  ], { signal, timeout: 60_000 });
  const modelDirectory = planModelDirectory(root);
  const python = resolve(modelDirectory, 'venv/bin/python');
  const script = resolve(root, 'helper/camera/reconstruct-room.py');
  const pose = await run(python, [script, 'locate', frames, cache], { signal, timeout: 300_000, maxBuffer: 4_194_304 });
  const { registered, selected } = JSON.parse(pose.stdout) as { registered: number; selected: string[] };
  const attemptedFrames = (await readdir(frames)).length;
  const base = { recordedSeconds, attemptedFrames, registeredFrames: registered };
  if (registered < 4) return { ...base, plan: null, doors: [], issues: ['camera-path'] };

  if (selected.some((frame) => !/^\d{6}\.jpg$/.test(frame))) throw new Error('Unexpected frame name');
  await writeFile(resolve(cache, 'frames.json'), JSON.stringify(selected), { mode: 0o600 });
  const depthTool = await sceneExecutable(root, signal);
  for (const frame of selected) {
    const stem = frame.slice(0, -4);
    const rgbPath = resolve(cache, `${stem}.rgb`);
    const { stdout } = await run('ffmpeg', [
      '-nostdin', '-v', 'error', '-i', resolve(frames, frame), '-vf', `scale=${DEPTH_WIDTH}:${DEPTH_HEIGHT}`,
      '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1',
    ], { signal, timeout: 15_000, encoding: 'buffer' });
    await writeFile(rgbPath, stdout, { mode: 0o600 });
    const depth = await run(depthTool, [sceneModel(root), rgbPath, String(DEPTH_WIDTH), String(DEPTH_HEIGHT)], {
      signal, timeout: 45_000,
    });
    await writeFile(resolve(cache, `${stem}.json`), depth.stdout, { mode: 0o600 });
  }
  const geometry = await run(python, [
    script, 'interpret', frames, cache, modelDirectory, String(DEPTH_WIDTH), String(DEPTH_HEIGHT), fps.toFixed(5),
  ], { signal, timeout: 160_000, maxBuffer: 1_048_576 });
  const { plan, doors, observedSides } = JSON.parse(geometry.stdout) as InterpretedScan;
  return {
    ...base, plan, doors, issues: scanIssues({
      registeredFrames: registered, attemptedFrames, locatedFloor: Boolean(plan), observedSides,
    }),
  };
}
