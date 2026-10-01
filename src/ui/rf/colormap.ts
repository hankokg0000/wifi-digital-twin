import { oklchToRgb8 } from '../theme/color';

/** RSSI colormap anchors (dBm -> OKLCH). Lightness rises monotonically with signal and hue walks
 * indigo -> blue -> teal -> mint, topping out at -30 dBm (in-room home WiFi sits around -25..-55, so
 * the ramp must still separate those) and at L 0.74 so room labels stay readable on top. so it stays readable in greyscale and colour-blind safe. It
 * deliberately avoids red/amber/green-red: those are reserved for alerts (tokens.css). */
export const COLORMAP_STOPS: { dbm: number; l: number; c: number; h: number }[] = [
  { dbm: -90, l: 0.3, c: 0.1, h: 285 }, // deep indigo
  { dbm: -75, l: 0.42, c: 0.14, h: 275 }, // violet-blue
  { dbm: -67, l: 0.5, c: 0.13, h: 255 }, // blue
  { dbm: -55, l: 0.58, c: 0.11, h: 225 }, // steel teal
  { dbm: -40, l: 0.66, c: 0.11, h: 190 }, // teal
  { dbm: -30, l: 0.74, c: 0.1, h: 168 }, // mint
];

export const COLORMAP_MIN_DBM = COLORMAP_STOPS[0]!.dbm;
export const COLORMAP_MAX_DBM = COLORMAP_STOPS[COLORMAP_STOPS.length - 1]!.dbm;

function oklchAt(dbm: number): [number, number, number] {
  const stops = COLORMAP_STOPS;
  if (dbm <= stops[0]!.dbm) return [stops[0]!.l, stops[0]!.c, stops[0]!.h];
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i]!;
    if (dbm <= b.dbm) {
      const a = stops[i - 1]!;
      const t = (dbm - a.dbm) / (b.dbm - a.dbm);
      return [a.l + (b.l - a.l) * t, a.c + (b.c - a.c) * t, a.h + (b.h - a.h) * t];
    }
  }
  const last = stops[stops.length - 1]!;
  return [last.l, last.c, last.h];
}

const LUT_SIZE = 256;

/** 256 sRGB entries covering [COLORMAP_MIN_DBM, COLORMAP_MAX_DBM] (RGB bytes, 3 per entry). */
export const COLORMAP_LUT: Uint8Array = (() => {
  const lut = new Uint8Array(LUT_SIZE * 3);
  for (let i = 0; i < LUT_SIZE; i++) {
    const dbm = COLORMAP_MIN_DBM + ((COLORMAP_MAX_DBM - COLORMAP_MIN_DBM) * i) / (LUT_SIZE - 1);
    const [l, c, h] = oklchAt(dbm);
    const [r, g, b] = oklchToRgb8(l, c, h);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
})();

/** LUT index (0..255) for a dBm value, clamped to the ramp's ends. */
export function lutIndex(dbm: number): number {
  const t = (dbm - COLORMAP_MIN_DBM) / (COLORMAP_MAX_DBM - COLORMAP_MIN_DBM);
  return Math.round(Math.min(1, Math.max(0, t)) * (LUT_SIZE - 1));
}

/** `rgb(r g b)` CSS colour for a dBm value (legend gradient stops, tinted UI). */
export function dbmToCss(dbm: number): string {
  const i = lutIndex(dbm) * 3;
  return `rgb(${COLORMAP_LUT[i]} ${COLORMAP_LUT[i + 1]} ${COLORMAP_LUT[i + 2]})`;
}

/** Heatmap -> RGBA bytes (one texel per cell, row r = z index). NaN cells are alpha 0 but borrow a
 * neighbour's colour so linear filtering never fringes the room edges with black. */
export function heatmapToRgba(values: Float32Array, cols: number, rows: number): Uint8Array {
  const data = new Uint8Array(cols * rows * 4);
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (Number.isNaN(v)) continue;
    const k = lutIndex(v) * 3;
    data[i * 4] = COLORMAP_LUT[k]!;
    data[i * 4 + 1] = COLORMAP_LUT[k + 1]!;
    data[i * 4 + 2] = COLORMAP_LUT[k + 2]!;
    data[i * 4 + 3] = 255;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (data[i * 4 + 3] !== 0) continue;
      const nb = [
        c > 0 ? i - 1 : -1,
        c < cols - 1 ? i + 1 : -1,
        r > 0 ? i - cols : -1,
        r < rows - 1 ? i + cols : -1,
      ].find((j) => j >= 0 && data[j * 4 + 3] === 255);
      if (nb !== undefined) {
        data[i * 4] = data[nb * 4]!;
        data[i * 4 + 1] = data[nb * 4 + 1]!;
        data[i * 4 + 2] = data[nb * 4 + 2]!;
      }
    }
  }
  return data;
}
