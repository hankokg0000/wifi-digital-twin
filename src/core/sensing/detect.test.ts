import { describe, expect, it } from 'vitest';
import { computeBaseline, runDetector, thresholds, windowStd } from './detect';
import { DEFAULT_DETECTOR_CONFIG, type Baseline, type Reading } from './types';

const CFG = DEFAULT_DETECTOR_CONFIG;

// Deterministic reading generator: sample i has time t0 + i / hz and rssi f(i).
const series = (t0: number, n: number, hz: number, f: (i: number) => number): Reading[] =>
  Array.from({ length: n }, (_, i) => ({ t: t0 + i / hz, rssi: f(i) }));

// Baseline of a still room: constant -55 dBm for 30 s at 10 Hz.
// Every windowed std is exactly 0, so windowStdSd is floored to sdFloor (0.3):
// on = 0 + 3 * 0.3 = 0.9, off = 0 + 1.5 * 0.3 = 0.45.
const STILL: Baseline = computeBaseline(series(0, 300, 10, () => -55), CFG, 'still');

// Motion profile shared by several tests: still for i < 100 (t < 10 s), then
// alternating -50 / -60 for i in [100, 200) (t in [10, 20) s).
const onsetRssi = (i: number): number => {
  if (i < 100) return -55;
  if (i < 200) return i % 2 === 0 ? -50 : -60;
  return -55;
};

describe('windowStd', () => {
  const data: Reading[] = [
    { t: 1, rssi: -50 },
    { t: 2, rssi: -52 },
    { t: 3, rssi: -50 },
    { t: 4, rssi: -52 },
  ];

  it('returns exactly 1 (population std) when all four readings are inside the window', () => {
    // mean -51, deviations +-1, population variance 4 / 4 = 1.
    expect(windowStd(data, 4, 4)).toBe(1);
  });

  it('returns NaN when only two readings (t=3, t=4) fall inside a 1.5 s window', () => {
    // tStart = 2.5, so only t=3 and t=4 are inside: fewer than 3 readings.
    expect(windowStd(data, 4, 1.5)).toBeNaN();
  });

  it('excludes a reading exactly at tEnd - windowS and includes one exactly at tEnd', () => {
    // tEnd=4, windowS=2 => window is (2, 4].
    // t=2 (rssi -100) is on the excluded lower edge; if it were included the std would be huge.
    // t=4 (rssi -50) is on the included upper edge; without it only 2 readings remain (NaN).
    // Remaining: -50, -52, -50 => population variance p(1-p)*d^2 with p=2/3, d=2 => 8/9.
    const edge: Reading[] = [
      { t: 2, rssi: -100 },
      { t: 2.5, rssi: -50 },
      { t: 3, rssi: -52 },
      { t: 4, rssi: -50 },
    ];
    expect(windowStd(edge, 4, 2)).toBeCloseTo((2 * Math.SQRT2) / 3, 12);
    expect(windowStd(edge, 4, 2)).toBeCloseTo(0.9428090415820634, 12);
  });
});

describe('computeBaseline', () => {
  it('gives zero spread, sd floored to sdFloor, and exact summary numbers for a constant still series', () => {
    const b = computeBaseline(series(0, 300, 10, () => -55), CFG, 'rec-1');
    expect(b.windowStdMean).toBe(0);
    expect(b.windowStdSd).toBe(CFG.sdFloor);
    expect(b.windowStdSd).toBe(0.3);
    expect(b.meanRssi).toBe(-55);
    expect(b.samples).toBe(300);
    expect(b.durationS).toBeCloseTo(29.9, 9);
    expect(b.recordedAt).toBe('rec-1');
  });

  it('returns zero duration, zero samples and the sd floor for an empty recording', () => {
    const b = computeBaseline([], CFG, 'empty');
    expect(b.samples).toBe(0);
    expect(b.durationS).toBe(0);
    expect(b.windowStdSd).toBe(0.3);
    expect(b.windowStdMean).toBe(0);
    expect(Number.isNaN(b.meanRssi)).toBe(true);
  });
});

describe('thresholds', () => {
  it('computes on = mean + 3*sd and off = mean + 1.5*sd with the default config', () => {
    const b: Baseline = {
      recordedAt: 'x',
      durationS: 0,
      meanRssi: -55,
      windowStdMean: 0.5,
      windowStdSd: 0.2,
      samples: 0,
    };
    const { on, off } = thresholds(b);
    expect(on).toBeCloseTo(0.5 + 3 * 0.2, 12); // 1.1
    expect(off).toBeCloseTo(0.5 + 1.5 * 0.2, 12); // 0.8
    expect(on).toBeCloseTo(1.1, 12);
    expect(off).toBeCloseTo(0.8, 12);
  });
});

