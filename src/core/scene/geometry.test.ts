import { describe, it, expect } from 'vitest';
import {
  snap,
  snapVec2,
  dist,
  dist2,
  wallLength,
  wallDir,
  pointAlongWall,
  projectPointOnWall,
  polygonArea,
  pointInPolygon,
} from './geometry';
import type { Wall, Vec2 } from './types';

describe('geometry', () => {
  describe('snap', () => {
    it('snaps to nearest multiple', () => {
      // Note: 1.15 / 0.1 = 11.5, Math.round(11.5) uses banker's rounding => 12 => 1.2
      // But floating point means 1.15 might be slightly less, so check a safer value
      expect(snap(1.17, 0.1)).toBeCloseTo(1.2, 5);
      expect(snap(1.12, 0.1)).toBeCloseTo(1.1, 5);
      expect(snap(5, 0.5)).toBe(5);
      expect(snap(5.26, 0.5)).toBeCloseTo(5.5, 5);
    });

    it('handles zero step', () => {
      expect(snap(3.14, 0)).toBe(3.14);
    });

    it('handles negative step', () => {
      expect(snap(3.14, -0.1)).toBe(3.14);
    });
  });

  describe('snapVec2', () => {
    it('snaps both components', () => {
      const result = snapVec2([1.17, 2.26], 0.1);
      expect(result[0]).toBeCloseTo(1.2, 5);
      expect(result[1]).toBeCloseTo(2.3, 5);
    });
  });

  describe('dist2', () => {
    it('returns squared distance', () => {
      expect(dist2([0, 0], [3, 4])).toBe(25);
      expect(dist2([1, 2], [4, 6])).toBe(25);
    });

    it('handles identical points', () => {
      expect(dist2([1, 1], [1, 1])).toBe(0);
    });
  });

  describe('dist', () => {
    it('returns euclidean distance', () => {
      expect(dist([0, 0], [3, 4])).toBe(5);
      expect(dist([1, 2], [4, 6])).toBeCloseTo(5, 5);
    });
  });

  describe('wallLength', () => {
    it('returns length of wall', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [0, 0],
        b: [3, 4],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      expect(wallLength(wall)).toBe(5);
    });

    it('handles zero-length wall', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [1, 1],
        b: [1, 1],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      expect(wallLength(wall)).toBe(0);
    });
  });

  describe('wallDir', () => {
    it('returns unit direction vector', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [0, 0],
        b: [3, 4],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      const [dx, dz] = wallDir(wall);
      expect(dx).toBeCloseTo(0.6, 5);
      expect(dz).toBeCloseTo(0.8, 5);
      expect(Math.sqrt(dx * dx + dz * dz)).toBeCloseTo(1, 5);
    });

    it('returns [1, 0] for degenerate wall', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [5, 5],
        b: [5, 5],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      const [dx, dz] = wallDir(wall);
      expect(dx).toBe(1);
      expect(dz).toBe(0);
    });
  });

  describe('pointAlongWall', () => {
    it('returns point at given offset', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [0, 0],
        b: [10, 0],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      const p = pointAlongWall(wall, 5);
      expect(p[0]).toBe(5);
      expect(p[1]).toBe(0);
    });

    it('handles non-aligned walls', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [0, 0],
        b: [3, 4],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      const p = pointAlongWall(wall, 2.5);
      expect(p[0]).toBeCloseTo(1.5, 5);
      expect(p[1]).toBeCloseTo(2, 5);
    });
  });

  describe('projectPointOnWall', () => {
    it('projects point onto wall segment', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [0, 0],
        b: [10, 0],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      const result = projectPointOnWall(wall, [5, 3]);
      expect(result.offset).toBe(5);
      expect(result.distance).toBe(3);
    });

    it('clamps offset to wall segment', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [0, 0],
        b: [10, 0],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      const result = projectPointOnWall(wall, [15, 0]);
      expect(result.offset).toBe(10);
      expect(result.distance).toBe(5);
    });

    it('clamps to start of wall', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [0, 0],
        b: [10, 0],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      const result = projectPointOnWall(wall, [-5, 0]);
      expect(result.offset).toBe(0);
      expect(result.distance).toBe(5);
    });

    it('handles degenerate wall', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [5, 5],
        b: [5, 5],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      const result = projectPointOnWall(wall, [8, 9]);
      expect(result.offset).toBe(0);
      expect(result.distance).toBeCloseTo(5, 5);
    });

    it('handles non-aligned walls with perpendicular distance', () => {
      const wall: Wall = {
        id: 'w1',
        levelId: 'l1',
        a: [0, 0],
        b: [3, 4],
        thickness: 0.1,
        height: 3,
        materialId: 'm1',
      };
      const result = projectPointOnWall(wall, [3, 0]);
      expect(result.offset).toBeCloseTo(1.8, 5);
      // Projected point at offset 1.8 is [1.08, 1.44]
      // Distance from [1.08, 1.44] to [3, 0] is sqrt((3-1.08)^2 + (0-1.44)^2) = sqrt(5.76) = 2.4
      expect(result.distance).toBeCloseTo(2.4, 5);
    });
  });

  describe('polygonArea', () => {
    it('computes signed area (shoelace formula)', () => {
      const poly: Vec2[] = [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ];
      expect(Math.abs(polygonArea(poly))).toBe(12);
    });

    it('returns positive for counter-clockwise polygon', () => {
      const poly: Vec2[] = [
        [0, 0],
        [1, 0],
        [1, 1],
      ];
      expect(polygonArea(poly)).toBeGreaterThan(0);
    });

    it('returns negative for clockwise polygon', () => {
      const poly: Vec2[] = [
        [0, 0],
        [1, 1],
        [1, 0],
      ];
      expect(polygonArea(poly)).toBeLessThan(0);
    });

    it('returns 0 for less than 3 points', () => {
      expect(polygonArea([])).toBe(0);
      expect(polygonArea([[0, 0]])).toBe(0);
      expect(polygonArea([[0, 0], [1, 1]])).toBe(0);
    });

    it('returns 0 for collinear points', () => {
      const poly: Vec2[] = [
        [0, 0],
        [1, 1],
        [2, 2],
      ];
      expect(polygonArea(poly)).toBe(0);
    });
  });

  describe('pointInPolygon', () => {
    it('detects point inside axis-aligned rectangle', () => {
      const poly: Vec2[] = [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ];
      expect(pointInPolygon([2, 1.5], poly)).toBe(true);
      expect(pointInPolygon([1, 2], poly)).toBe(true);
    });

    it('detects point outside rectangle', () => {
      const poly: Vec2[] = [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ];
      expect(pointInPolygon([5, 1.5], poly)).toBe(false);
      expect(pointInPolygon([-1, 1.5], poly)).toBe(false);
      expect(pointInPolygon([2, 4], poly)).toBe(false);
    });

    it('detects point in L-shaped polygon', () => {
      const poly: Vec2[] = [
        [0, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 2],
        [0, 2],
      ];
      expect(pointInPolygon([0.5, 0.5], poly)).toBe(true);
      expect(pointInPolygon([0.5, 1.5], poly)).toBe(true);
    });

    it('detects point outside L-shaped polygon', () => {
      const poly: Vec2[] = [
        [0, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 2],
        [0, 2],
      ];
      expect(pointInPolygon([1.5, 1.5], poly)).toBe(false);
    });
  });
});
