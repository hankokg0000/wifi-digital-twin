import type { Wall, Opening } from '../../core';
import { wallLength, wallDir } from '../../core';

/**
 * three.js Y-axis rotation that maps a box's local +X axis onto the wall's direction
 * vector (dx, dz) in the XZ plane. Derived from Three's rotation-Y matrix:
 * local (1,0,0) -> (cos(rotationY), 0, -sin(rotationY)), solved for (dx, dz).
 */
export function wallRotationY(wall: Wall): number {
  const [dx, dz] = wallDir(wall);
  return -Math.atan2(dz, dx);
}

export interface WallSegment {
  offsetStart: number;
  offsetEnd: number;
  yStart: number;
  yEnd: number;
}

/**
 * Split a wall's centerline (and height) into solid boxes around its openings:
 * full-height pieces where there's no opening, plus below-sill / above-opening
 * pieces across each opening. Assumes openings on this wall don't overlap
 * (guaranteed by validateDoc).
 *
 * `cutHeight` clips everything above it, like an architectural plan cut, so openings
 * show as gaps when the wall is seen from above.
 */
export function computeWallSegments(wall: Wall, openings: Opening[], cutHeight = Infinity): WallSegment[] {
  const length = wallLength(wall);
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const segments: WallSegment[] = [];
  let cursor = 0;

  for (const o of sorted) {
    if (o.offset > cursor) {
      segments.push({ offsetStart: cursor, offsetEnd: o.offset, yStart: 0, yEnd: wall.height });
    }
    if (o.sill > 0) {
      segments.push({ offsetStart: o.offset, offsetEnd: o.offset + o.width, yStart: 0, yEnd: o.sill });
    }
    if (o.sill + o.height < wall.height) {
      segments.push({
        offsetStart: o.offset,
        offsetEnd: o.offset + o.width,
        yStart: o.sill + o.height,
        yEnd: wall.height,
      });
    }
    cursor = Math.max(cursor, o.offset + o.width);
  }

  if (cursor < length) {
    segments.push({ offsetStart: cursor, offsetEnd: length, yStart: 0, yEnd: wall.height });
  }

  return segments
    .filter((s) => s.yStart < cutHeight)
    .map((s) => ({ ...s, yEnd: Math.min(s.yEnd, cutHeight) }));
}