describe('runDetector motion ON', () => {
  it('turns motion on exactly at t=10.5, the second above-threshold step after the alternating part starts', () => {
    const verdicts = runDetector(series(0, 200, 10, onsetRssi), STILL);

    // Thresholds for the still baseline.
    expect(verdicts[0]!.onThreshold).toBeCloseTo(0.9, 12);
    expect(verdicts[0]!.offThreshold).toBeCloseTo(0.45, 12);

    // Nothing before the alternating part can be on.
    expect(verdicts.filter((v) => v.t < 10).every((v) => !v.motion)).toBe(true);

    // t=10.0: window (8, 10] = 19 x (-55) + one -50 => variance (1/20)(19/20)(25) = 475/400.
    // Score 1.0897 is above on=0.9, so it counts as one step but motion stays off.
    const at10 = verdicts.find((v) => v.t === 10);
    expect(at10?.score).toBeCloseTo(Math.sqrt(475 / 400), 9);
    expect(at10?.score).toBeGreaterThan(0.9);
    expect(at10?.motion).toBe(false);

    // t=10.5: window (8.5, 10.5] = 14 x (-55) + three -50 + three -60 => variance 150/20 = 7.5.
    // This is the second consecutive above-threshold step, so motion flips on at this same verdict.
    const at105 = verdicts.find((v) => v.t === 10.5);
    expect(at105?.score).toBeCloseTo(Math.sqrt(7.5), 9);
    expect(at105?.motion).toBe(true);

    // The first motion=true verdict is at t=10.5 exactly (within 2.5 s of the alternating start).
    const firstOn = verdicts.find((v) => v.motion);
    expect(firstOn?.t).toBe(10.5);
    expect(firstOn!.t).toBeGreaterThanOrEqual(10);
    expect(firstOn!.t).toBeLessThanOrEqual(12.5);
  });

  it('never turns on from a single above-threshold step (onConsecutive = 2)', () => {
    // One spike reading as the very last sample: only one verdict sees it.
    // Window (8, 10] = 19 x (-55) + one -40 => d=15, variance (1/20)(19/20)(225) = 10.6875.
    const spikeAtEnd: Reading[] = series(0, 101, 10, (i) => (i === 100 ? -40 : -55));
    const verdicts = runDetector(spikeAtEnd, STILL);

    expect(verdicts).toHaveLength(20);
    expect(verdicts.every((v) => !v.motion)).toBe(true);

    const last = verdicts[verdicts.length - 1]!;
    expect(last.t).toBe(10);
    expect(last.score).toBeCloseTo(Math.sqrt(10.6875), 9);
    expect(last.score).toBeGreaterThan(last.onThreshold);
  });

  it('turns on when the same spike is followed by still readings, because it stays above threshold for two steps', () => {
    // Contrast with the case above: the spike now stays in the window for two verdicts (10.0 and 10.5).
    const spikeThenStill = series(0, 106, 10, (i) => (i === 100 ? -40 : -55));
    const verdicts = runDetector(spikeThenStill, STILL);

    expect(verdicts.find((v) => v.t === 10)?.motion).toBe(false);
    expect(verdicts.find((v) => v.t === 10.5)?.score).toBeCloseTo(Math.sqrt(10.6875), 9);
    expect(verdicts.find((v) => v.motion)?.t).toBe(10.5);
  });
});

describe('runDetector motion OFF with hold', () => {
  // Still -> alternating (t 10..20) -> still again from t=20 onward.
  const r7 = series(0, 251, 10, (i) => (i < 200 ? onsetRssi(i) : -55));

  it('keeps motion on for at least offHoldS after the score first drops below the off threshold', () => {
    const verdicts = runDetector(r7, STILL);

    // The window is fully still only once it no longer contains any alternating reading:
    // window (T-2, T] with last alternating reading at t=19.9 => first all-still window is T=22.0.
    const firstBelow = verdicts.find((v) => v.t >= 10.5 && v.score < v.offThreshold);
    expect(firstBelow?.t).toBe(22);
    expect(firstBelow?.score).toBe(0);

    // Motion stays on through the hold (22.0 .. 24.5 are all < 3 s after 22.0).
    const hold = verdicts.filter((v) => v.t >= 22 && v.t <= 24.5);
    expect(hold).toHaveLength(6);
    expect(hold.every((v) => v.motion)).toBe(true);

    // The flip to off happens at t=25.0 = 22.0 + offHoldS.
    const flip = verdicts.find((v) => v.t > 22 && !v.motion);
    expect(flip?.t).toBe(25);
    expect(flip!.t).toBeGreaterThanOrEqual(firstBelow!.t + CFG.offHoldS);
  });

  it('stays off after it flips', () => {
    const verdicts = runDetector(r7, STILL);
    // The recording ends at t=25.0, so the only verdict at or after the flip is the one at 25.0.
    const afterFlip = verdicts.filter((v) => v.t >= 25);
    expect(afterFlip.map((v) => v.t)).toEqual([25]);
    expect(afterFlip.every((v) => !v.motion)).toBe(true);
  });
});

