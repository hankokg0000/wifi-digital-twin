import { CAMERA_STEP_MS, type CameraReplay } from './feed';
import { createSceneTracker } from './generated-scene';
import { simulateDemoFrames } from './room-monitor';
import type { CameraPersonDetection, FloorCalibration } from './tracking';

export const OFFICE_WIDTH = 11.6;
export const OFFICE_LENGTH = 12.8;
export const OFFICE_DEMO_PATH = '/camera-twin/office-demo';

export function createOfficeDemoReplay(detections: CameraPersonDetection[][]): CameraReplay {
  const observations = detections.map(createSceneTracker(() => null, true));
  return {
    version: 1,
    stepMs: CAMERA_STEP_MS,
    frames: detections.map(() => null),
    sceneFrames: simulateDemoFrames(observations, {
      bounds: [0, 0, OFFICE_WIDTH, OFFICE_LENGTH],
      visibleFloor: [[0, 0], [OFFICE_WIDTH, 0], [OFFICE_WIDTH, OFFICE_LENGTH], [0, OFFICE_LENGTH]],
    }),
  };
}

export const OFFICE_DESKS: readonly [x: number, z: number, rotation: number][] = [
  [1.45, 2.25, Math.PI / 2], [1.45, 5.45, Math.PI / 2], [1.45, 8.8, Math.PI / 2],
  [4.85, 2.2, 0], [6.05, 3.65, Math.PI / 2], [4.12, 5.95, 0],
  [6.02, 7.2, Math.PI / 2], [4.25, 9.45, 0], [5.95, 11.05, Math.PI / 2],
];

export const OFFICE_CALIBRATION: FloorCalibration = {
  image: [[766 / 960, 136 / 540], [867 / 960, 150 / 540], [827 / 960, 536 / 540], [410 / 960, 536 / 540]],
  floor: [[7.2, 0.85], [10.7, 0.85], [10.7, 12.1], [7.2, 12.1]],
};
