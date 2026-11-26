import { describe, expect, it } from 'vitest';
import { replaySnapshot } from './feed';
import { createOfficeDemoReplay } from './office';
import type { CameraPersonDetection } from './tracking';

describe('office demo replay', () => {
  it('places person figures for the corresponding video frame even when feet are out of view', () => {
    const standing: CameraPersonDetection = {
      x: 0.2, y: 0.2, width: 0.1, height: 0.2, confidence: 0.9, ground: [0.25, 0.7],
    };
    const partlyHidden: CameraPersonDetection = {
      x: 0.65, y: 0.25, width: 0.1, height: 0.25, confidence: 0.9,
    };
    const replay = createOfficeDemoReplay([[standing, partlyHidden], []]);

    expect(replaySnapshot(replay, 0, 124).sceneObservations?.map(({ id, position }) => [id, position])).toEqual([
      [1, [3.55888, 8.5504]],
      [2, [7.592896, 8.0128]],
    ]);
    expect(replaySnapshot(replay, 0, 125).sceneObservations).toEqual([]);
  });
});