describe('runDetector hysteresis', () => {
  // Still -> burst of +-5 alternating (t 10..15) -> +-0.6 alternating (t 15..25).
  // With baseline STILL: on = 0.9, off = 0.45. A +-0.6 alternating window has std exactly 0.6,
  // which sits strictly between off and on.
  const r8 = series(0, 250, 10, (i) => {
    if (i < 100) return -55;
    if (i < 150) return i % 2 === 0 ? -50 : -60;
    return i % 2 === 0 ? -54.4 : -55.6;
  });

  it('keeps motion on while the score sits between the off and on thresholds', () => {
    const verdicts = runDetector(r8, STILL);
    const { on, off } = thresholds(STILL);

    // Motion turned on in the burst, at the same step as the onset test.
    expect(verdicts.find((v) => v.motion)?.t).toBe(10.5);

    // From t=10.5 through the end of the recording, motion never turns off.
    expect(verdicts.filter((v) => v.t >= 10.5).every((v) => v.motion)).toBe(true);

    // Fully inside the +-0.6 segment (t=17.0 .. 24.5): score is 0.6, between off and on.
    const hyst = verdicts.filter((v) => v.t >= 17);
    expect(hyst).toHaveLength(16);
    for (const v of hyst) {
      expect(v.score).toBeCloseTo(0.6, 9);
      expect(v.score).toBeGreaterThan(off);
      expect(v.score).toBeLessThan(on);
      expect(v.motion).toBe(true);
    }
  });
});

describe('runDetector determinism', () => {
  it('returns deep-equal output for the same input run twice', () => {
    const input = series(0, 200, 10, onsetRssi);
    const first = runDetector(input, STILL);
    const second = runDetector(input, STILL);
    expect(first).toHaveLength(39);
    expect(second).toEqual(first);
  });
});

describe('runDetector step cadence', () => {
  it('emits exactly 19 verdicts for 10 s of 10 Hz readings (t = 0.0 .. 9.9), one per 0.5 s', () => {
    // First step is at first.t + 0.5 = 0.5. A verdict at step T needs a reading with t >= T,
    // so the last verdict is at 9.5 (the reading at 10.0 does not exist). 0.5..9.5 => 19 verdicts.
    const verdicts = runDetector(series(0, 100, 10, () => -55), STILL);
    expect(verdicts).toHaveLength(19);
    expect(verdicts[0]!.t).toBeCloseTo(0.5, 12);
    expect(verdicts[verdicts.length - 1]!.t).toBeCloseTo(9.5, 12);
    for (let i = 1; i < verdicts.length; i++) {
      expect(verdicts[i]!.t - verdicts[i - 1]!.t).toBeCloseTo(0.5, 12);
    }
  });
});

describe('runDetector gap handling', () => {
  it('keeps verdict times strictly increasing with no duplicates across a 5 s gap', () => {
    // 2 s at 10 Hz (t 0.0 .. 1.9), a 5 s gap, then 2 s at 10 Hz (t 6.9 .. 8.8).
    const readings = [
      ...series(0, 20, 10, () => -55),
      ...series(6.9, 20, 10, () => -55),
    ];
    const verdicts = runDetector(readings, STILL);
    const times = verdicts.map((v) => v.t);

    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]!);
    }
    expect(new Set(times).size).toBe(times.length);

    // Exact sequence: no step is emitted during the gap; the reading at 6.9 emits the latest step
    // not after it (6.5, not the stale 2.0), then the cadence resumes at 7.0.
    expect(times).toEqual([0.5, 1, 1.5, 6.5, 7, 7.5, 8, 8.5]);
  });
});
