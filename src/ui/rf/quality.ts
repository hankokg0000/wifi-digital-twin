import { Wifi, WifiHigh, WifiLow, WifiOff, type LucideIcon } from 'lucide-react';
import type { SignalQuality } from '../../core';

export const QUALITY_TH: Record<SignalQuality, string> = {
  excellent: 'ดีมาก',
  good: 'ดี',
  fair: 'พอใช้',
  poor: 'อ่อน',
  none: 'อ่อนมาก',
};

/** Signal-bars glyph by quality — the shape carries the meaning, colour only reinforces it. */
export const QUALITY_ICON: Record<SignalQuality, LucideIcon> = {
  excellent: Wifi,
  good: WifiHigh,
  fair: WifiLow,
  poor: WifiLow,
  none: WifiOff,
};

/** ok / ink / ink-2 / ink-3 tokens only: red and amber stay reserved for alerts. */
export const QUALITY_COLOR: Record<SignalQuality, string> = {
  excellent: 'var(--ok)',
  good: 'var(--ink)',
  fair: 'var(--ink-2)',
  poor: 'var(--ink-3)',
  none: 'var(--ink-3)',
};

/** "−52" with a true minus sign, for dBm readouts. */
export function fmtDbm(dbm: number): string {
  return Math.round(dbm).toString().replace('-', '−');
}

export function polygonCentroid(polygon: [number, number][]): [number, number] {
  let x = 0;
  let z = 0;
  for (const p of polygon) {
    x += p[0];
    z += p[1];
  }
  return [x / polygon.length, z / polygon.length];
}
