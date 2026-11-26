import { expect, it } from 'vitest';
import { createCsiTracker } from './csi-monitor';

const packet = (values: number[]) =>
  `CSI_DATA,1,01:23:45:67:89:ab,-60,0,1,0,0,0,0,0,0,0,0,-95,0,6,0,0,0,0,0,8,1,"${JSON.stringify([1,1,1,1,...values])}"`;

it('records a quiet Baseline from CSI packets and detects repeated power variation', () => {
  const tracker = createCsiTracker();
  const quiet = packet([3,3,3,3]);
  tracker.accept(quiet, 1_000);
  expect(tracker.status(1_000).readings).toEqual([{ t: 1, rssi: 10 * Math.log10(18) }]);
  expect(tracker.baseline(1_000)).toBe(true);
  expect(tracker.status(3_000).remainingMs).toBe(13_000);
  for (let t = 1_100; t <= 16_000; t += 100) tracker.accept(quiet, t);
  const snapshot = tracker.status(16_000);
  expect(snapshot).toMatchObject({state:'idle', baseline:{samples:150}});
  expect(snapshot.threshold?.toFixed(3)).toBe('0.900');

  const disturbance = packet([50,50,50,50]);
  for (let t = 16_100; t <= 18_100; t += 100) tracker.accept(t % 200 ? disturbance : quiet, t);
  expect(tracker.status(18_100).state).toBe('motion');
  expect(tracker.status(21_101)).toMatchObject({ state:'disconnected', baseline:null, readings:[] });
});
