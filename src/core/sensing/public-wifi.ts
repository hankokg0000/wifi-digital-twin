import type { SignalSnapshot } from './signal-tracker';

export const PUBLIC_WIFI_PATH = '/indoor-twin/live-wifi.json';
export const INDOOR_RSSI_SHARE_PATH = '/indoor-twin/api/rssi/share';
const MAX_AGE_MS = 8_000;

export interface PublicWifiSnapshot extends Pick<SignalSnapshot, 'readings' | 'verdicts'> {
  version: 1;
  updatedAt: number;
  roomId: string | null;
  state: 'disconnected' | 'baseline-needed' | 'idle' | 'motion';
}

export function makePublicWifiSnapshot(signal: SignalSnapshot, roomId: string | null, now: number): PublicWifiSnapshot {
  const disconnected = signal.state === 'disconnected';
  const active = !disconnected && roomId !== null && signal.baseline !== null;
  const state = disconnected ? 'disconnected' : signal.state === 'motion' && active ? 'motion'
    : active && signal.verdicts.length > 0 ? 'idle' : 'baseline-needed';
  return {
    version: 1,
    updatedAt: now,
    roomId,
    state,
    readings: disconnected ? [] : signal.readings.filter((_, index, all) => (all.length - 1 - index) % 3 === 0),
    verdicts: active ? signal.verdicts : [],
  };
}

export function parsePublicWifiSnapshot(value: unknown, now: number): PublicWifiSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as PublicWifiSnapshot;
  if (data.version !== 1 || !Number.isFinite(data.updatedAt) || now - data.updatedAt > MAX_AGE_MS ||
      now - data.updatedAt < -MAX_AGE_MS || (data.roomId !== null && typeof data.roomId !== 'string') ||
      !['disconnected', 'baseline-needed', 'idle', 'motion'].includes(data.state) ||
      !Array.isArray(data.readings) || !data.readings.every(reading =>
        reading && Number.isFinite(reading.t) && Number.isFinite(reading.rssi)) ||
      !Array.isArray(data.verdicts) || !data.verdicts.every(verdict =>
        verdict && Number.isFinite(verdict.t) && Number.isFinite(verdict.score) && Number.isFinite(verdict.onThreshold))) return undefined;
  return data;
}
