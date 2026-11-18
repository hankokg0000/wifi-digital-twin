// WiFi Sensing — pure types. No React, DOM or sim imports.

/** One timestamped measurement of a Link's signal strength. */
export interface Reading {
  /** Seconds (any epoch; only differences matter). */
  t: number;
  /** dBm. */
  rssi: number;
}

/** What a still room looks like on a Link: the spread of windowed std-dev. */
export interface Baseline {
  recordedAt: string;
  durationS: number;
  meanRssi: number;
  /** Mean of the windowed std-dev over the recording. */
  windowStdMean: number;
  /** Std-dev of the windowed std-dev (floored at DetectorConfig.sdFloor). */
  windowStdSd: number;
  samples: number;
}

export interface DetectorConfig {
  windowS: number;
  stepS: number;
  /** Turn ON when score > mean + kOn * sd. */
  kOn: number;
  /** Turn OFF when score < mean + kOff * sd. */
  kOff: number;
  /** Consecutive steps above the ON threshold needed to turn on. */
  onConsecutive: number;
  /** Seconds the score must stay below the OFF threshold to turn off. */
  offHoldS: number;
  sdFloor: number;
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  windowS: 2,
  stepS: 0.5,
  kOn: 3,
  kOff: 1.5,
  onConsecutive: 2,
  offHoldS: 3,
  sdFloor: 0.3,
};

/** Motion Detection verdict for one step of reading time. */
export interface Verdict {
  t: number;
  motion: boolean;
  /** Windowed std-dev of RSSI (dB). */
  score: number;
  onThreshold: number;
  offThreshold: number;
}
