import { createSignalTracker, type SignalSnapshot } from '../sensing/signal-tracker';
import { DEFAULT_DETECTOR_CONFIG } from '../sensing/types';
import { parseEspCsi } from './room-monitor';

export const INDOOR_WIFI_API = '/indoor-twin/api/wifi/';
export const CSI_BASELINE_MS = 15_000;
export interface IndoorWifiSnapshot extends SignalSnapshot { roomId: string | null }

export function createCsiTracker(peer?: string) {
  const tracker = createSignalTracker({ config: DEFAULT_DETECTOR_CONFIG, baselineMs: CSI_BASELINE_MS, traceLimit: 240 });
  function acceptSample(sample: NonNullable<ReturnType<typeof parseEspCsi>>, now: number) {
    if (!peer || sample.peer === peer) tracker.acceptSample(sample, now);
  }
  return {
    ...tracker,
    acceptSample,
    accept(line: string, now: number) {
      const sample = parseEspCsi(line);
      if (sample) acceptSample(sample, now);
    },
  };
}
