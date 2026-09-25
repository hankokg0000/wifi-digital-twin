import type { Wall, Vec2, Id } from '../../core';
import { snapVec2, dist, projectPointOnWall } from '../../core';

const GRID_SNAP = 0.1;
const ENDPOINT_SNAP = 0.25;

export interface SnapResult {
  point: Vec2;
  snappedToEndpoint: boolean;
}

/** Snap a raw pointer point: prefer nearby wall endpoints (0.25 m), else fall back to the 0.1 m grid. */
export function computeSnap(raw: Vec2, walls: Wall[]): SnapResult {
  let nearest: Vec2 | null = null;
  let nearestDist = Infinity;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      const d = dist(raw, p);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = p;
      }
    }
  }
  if (nearest && nearestDist <= ENDPOINT_SNAP) {
    return { point: [nearest[0], nearest[1]], snappedToEndpoint: true };
  }
  return { point: snapVec2(raw, GRID_SNAP), snappedToEndpoint: false };
}

export interface HoverWall {
  wallId: Id;
  offset: number;
}

/** Find the nearest wall to a point (within its thickness + a little slop), for door/window placement. */
export function findHoverWall(point: Vec2, walls: Wall[], tolerance = 0.35): HoverWall | null {
  let best: (HoverWall & { distance: number }) | null = null;
  for (const w of walls) {
    const { offset, distance } = projectPointOnWall(w, point);
    const threshold = w.thickness / 2 + tolerance;
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { wallId: w.id, offset, distance };
    }
  }
  return best ? { wallId: best.wallId, offset: best.offset } : null;
}
