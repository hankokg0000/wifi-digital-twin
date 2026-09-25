// Sample an agent's state at any time t from its precomputed segments — design.md §7.1.
// O(log segments) via binary search; no per-tick stepping.
import type { SceneDoc, Id, Vec2, Vec3 } from '../scene/types';
import { dist } from '../scene/geometry';
import type { Segment } from './plan';

export interface AgentState {
  levelId: Id;
  position: Vec3; // world position; y = level elevation (or interpolated while on a stair)
  heading: number; // radians, atan2(dx, dz) — 0 = facing +z
  moving: boolean;
  posture: 'standing' | 'walking' | 'fallen';
}

/** Binary-search the segment active at `t` (clamped to the plan's span; holds the last segment
 * past the final t1, since a plan only covers out to its horizon). */
export function activeSegmentIndex(segments: Segment[], t: number): number {
  const last = segments.length - 1;
  if (t <= segments[0]!.t0) return 0;
  if (t >= segments[last]!.t1) return last;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid]!.t1 <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function headingOf(path: Vec2[], fromIndex: number): number {
  for (let i = Math.min(fromIndex, path.length - 1); i > 0; i--) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (dist(a, b) > 1e-6) return Math.atan2(b[0] - a[0], b[1] - a[1]);
  }
  return 0;
}

/** Point + heading at fraction `frac` (0..1) along a polyline, measured by arc length. */
function pointAlongPolyline(path: Vec2[], frac: number): { point: Vec2; heading: number } {
  if (path.length === 1) return { point: path[0]!, heading: 0 };
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = dist(path[i - 1]!, path[i]!);
    segLens.push(d);
    total += d;
  }
  if (total < 1e-9) return { point: path[0]!, heading: headingOf(path, path.length - 1) };

  let target = Math.min(Math.max(frac, 0), 1) * total;
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i]!;
    if (target <= len || i === segLens.length - 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const t = len > 1e-9 ? Math.min(Math.max(target / len, 0), 1) : 0;
      const point: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const heading = dist(a, b) > 1e-6 ? Math.atan2(b[0] - a[0], b[1] - a[1]) : headingOf(path, i);
      return { point, heading };
    }
    target -= len;
  }
  return { point: path[path.length - 1]!, heading: headingOf(path, path.length - 1) };
}

function idleHeading(doc: SceneDoc, segments: Segment[], idleIndex: number): number {
  // Face the direction we arrived from, if the previous segment was a walk; otherwise 0.
  const prev = segments[idleIndex - 1];
  if (prev && prev.kind === 'walk' && prev.path.length >= 2) {
    return headingOf(prev.path, prev.path.length - 1);
  }
  return 0;
}

/** Sample one agent's world state at time `t` from its precomputed segments. */
export function sampleAgent(doc: SceneDoc, segments: Segment[], t: number): AgentState {
  const idx = activeSegmentIndex(segments, t);
  const seg = segments[idx]!;
  const clampedT = Math.min(Math.max(t, seg.t0), seg.t1);

  if (seg.kind === 'idle') {
    const level = doc.levels.find((l) => l.id === seg.levelId);
    const y = level?.elevation ?? 0;
    return {
      levelId: seg.levelId,
      position: [seg.p[0], y, seg.p[1]],
      heading: idleHeading(doc, segments, idx),
      moving: false,
      posture: 'standing',
    };
  }

  if (seg.kind === 'fallen') {
    const level = doc.levels.find((l) => l.id === seg.levelId);
    const y = level?.elevation ?? 0;
    return {
      levelId: seg.levelId,
      position: [seg.p[0], y, seg.p[1]],
      heading: idleHeading(doc, segments, idx),
      moving: false,
      posture: 'fallen',
    };
  }

  if (seg.kind === 'walk') {
    const level = doc.levels.find((l) => l.id === seg.levelId);
    const y = level?.elevation ?? 0;
    const frac = (clampedT - seg.t0) / Math.max(seg.t1 - seg.t0, 1e-9);
    const { point, heading } = pointAlongPolyline(seg.path, frac);
    return { levelId: seg.levelId, position: [point[0], y, point[1]], heading, moving: true, posture: 'walking' };
  }

  // stair
  const stair = doc.stairs.find((s) => s.id === seg.stairId);
  const fromLevel = doc.levels.find((l) => l.id === stair?.fromLevelId);
  const toLevel = doc.levels.find((l) => l.id === stair?.toLevelId);
  const frac = (clampedT - seg.t0) / Math.max(seg.t1 - seg.t0, 1e-9);
  const bottom = stair?.bottom ?? [0, 0];
  const top = stair?.top ?? [0, 0];
  const x = bottom[0] + (top[0] - bottom[0]) * frac;
  const z = bottom[1] + (top[1] - bottom[1]) * frac;
  const y = (fromLevel?.elevation ?? 0) + ((toLevel?.elevation ?? 0) - (fromLevel?.elevation ?? 0)) * frac;
  const dirSign = seg.up ? 1 : -1;
  const heading = Math.atan2(dirSign * (top[0] - bottom[0]), dirSign * (top[1] - bottom[1]));
  // Report whichever level the agent is nearer to; world.ts adds the "also show on the other
  // level" flag for the UI since a stair segment always straddles two levels.
  const levelId = frac < 0.5 ? (stair?.fromLevelId ?? '') : (stair?.toLevelId ?? '');
  return { levelId, position: [x, y, z], heading, moving: true, posture: 'walking' };
}
