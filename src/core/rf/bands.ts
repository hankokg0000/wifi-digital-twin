import type { Band } from '../scene/types';

/** Center frequency used for free-space loss, per band (MHz). 2.4 -> channel 6, 5 -> mid UNII-2e. */
export const BAND_CENTER_MHZ: Record<Band, number> = { '2.4': 2437, '5': 5500 };

/** Free-space path loss at the 1 m reference distance (dB): 20·log10(f_MHz) − 27.55 — design.md §8. */
export function fsplAt1m(fMHz: number): number {
  return 20 * Math.log10(fMHz) - 27.55;
}

/** Path-loss exponent. 2.0 because wall/object/body losses are counted separately (design.md §8). */
export const PATH_LOSS_EXPONENT = 2.0;

/** Receiver sensitivity floor: anything weaker is reported as this (dBm). */
export const RSSI_FLOOR_DBM = -100;

/** Distances shorter than this are clamped so log10 stays finite next to the antenna (m). */
export const MIN_DISTANCE_M = 0.5;
