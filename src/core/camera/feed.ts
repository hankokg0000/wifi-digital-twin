import { floorPlanProjector, type GeneratedFloorPlan } from './floor-plan';
import { trackGeneratedScene, type SceneObservation } from './generated-scene';
import type { OfficeLayout } from './office-layout';
import type { Vec2 } from '../scene/types';
import { createCameraTracker, type CameraPersonDetection, type CameraTrack, type FloorCalibration, type PersonDetection } from './tracking';

export const CAMERA_API = '/camera-twin/api';
export const CAMERA_OPERATOR_PATH = `${CAMERA_API}/operator`;
export const CAMERA_LAYOUT_PREVIEW_PATH = `${CAMERA_API}/layout/preview`;
export const CAMERA_LAYOUT_SAVE_PATH = `${CAMERA_API}/layout/save`;
export const CAMERA_GENERATE_SCENE_PATH = `${CAMERA_API}/scene/generate`;
export const CAMERA_SCENE_PREFIX = `${CAMERA_API}/scenes/`;
export const CAMERA_REANALYZE_PATH = `${CAMERA_API}/tracking/reanalyze`;
export const CAMERA_CHAIRS_PATH = `${CAMERA_API}/chairs`;
export const CAMERA_UPLOAD_PATH = `${CAMERA_API}/upload`;
export const CAMERA_PUBLISH_PATH = `${CAMERA_API}/publish`;
export const CAMERA_MEDIA_PREFIX = `${CAMERA_API}/clips/`;
export const CAMERA_STREAM_PATH = '/camera-twin/api/stream';
export const CAMERA_SNAPSHOT_PATH = '/camera-twin/api/snapshot';
export const CAMERA_VIDEO_FPS = 24;
export const CAMERA_FPS = 8;
export const CAMERA_STEP_MS = 1000 / CAMERA_FPS;

export interface CameraReplay {
  version: 1;
  stepMs: number;
  frames: (CameraTrack | null)[];
  imageFrames?: (PersonDetection | null)[];
  sceneFrames?: SceneObservation[][];
}

export interface CameraMedia {
  id: string;
  title: string;
  url: string;
}

export interface CameraScene {
  kind?: 'floor-plan';
  url: string;
}

export interface CameraDraft {
  media: CameraMedia;
  replay: CameraReplay;
  layout?: OfficeLayout;
  needsCalibration?: boolean;
  scene?: CameraScene;
  revision?: number;
}

export interface CameraOperator {
  draft: CameraDraft | null;
  publishedId: string | null;
  publishedRevision: number;
  processing: boolean;
}

export interface CameraSnapshot {
  source: 'replay' | 'camera';
  state: 'ready' | 'waiting' | 'offline';
  track: CameraTrack | null;
  imageDetection?: PersonDetection | null;
  sceneObservations?: SceneObservation[];
  scene?: CameraScene;
  area: FloorCalibration['floor'] | null;
  elapsedMs: number | null;
  durationMs: number | null;
  media: CameraMedia | null;
  layout?: OfficeLayout;
}

export function createCameraReplay(
  detections: readonly CameraPersonDetection[][],
  calibration: FloorCalibration | null,
  region?: Vec2[],
): CameraReplay {
  const tracker = createCameraTracker(calibration, region);
  const frames = detections.map((boxes, index) => tracker.update(index * CAMERA_STEP_MS, boxes));
  return {
    version: 1,
    stepMs: CAMERA_STEP_MS,
    frames: frames.map(({ track }) => track),
    imageFrames: frames.map(({ imageDetection }) => imageDetection),
  };
}

export function createGeneratedReplay(detections: readonly CameraPersonDetection[][], scene: GeneratedFloorPlan): CameraReplay {
  return {
    version: 1,
    stepMs: CAMERA_STEP_MS,
    frames: detections.map(() => null),
    sceneFrames: trackGeneratedScene(detections, floorPlanProjector(scene)),
  };
}

export function replaySnapshot(replay: CameraReplay, epoch: number, now: number): CameraSnapshot {
  const durationMs = replay.frames.length * replay.stepMs;
  const elapsedMs = ((now - epoch) % durationMs + durationMs) % durationMs;
  const index = Math.floor(elapsedMs / replay.stepMs);
  return {
    source: 'replay',
    state: 'ready',
    track: replay.frames[index] ?? null,
    ...(replay.sceneFrames ? { sceneObservations: replay.sceneFrames[index] ?? [] } : {}),
    ...(replay.imageFrames ? { imageDetection: replay.imageFrames[index] ?? null } : {}),
    area: null,
    elapsedMs,
    durationMs,
    media: null,
  };
}
