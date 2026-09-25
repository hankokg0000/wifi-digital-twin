import type { Vec2, Wall } from './types';

/** Snap a scalar to the nearest multiple of `step`. */
export function snap(n: number, step: number): number {
  if (step <= 0) return n;
  return Math.round(n / step) * step;
}

/** Snap both components of a Vec2 to `step`. */
export function snapVec2(p: Vec2, step: number): Vec2 {
  return [snap(p[0], step), snap(p[1], step)];
}

/** Squared distance between two points (avoids a sqrt when only comparing). */
export function dist2(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dz = a[1] - b[1];
  return dx * dx + dz * dz;
}

/** Euclidean distance between two points. */
export function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt(dist2(a, b));
}

/** Length of a wall's centerline. */
export function wallLength(w: Wall): number {
  return dist(w.a, w.b);
}

/** Unit direction vector from a to b. Returns [1, 0] for a degenerate (zero-length) wall. */
export function wallDir(w: Wall): Vec2 {
  const len = wallLength(w);
  if (len === 0) return [1, 0];
  return [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len];
}

/** Point at a given offset (meters from a) along the wall's centerline. */
export function pointAlongWall(w: Wall, offset: number): Vec2 {
  const [dx, dz] = wallDir(w);
  return [w.a[0] + dx * offset, w.a[1] + dz * offset];
}

/**
 * Project a point onto the wall's centerline (infinite line clamped to the segment).
 * Returns the offset along the wall (meters from a, clamped to [0, length]) and the
 * perpendicular distance from the point to that projected point.
 */
export function projectPointOnWall(w: Wall, p: Vec2): { offset: number; distance: number } {
  const len = wallLength(w);
  if (len === 0) {
    return { offset: 0, distance: dist(w.a, p) };
  }
  const [dx, dz] = wallDir(w);
  const vx = p[0] - w.a[0];
  const vz = p[1] - w.a[1];
  const rawOffset = vx * dx + vz * dz;
  const offset = Math.min(len, Math.max(0, rawOffset));
  const proj: Vec2 = [w.a[0] + dx * offset, w.a[1] + dz * offset];
  return { offset, distance: dist(proj, p) };
}

/** Signed polygon area (shoelace formula). Positive = counter-clockwise in XZ. */
export function polygonArea(poly: Vec2[]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i]!;
    const p1 = poly[(i + 1) % poly.length]!;
    sum += p0[0] * p1[1] - p1[0] * p0[1];
  }
  return sum / 2;
}

/** Point-in-polygon test (ray casting). Boundary behavior is unspecified. */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  const [px, pz] = p;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]!;
    const pj = poly[j]!;
    const xi = pi[0];
    const zi = pi[1];
    const xj = pj[0];
    const zj = pj[1];
    const intersect = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
