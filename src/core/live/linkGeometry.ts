import type { Band, Id, Room, SceneDoc, Vec2 } from '../scene/types';
import { pointInPolygon } from '../scene/geometry';
import { BAND_CENTER_MHZ } from '../rf/bands';

/** The placed Link of a Site's Quick Room: where the two real devices sit, on one level. */
export interface LiveLink {
  levelId: Id;
  tx: Vec2;
  rx: Vec2;
  band: Band;
}

const LIGHT_SPEED = 299_792_458;
const MIN_CROSSED_M = 0.01;

/** Finds the Live Link by radio id suffix (`-live-tx` / `-live-rx`); null for any other doc. */
export function liveLinkOf(doc: SceneDoc): LiveLink | null {
  const tx = doc.radios.find((r) => r.id.endsWith('-live-tx'));
  const rx = doc.radios.find((r) => r.id.endsWith('-live-rx'));
  if (!tx || !rx || tx.levelId !== rx.levelId) return null;
  return {
    levelId: tx.levelId,
    tx: [tx.position[0], tx.position[2]],
    rx: [rx.position[0], rx.position[2]],
    band: tx.ifaces[0]?.band ?? '2.4',
  };
}

/** Parameter t (0..1) along a→b where it crosses edge c→d, or null if parallel / not crossing. */
function crossT(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const rx = b[0] - a[0];
  const rz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c[0] - a[0];
  const qz = c[1] - a[1];
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Length (m) of segment a→b lying inside the polygon; concave-safe. */
export function segmentLengthInPolygon(a: Vec2, b: Vec2, poly: Vec2[]): number {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len === 0 || poly.length < 3) return 0;
  const ts = [0, 1];
  for (let i = 0; i < poly.length; i++) {
    const t = crossT(a, b, poly[i]!, poly[(i + 1) % poly.length]!);
    if (t !== null) ts.push(t);
  }
  ts.sort((p, q) => p - q);
  let inside = 0;
  for (let i = 0; i + 1 < ts.length; i++) {
    const t1 = ts[i]!;
    const t2 = ts[i + 1]!;
    if (t2 - t1 < 1e-9) continue;
    const tm = (t1 + t2) / 2;
    const mid: Vec2 = [a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm];
    if (pointInPolygon(mid, poly)) inside += (t2 - t1) * len;
  }
  return inside;
}

/** Rooms the segment passes through (> 1 cm), longest first. */
export function roomsCrossed(rooms: Room[], a: Vec2, b: Vec2): { roomId: Id; lengthM: number }[] {
  return rooms
    .map((r) => ({ roomId: r.id, lengthM: segmentLengthInPolygon(a, b, r.polygon) }))
    .filter((x) => x.lengthM > MIN_CROSSED_M)
    .sort((p, q) => q.lengthM - p.lengthM);
}

/** The room the segment passes through longest, or null if it misses them all. */
export function autoMonitoredRoomId(rooms: Room[], a: Vec2, b: Vec2): Id | null {
  return roomsCrossed(rooms, a, b)[0]?.roomId ?? null;
}

/** Half-width (m) of the Coverage band at its middle: 0.5·sqrt(λ·D), clamped to 0.25–0.5. */
export function coverageMidHalfWidth(distanceM: number, band: Band): number {
  const lambda = LIGHT_SPEED / (BAND_CENTER_MHZ[band] * 1e6);
  const h = 0.5 * Math.sqrt(lambda * Math.max(0, distanceM));
  return Math.min(0.5, Math.max(0.25, h));
}

/** Lens outline around a→b (closed ring, no duplicated tips), widest in the middle. */
export function coverageBand(a: Vec2, b: Vec2, band: Band, samples = 16): Vec2[] {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const d = Math.hypot(dx, dz);
  if (d === 0) return [];
  const nx = -dz / d;
  const nz = dx / d;
  const h = coverageMidHalfWidth(d, band);
  const at = (t: number, side: 1 | -1): Vec2 => {
    const w = side * h * Math.sqrt(4 * t * (1 - t));
    return [a[0] + dx * t + nx * w, a[1] + dz * t + nz * w];
  };
  const n = Math.max(2, samples);
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) pts.push(at(i / n, 1)); // A tip … B tip
  for (let i = n - 1; i >= 1; i--) pts.push(at(i / n, -1)); // back, tips not repeated
  return pts;
}

export function linkMidpoint(a: Vec2, b: Vec2): Vec2 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}
