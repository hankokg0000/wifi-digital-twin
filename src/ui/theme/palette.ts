import { oklchToHex, hexToOklch } from './color';

/** Hex mirrors of the CSS tokens in tokens.css, for three.js materials (which can't read CSS
 * custom properties). Stated in the same OKLCH terms so the two stay visibly in step. */
export const PALETTE = {
  bg: oklchToHex(0.17, 0.012, 265),
  surface1: oklchToHex(0.205, 0.012, 265),
  surface2: oklchToHex(0.24, 0.013, 265),
  surface3: oklchToHex(0.29, 0.014, 265),
  line: oklchToHex(0.32, 0.012, 265),
  ink: oklchToHex(0.95, 0.005, 265),
  ink2: oklchToHex(0.78, 0.01, 265),
  ink3: oklchToHex(0.62, 0.012, 265),
  accent: oklchToHex(0.72, 0.15, 285),
  critical: oklchToHex(0.66, 0.21, 25),
  warning: oklchToHex(0.82, 0.15, 80),
  ok: oklchToHex(0.76, 0.14, 155),
  wall: oklchToHex(0.82, 0.01, 265),
  gridMinor: oklchToHex(0.235, 0.012, 265),
  gridMajor: oklchToHex(0.285, 0.013, 265),
  slab: oklchToHex(0.215, 0.012, 265),
  furniture3d: oklchToHex(0.36, 0.014, 265),
} as const;

/** Wall color: a light neutral nudged toward the material's own hue — the material reads only
 * as a subtle tint (brick slightly warm, drywall lighter, concrete neutral), never as a fill. */
export function wallTint(materialHex: string, toLightness = 0.82): string {
  const [L, C, h] = hexToOklch(materialHex);
  return oklchToHex(toLightness + (L - 0.65) * 0.18, Math.min(C * 0.12, 0.016), h);
}
