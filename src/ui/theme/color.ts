/** OKLCH <-> sRGB helpers. three.js materials need hex, tokens.css is authored in OKLCH; these
 * let canvas code state colors in the same OKLCH terms as the CSS tokens. */

function linearToSrgb(c: number): number {
  const v = Math.min(Math.max(c, 0), 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** OKLCH (L 0..1, C, h in degrees) -> sRGB bytes [r, g, b] (gamut-clipped). */
export function oklchToRgb8(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const to8 = (x: number) => Math.round(linearToSrgb(x) * 255);
  return [to8(r), to8(g), to8(bl)];
}

/** OKLCH (L 0..1, C, h in degrees) -> `#rrggbb` (gamut-clipped). */
export function oklchToHex(L: number, C: number, hDeg: number): string {
  const [r, g, b] = oklchToRgb8(L, C, hDeg);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** `#rrggbb` -> [L, C, h]. */
export function hexToOklch(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, C, h];
}
