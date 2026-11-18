// Motion Detection from a Link's Readings: windowed std-dev against a recorded Baseline.
// Pure and deterministic; time only ever comes from the readings themselves.
import { DEFAULT_DETECTOR_CONFIG, type Baseline, type DetectorConfig, type Reading, type Verdict } from './types';

/** Population std-dev of readings with t in (tEnd - windowS, tEnd]; NaN if fewer than 3. */
export function windowStd(readings: readonly Reading[], tEnd: number, windowS: number): number {
  const tStart = tEnd - windowS;
  let n = 0;
  let sum = 0;
  for (const r of readings) {
    if (r.t > tStart && r.t <= tEnd) {
      n++;
      sum += r.rssi;
    }
  }
  if (n < 3) return NaN;
  const mean = sum / n;
  let sq = 0;
  for (const r of readings) {
    if (r.t > tStart && r.t <= tEnd) sq += (r.rssi - mean) * (r.rssi - mean);
  }
  return Math.sqrt(sq / n);
}

function meanOf(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sdOf(xs: readonly number[], mean: number): number {
  return xs.length === 0 ? NaN : Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length);
}

export function thresholds(baseline: Baseline, cfg: DetectorConfig = DEFAULT_DETECTOR_CONFIG): { on: number; off: number } {
  return {
    on: baseline.windowStdMean + cfg.kOn * baseline.windowStdSd,
    off: baseline.windowStdMean + cfg.kOff * baseline.windowStdSd,
  };
}

/** Baseline from a recording of a still room: windowed std-dev every stepS, then its mean and sd. */
export function computeBaseline(readings: readonly Reading[], cfg: DetectorConfig, recordedAt: string): Baseline {
  const first = readings[0];
  const last = readings[readings.length - 1];
  if (!first || !last) {
    return { recordedAt, durationS: 0, meanRssi: NaN, windowStdMean: 0, windowStdSd: cfg.sdFloor, samples: 0 };
  }
  const stds: number[] = [];
  // Skip the first window so every std sees a full window of data.
  for (let t = first.t + cfg.windowS; t <= last.t + 1e-9; t += cfg.stepS) {
    const s = windowStd(readings, t, cfg.windowS);
    if (!Number.isNaN(s)) stds.push(s);
  }
  const windowStdMean = meanOf(stds);
  const sd = sdOf(stds, windowStdMean);
  return {
    recordedAt,
    durationS: last.t - first.t,
    meanRssi: meanOf(readings.map((r) => r.rssi)),
    windowStdMean: Number.isNaN(windowStdMean) ? 0 : windowStdMean,
    windowStdSd: Math.max(Number.isNaN(sd) ? 0 : sd, cfg.sdFloor),
    samples: readings.length,
  };
}

export interface Detector {
  /** Feed one reading; returns a Verdict each time a new stepS of reading time has elapsed. */
  push(r: Reading): Verdict | null;
}

/** Stateful incremental detector. Keeps only the last windowS of readings. */
export function createDetector(baseline: Baseline, cfg: DetectorConfig = DEFAULT_DETECTOR_CONFIG): Detector {
  const { on, off } = thresholds(baseline, cfg);
  let buf: Reading[] = [];
  let nextStepT: number | null = null;
  let motion = false;
  let aboveCount = 0;
  let belowSince: number | null = null;

  return {
    push(r) {
      buf.push(r);
      if (nextStepT === null) nextStepT = r.t + cfg.stepS;
      if (r.t < nextStepT) return null;
      // After a gap, label the verdict with the latest step not after this reading (not a stale
      // step from before the gap), so its time matches the window it was scored on.
      while (nextStepT + cfg.stepS <= r.t) nextStepT += cfg.stepS;
      const t = nextStepT;
      nextStepT += cfg.stepS;
      buf = buf.filter((x) => x.t > r.t - cfg.windowS);
      const score = windowStd(buf, r.t, cfg.windowS);
      if (Number.isNaN(score)) return { t, motion, score: 0, onThreshold: on, offThreshold: off };

      if (!motion) {
        aboveCount = score > on ? aboveCount + 1 : 0;
        if (aboveCount >= cfg.onConsecutive) {
          motion = true;
          belowSince = null;
        }
      } else if (score < off) {
        belowSince ??= t;
        if (t - belowSince >= cfg.offHoldS) {
          motion = false;
          aboveCount = 0;
          belowSince = null;
        }
      } else {
        belowSince = null;
      }
      return { t, motion, score, onThreshold: on, offThreshold: off };
    },
  };
}

/** Replay: all verdicts for a recording, built on the same incremental detector. */
export function runDetector(readings: readonly Reading[], baseline: Baseline, cfg: DetectorConfig = DEFAULT_DETECTOR_CONFIG): Verdict[] {
  const d = createDetector(baseline, cfg);
  const out: Verdict[] = [];
  for (const r of readings) {
    const v = d.push(r);
    if (v) out.push(v);
  }
  return out;
}
