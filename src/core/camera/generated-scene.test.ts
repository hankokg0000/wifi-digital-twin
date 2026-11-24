import { describe, expect, it } from 'vitest';
import { createGeneratedScene, mergeSceneBackground, trackGeneratedScene } from './generated-scene';

describe('scene from camera frames', () => {
  it('uses an unblocked view of the background and marks surfaces hidden in every frame', () => {
    const detection = { x: 0, y: 0, width: 0.18, height: 0.2, confidence: 0.9 };
    const pixel = (rgb: number[]) => Uint8Array.from([...rgb, ...Array.from({ length: 21 }, () => 20)]);
    const blocked = { rgb: pixel([255, 150, 100]), detections: [detection] };
    const clear = { rgb: pixel([32, 20, 12]), detections: [] };
    const background = mergeSceneBackground([blocked, clear], 4, 2);
    expect(Array.from(background.rgb.slice(0, 3))).toEqual([32, 20, 12]);
    expect(Array.from(background.visible)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(Array.from(mergeSceneBackground([blocked, blocked], 4, 2).visible)).toEqual([0, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('maps relative depths, omits hidden pixels and rejects a flat depth result', () => {
    const background = {
      rgb: Uint8Array.from([255, 0, 0, 0, 0, 255, 50, 60, 70, 0, 255, 0]),
      visible: Uint8Array.of(1, 1, 0, 1),
    };
    const scene = createGeneratedScene(2, 2, [0, 0.5, 1, 1.5], background);
    expect(scene).toEqual({
      width: 2, height: 2, disparity: [1, 86, 0, 255],
    });
    expect(() => createGeneratedScene(2, 2, [1, 1, 1, 1], background)).toThrow('No usable depth contrast');
  });

  it('follows nearby anonymous observations even if detector order changes', () => {
    const first = { x: 0.65, y: 0.4, width: 0.1, height: 0.2, confidence: 0.9 };
    const other = { x: 0.12, y: 0.4, width: 0.1, height: 0.2, confidence: 0.9 };
    const samples = trackGeneratedScene([
      [{ ...first, ground: [0.7, 0.8] }, { ...other, ground: [0.2, 0.8] }],
      [{ ...other, x: 0.14 }, { ...first, x: 0.67, ground: [0.72, 0.8] }],
    ], (point) => point[0] > 0.5 ? point : null);
    expect(samples).toEqual([
      [{ id: 1, box: first, ground: [0.7, 0.8], position: [0.7, 0.8] }, { id: 2, box: other }],
      [{ id: 2, box: { ...other, x: 0.14 } }, { id: 1, box: { ...first, x: 0.67 }, ground: [0.72, 0.8], position: [0.72, 0.8] }],
    ]);
  });
});
