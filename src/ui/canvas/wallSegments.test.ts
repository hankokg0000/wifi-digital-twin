import { describe, it, expect } from 'vitest';
import { computeWallSegments } from './wallSegments';
import type { Wall, Opening } from '../../core';

describe('wallSegments', () => {
  const makeWall = (a: [number, number], b: [number, number], height: number = 3.0): Wall => ({
    id: 'w1',
    levelId: 'l1',
    a,
    b,
    thickness: 0.1,
    height,
    materialId: 'brick',
  });

  const makeOpening = (
    wallId: string,
    offset: number,
    width: number,
    sill: number,
    height: number,
  ): Opening => ({
    id: 'o1',
    wallId,
    kind: 'door',
    offset,
    width,
    sill,
    height,
    materialId: 'wood-door',
    open: false,
  });

  it('returns one full-height segment for wall with no openings', () => {
    const wall = makeWall([0, 0], [10, 0]);
    const segments = computeWallSegments(wall, []);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      offsetStart: 0,
      offsetEnd: 10,
      yStart: 0,
      yEnd: 3.0,
    });
  });

  it('splits wall around door (sill=0)', () => {
    const wall = makeWall([0, 0], [10, 0]);
    const door = makeOpening('w1', 4, 1, 0, 2.0); // door from offset 4 to 5, no sill
    const segments = computeWallSegments(wall, [door]);

    // Should have: left piece, lintel above door
    const pieces = segments.map((s) => [s.offsetStart, s.offsetEnd, s.yStart, s.yEnd]);
    expect(pieces).toContainEqual([0, 4, 0, 3.0]); // left of door
    expect(pieces).toContainEqual([4, 5, 2.0, 3.0]); // lintel above door
    expect(pieces).toContainEqual([5, 10, 0, 3.0]); // right of door
  });

  it('splits wall around window (sill > 0)', () => {
    const wall = makeWall([0, 0], [10, 0]);
    const window = makeOpening('w1', 4, 1.2, 0.9, 1.2); // window from offset 4, sill at 0.9
    const segments = computeWallSegments(wall, [window]);

    const pieces = segments.map((s) => [s.offsetStart, s.offsetEnd, s.yStart, s.yEnd]);
    expect(pieces).toContainEqual([0, 4, 0, 3.0]); // left of window
    expect(pieces).toContainEqual([4, 5.2, 0, 0.9]); // below window sill
    expect(pieces).toContainEqual([4, 5.2, 2.1, 3.0]); // above window (0.9 + 1.2 = 2.1)
    expect(pieces).toContainEqual([5.2, 10, 0, 3.0]); // right of window
  });

  it('clips yEnd to cutHeight', () => {
    const wall = makeWall([0, 0], [10, 0], 3.0);
    const segments = computeWallSegments(wall, [], 1.2);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.yEnd).toBe(1.2); // clipped from 3.0
    expect(segments[0]!.yStart).toBe(0);
  });

  it('drops segments entirely above cutHeight', () => {
    const wall = makeWall([0, 0], [10, 0], 3.0);
    const door = makeOpening('w1', 4, 1, 0, 2.0); // lintel from 2.0 to 3.0
    const segments = computeWallSegments(wall, [door], 1.2); // cut at 1.2

    // Should not have the lintel (which starts at 2.0 > 1.2)
    for (const seg of segments) {
      expect(seg.yStart).toBeLessThan(1.2);
    }
  });

  it('handles multiple non-overlapping openings', () => {
    const wall = makeWall([0, 0], [20, 0]);
    const door1 = makeOpening('w1', 2, 1, 0, 2.0);
    const door2 = makeOpening('w1', 10, 1, 0, 2.0);
    const segments = computeWallSegments(wall, [door1, door2]);

    // Should have: left, lintel1, middle, lintel2, right
    expect(segments.length).toBeGreaterThanOrEqual(5);

    // Check ordering
    const sortedSegs = segments.sort((a, b) => a.offsetStart - b.offsetStart);
    for (let i = 0; i < sortedSegs.length - 1; i++) {
      expect(sortedSegs[i]!.offsetEnd).toBeLessThanOrEqual(sortedSegs[i + 1]!.offsetStart);
    }
  });

  it('handles window with sill and height that leaves space above', () => {
    const wall = makeWall([0, 0], [10, 0], 3.0);
    const window = makeOpening('w1', 3, 1, 1.0, 1.0); // sill 1.0, height 1.0, top at 2.0
    const segments = computeWallSegments(wall, [window]);

    const pieces = segments.map((s) => [s.offsetStart, s.offsetEnd, s.yStart, s.yEnd]);
    expect(pieces).toContainEqual([3, 4, 0, 1.0]); // below sill
    expect(pieces).toContainEqual([3, 4, 2.0, 3.0]); // above window
  });

  it('handles tall opening that reaches wall top', () => {
    const wall = makeWall([0, 0], [10, 0], 2.0);
    const opening = makeOpening('w1', 2, 1, 0, 2.0); // full height door
    const segments = computeWallSegments(wall, [opening]);

    // Should only have left and right pieces
    const pieces = segments.map((s) => [s.offsetStart, s.offsetEnd, s.yStart, s.yEnd]);
    expect(pieces).toContainEqual([0, 2, 0, 2.0]); // left
    expect(pieces).toContainEqual([3, 10, 0, 2.0]); // right
    // No lintel (no space above)
  });

  it('handles opening at wall start', () => {
    const wall = makeWall([0, 0], [10, 0]);
    const opening = makeOpening('w1', 0, 1.5, 0, 2.0);
    const segments = computeWallSegments(wall, [opening]);

    // Should have lintel and right piece
    const pieces = segments.map((s) => [s.offsetStart, s.offsetEnd, s.yStart, s.yEnd]);
    expect(pieces).toContainEqual([1.5, 10, 0, 3.0]); // right
    expect(pieces).toContainEqual([0, 1.5, 2.0, 3.0]); // lintel
  });

  it('handles opening at wall end', () => {
    const wall = makeWall([0, 0], [10, 0]);
    const opening = makeOpening('w1', 8.5, 1.5, 0, 2.0);
    const segments = computeWallSegments(wall, [opening]);

    const pieces = segments.map((s) => [s.offsetStart, s.offsetEnd, s.yStart, s.yEnd]);
    expect(pieces).toContainEqual([0, 8.5, 0, 3.0]); // left
    expect(pieces).toContainEqual([8.5, 10, 2.0, 3.0]); // lintel
  });

  it('cutHeight only clips, does not remove segments starting below', () => {
    const wall = makeWall([0, 0], [10, 0], 3.0);
    const segments = computeWallSegments(wall, [], 1.5);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.yStart).toBe(0);
    expect(segments[0]!.yEnd).toBe(1.5);
  });

  it('cutHeight removes segment starting above', () => {
    const wall = makeWall([0, 0], [10, 0], 3.0);
    const door = makeOpening('w1', 4, 1, 0, 2.0); // lintel from 2.0 to 3.0
    const segments = computeWallSegments(wall, [door], 1.5); // cut at 1.5

    // Lintel segment (2.0 to 3.0) should be removed entirely
    for (const seg of segments) {
      expect(seg.yStart).toBeLessThan(1.5);
    }
  });
});
