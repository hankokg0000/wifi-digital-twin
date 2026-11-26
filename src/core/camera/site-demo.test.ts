import { expect, it } from 'vitest';
import { createAreaReplay, DEMO_AREAS, demoArea, demoLink, moveAvatar } from './site-demo';

it('keeps ten individually selectable areas with a video source and a Wi-Fi placement plan', () => {
  expect(DEMO_AREAS.length).toBe(10);
  expect(new Set(DEMO_AREAS.map(({ id }) => id)).size).toBe(10);
  expect(DEMO_AREAS.filter(({ credit }) => credit).length).toBe(9);
  const lift = demoArea('lift')!;
  expect(demoLink(lift.plan)).toEqual({ router: [10 * 0.21, 9 * 0.15], receiver: [10 * 0.79, 9 * 0.83] });
});

it('ignores small jitter and limits the movement from a distant detection', () => {
  expect(moveAvatar(1, 2, 1.06, 2.02, 0.016)).toEqual([1, 2]);
  expect(moveAvatar(1, 2, 11, 2, 0.5)).toEqual([1.2, 2]);
});

it('matches the boxes in the wide briefing clip to the corresponding chairs', () => {
  const left = { x: 0.60, y: 0.28, width: 0.08, height: 0.39, confidence: 0.91 };
  const right = { x: 0.76, y: 0.24, width: 0.08, height: 0.42, confidence: 0.84 };
  const cropped = { x: 0.31, y: 0.04, width: 0.35, height: 0.90, confidence: 0.92 };
  const room = demoArea('briefing')!;
  expect(createAreaReplay([[right, cropped, left], [cropped]], room).sceneFrames).toEqual([
    [
      { id: 1, box: right, position: [8.67, 6.45], seat: { side: 'right', rotation: Math.PI / 2 } },
      { id: 2, box: cropped, position: undefined },
      { id: 3, box: left, position: [6.0, 4.85], seat: { side: 'left', rotation: Math.PI } },
    ],
    [{ id: 2, box: cropped, position: undefined }],
  ]);
  expect(room.plan.objects.filter(({ kind }) => kind === 'chair').map(({ center }) => center))
    .toEqual([[6, 4.85], [8.67, 6.45]]);
});

it('shows a box without a floor position for an uncalibrated close-up', () => {
  const box = { x: 0.1, y: 0.1, width: 0.7, height: 0.8, confidence: 0.9 };
  expect(createAreaReplay([[box, { ...box, x: 0.56, ground: [0.5, 0.5] }]], demoArea('hall')!).sceneFrames)
    .toEqual([[{ id: 1, box, position: undefined }, { id: 2, box: { ...box, x: 0.56 }, ground: [0.5, 0.5], position: [2.525, 13.5] }]]);
});
