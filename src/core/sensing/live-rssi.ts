import type { Baseline } from './types';

export const INDOOR_RSSI_STREAM = '/indoor-twin/api/rssi/stream';
export const RSSI_BASELINE_MS = 30_000;

export function observedRssi(mode: string, data: unknown) {
  if (mode !== 'live' || !data || typeof data !== 'object') return null;
  const { rssi, channel } = data as { rssi?: unknown; channel?: unknown };
  if (typeof rssi !== 'number' || !Number.isFinite(rssi) || rssi >= 0 || rssi < -127 ||
      typeof channel !== 'number' || !Number.isInteger(channel) || channel < 0 || channel > 233) return null;
  return { power: rssi, channel, key: `rssi/${channel}` };
}

export interface SavedRssiLink {
  roomId: string;
  baseline?: { channel: number; value: Baseline };
}

export function parseSavedRssiLink(value: unknown): SavedRssiLink | null {
  if (!value || typeof value !== 'object') return null;
  const { roomId, baseline: saved } = value as Partial<SavedRssiLink>;
  if (typeof roomId !== 'string' || !/^[a-z-]{1,24}$/.test(roomId)) return null;
  const channel = saved?.channel;
  const baseline = saved?.value;
  if (typeof channel !== 'number' || !Number.isInteger(channel) || channel < 0 || channel > 233 ||
      !baseline || typeof baseline.recordedAt !== 'string' || !Number.isFinite(Date.parse(baseline.recordedAt)) ||
      !Number.isFinite(baseline.durationS) || baseline.durationS < 24 ||
      !Number.isInteger(baseline.samples) || baseline.samples < 120 ||
      !Number.isFinite(baseline.meanRssi) || baseline.meanRssi >= 0 || baseline.meanRssi < -127 ||
      !Number.isFinite(baseline.windowStdMean) || baseline.windowStdMean < 0 ||
      !Number.isFinite(baseline.windowStdSd) || baseline.windowStdSd <= 0) return { roomId };
  return { roomId, baseline: { channel, value: baseline } };
}
