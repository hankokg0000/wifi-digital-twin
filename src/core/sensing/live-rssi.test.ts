import { expect, it } from 'vitest';
import { observedRssi, parseSavedRssiLink, RSSI_BASELINE_MS } from './live-rssi';
import { createSignalTracker } from './signal-tracker';
import { DEFAULT_DETECTOR_CONFIG } from './types';

it('admits only real, connected RSSI readings and identifies the channel', () => {
  const reading = { rssi: -58, channel: 36 };
  expect(observedRssi('live', reading)).toEqual({ power: -58, channel: 36, key: 'rssi/36' });
  expect(observedRssi('fake', reading)).toBe(null);
  expect(observedRssi('live', { rssi: 0, channel: 0 })).toBe(null);
});

it('keeps the RSSI trace, a 30-second baseline and the motion scores for the chart', () => {
  const tracker = createSignalTracker({ config: DEFAULT_DETECTOR_CONFIG, baselineMs: RSSI_BASELINE_MS, traceLimit: 640 });
  const quiet = observedRssi('live', { rssi: -58, channel: 36 })!;
  const disturbance = observedRssi('live', { rssi: -74, channel: 36 })!;
  tracker.acceptSample(quiet, 1_000);
  expect(tracker.status(1_000).readings).toEqual([{ t: 1, rssi: -58 }]);
  expect(tracker.baseline(1_000)).toBe(true);
  for (let time = 1_100; time <= 31_000; time += 100) tracker.acceptSample(quiet, time);
  expect(tracker.status(31_000)).toMatchObject({
    state: 'idle', baseline: { meanRssi: -58, samples: 300, durationS: 29.9 }, verdicts: [],
  });
  for (let time = 31_100; time <= 33_100; time += 100) {
    tracker.acceptSample(time % 200 ? disturbance : quiet, time);
  }
  expect(tracker.status(33_100).verdicts.at(-1)).toEqual({
    t: 33.1, motion: true, score: 8, onThreshold: 0.8999999999999999, offThreshold: 0.44999999999999996,
  });
  expect(tracker.status(36_101)).toMatchObject({ state: 'disconnected', readings: [], baseline: null, verdicts: [] });
});

it('restores a saved Baseline only after receiving the same Link and never replaces a new recording', () => {
  const saved = {
    recordedAt: '2026-11-25T04:20:30.000Z',
    durationS: 29.9,
    meanRssi: -58,
    windowStdMean: 0,
    windowStdSd: 0.3,
    samples: 300,
  };
  const link = { roomId: 'hall', baseline: { channel: 36, value: saved } };
  expect(parseSavedRssiLink(JSON.parse(JSON.stringify(link)))).toEqual(link);
  expect(parseSavedRssiLink({ ...link, baseline: { channel: 36, value: { ...saved, samples: 3 } } })).toEqual({ roomId: 'hall' });
  const tracker = createSignalTracker({ config: DEFAULT_DETECTOR_CONFIG, baselineMs: RSSI_BASELINE_MS, traceLimit: 640 });
  const quiet = observedRssi('live', { rssi: -58, channel: 36 })!;
  tracker.acceptSample({ ...quiet, key: 'rssi/44' }, 1_000);
  tracker.restoreBaseline(quiet.key, saved);
  expect(tracker.status(1_000)).toMatchObject({ state: 'baseline-needed', baseline: null });
  tracker.reset();
  tracker.acceptSample(quiet, 1_500);
  tracker.restoreBaseline(quiet.key, saved);
  expect(tracker.status(1_500)).toMatchObject({ state: 'idle', baseline: saved, threshold: 0.8999999999999999 });
  expect(tracker.baseline(1_500)).toBe(true);
  tracker.restoreBaseline(quiet.key, saved);
  expect(tracker.status(1_500)).toMatchObject({ state: 'calibrating', baseline: null, remainingMs: 30000 });
});
