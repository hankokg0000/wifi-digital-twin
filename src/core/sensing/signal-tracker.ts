import { computeBaseline, createDetector, thresholds, type Detector } from './detect';
import type { Baseline, DetectorConfig, Reading, Verdict } from './types';

const READING_AGE_MS = 3_000;

export type SignalState = 'disconnected' | 'calibrating' | 'baseline-needed' | 'motion' | 'idle';
export interface SignalSnapshot {
  state: SignalState;
  feedback?: string;
  readings: Reading[];
  verdicts: Verdict[];
  baseline: Baseline | null;
  score: number | null;
  threshold: number | null;
  remainingMs: number;
}
export function createSignalTracker({ config, baselineMs, traceLimit }: { config: DetectorConfig; baselineMs: number; traceLimit: number }) {
  const baselineSeconds = baselineMs / 1000;
  let last = 0;
  let format: string | null = null;
  let detector: Detector | null = null;
  let recorded: Baseline | null = null;
  let capture: Reading[] = [];
  let trace: Reading[] = [];
  let calibrationEnds = 0;
  let verdicts: Verdict[] = [];
  let feedback = '';

  function reset() {
    last = 0;
    format = null;
    detector = null;
    recorded = null;
    capture = [];
    trace = [];
    calibrationEnds = 0;
    verdicts = [];
    feedback = '';
  }

  function acceptSample(sample: { key: string; power: number }, now: number) {
    if (format && now - last > READING_AGE_MS) reset();
    if (format && format !== sample.key) return;
    format = sample.key;
    last = now;
    const reading = { t: now / 1000, rssi: sample.power };
    if (!trace.length || reading.t - trace.at(-1)!.t >= 0.095) {
      trace.push(reading);
      if (trace.length > traceLimit) trace.shift();
    }
    if (calibrationEnds) {
      capture.push(reading);
      if (now >= calibrationEnds) {
        const span = (capture.at(-1)?.t ?? 0) - (capture[0]?.t ?? 0);
        if (capture.length >= baselineSeconds * 4 && span >= baselineSeconds * 0.8) {
          recorded = computeBaseline(capture, config, new Date(now).toISOString());
          detector = createDetector(recorded, config);
        } else feedback = 'ข้อมูลยังไม่ต่อเนื่อง ลองบันทึกช่วงห้องนิ่งใหม่';
        capture = [];
        calibrationEnds = 0;
        return recorded ?? undefined;
      }
    } else {
      const verdict = detector?.push(reading);
      if (verdict) {
        verdicts.push(verdict);
        if (verdicts.length > 120) verdicts.shift();
      }
    }
  }

  return {
    reset, acceptSample,
    restoreBaseline(key: string, saved: Baseline) {
      if (format !== key || recorded || calibrationEnds || feedback) return;
      recorded = saved;
      detector = createDetector(saved, config);
    },
    baseline(now: number) {
      if (!last || now - last > READING_AGE_MS || calibrationEnds) return false;
      detector = null;
      recorded = null;
      capture = [];
      feedback = '';
      verdicts = [];
      calibrationEnds = now + baselineMs;
      return true;
    },
    status(now: number): SignalSnapshot {
      if (last && now - last > READING_AGE_MS) reset();
      const verdict = verdicts.at(-1);
      return {
        state: !last ? 'disconnected' : calibrationEnds ? 'calibrating' : !detector ? 'baseline-needed' : verdict?.motion ? 'motion' : 'idle',
        feedback: feedback || undefined,
        readings: trace.slice(), verdicts: verdicts.slice(), baseline: recorded, score: verdict?.score ?? null,
        threshold: recorded ? thresholds(recorded, config).on : null,
        remainingMs: calibrationEnds ? Math.max(0, calibrationEnds - now) : 0,
      };
    },
  };
}
