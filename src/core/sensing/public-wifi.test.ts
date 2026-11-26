import { expect, it } from 'vitest';
import { makePublicWifiSnapshot, parsePublicWifiSnapshot } from './public-wifi';
import type { SignalSnapshot } from './signal-tracker';

const reading = { t: 20, rssi: -58 };
const verdict = { t: 20, motion: true, score: 3, onThreshold: 1.1, offThreshold: 0.8 };
const signal: SignalSnapshot = {
  state: 'motion',
  readings: [reading],
  verdicts: [verdict],
  score: 3,
  threshold: 1.1,
  remainingMs: 0,
  baseline: { recordedAt: '2026-11-25T04:00:00.000Z', durationS: 30, meanRssi: -58, windowStdMean: 0.5, windowStdSd: 0.3, samples: 300 },
};

it('publishes only the graph and actual motion for the configured room', () => {
  expect(makePublicWifiSnapshot(signal, 'office', 20_000)).toEqual({
    version: 1, updatedAt: 20_000, roomId: 'office', state: 'motion', readings: [reading], verdicts: [verdict],
  });
  expect(makePublicWifiSnapshot(signal, null, 20_000)).toEqual({
    version: 1, updatedAt: 20_000, roomId: null, state: 'baseline-needed', readings: [reading], verdicts: [],
  });
});

it('clears readings when the receiver drops and discards a stale or malformed snapshot', () => {
  const snapshot = makePublicWifiSnapshot({ ...signal, state: 'disconnected' }, 'office', 20_000);
  expect(snapshot).toEqual({
    version: 1, updatedAt: 20_000, roomId: 'office', state: 'disconnected', readings: [], verdicts: [],
  });
  expect(parsePublicWifiSnapshot(snapshot, 28_000)).toEqual(snapshot);
  expect(parsePublicWifiSnapshot(snapshot, 28_001)).toBeUndefined();
  expect(parsePublicWifiSnapshot({ ...snapshot, readings: [null] }, 20_000)).toBeUndefined();
});
