import { describe, it, expect } from 'vitest';
import { roomStatus, type AlertPoint } from './roomStatus';
import type { Vec2 } from '../../core';

// 10 x 10 square room, [x, z] vertices.
const SQUARE: Vec2[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const WARNING = (p: Vec2): AlertPoint => ({ p, severity: 'warning' });
const CRITICAL = (p: Vec2): AlertPoint => ({ p, severity: 'critical' });

describe('roomStatus', () => {
  it('is empty when nobody is inside and there are no alerts', () => {
    expect(roomStatus(SQUARE, [], [])).toBe('empty');
  });

  it('is occupied when an agent stands inside the polygon', () => {
    expect(roomStatus(SQUARE, [[5, 5]], [])).toBe('occupied');
  });

  it('ignores agents outside the polygon', () => {
    expect(roomStatus(SQUARE, [[20, 5], [-3, 5]], [])).toBe('empty');
  });

  it('is occupied if at least one of several agents is inside', () => {
    expect(roomStatus(SQUARE, [[20, 5], [2, 8]], [])).toBe('occupied');
  });

  it('is warning when a warning alert is inside, even with no agents', () => {
    expect(roomStatus(SQUARE, [], [WARNING([5, 5])])).toBe('warning');
  });

  it('is critical when a critical alert is inside', () => {
    expect(roomStatus(SQUARE, [], [CRITICAL([5, 5])])).toBe('critical');
  });

  it('warning takes precedence over occupied', () => {
    expect(roomStatus(SQUARE, [[2, 2]], [WARNING([5, 5])])).toBe('warning');
  });

  it('critical beats warning in the same room, whatever the order', () => {
    expect(roomStatus(SQUARE, [], [WARNING([5, 5]), CRITICAL([6, 6])])).toBe('critical');
    expect(roomStatus(SQUARE, [], [CRITICAL([6, 6]), WARNING([5, 5])])).toBe('critical');
  });

  it('critical beats occupied', () => {
    expect(roomStatus(SQUARE, [[5, 5]], [CRITICAL([4, 4])])).toBe('critical');
  });

  it('ignores a warning alert outside the polygon', () => {
    expect(roomStatus(SQUARE, [], [WARNING([20, 20])])).toBe('empty');
  });

  it('ignores a warning outside the polygon but still reports occupied', () => {
    expect(roomStatus(SQUARE, [[5, 5]], [WARNING([20, 20])])).toBe('occupied');
  });

  it('ignores a critical alert outside the polygon', () => {
    expect(roomStatus(SQUARE, [[5, 5]], [CRITICAL([20, 5])])).toBe('occupied');
  });

  it('a critical outside the room does not override a warning inside', () => {
    expect(roomStatus(SQUARE, [], [CRITICAL([20, 5]), WARNING([5, 5])])).toBe('warning');
  });

  it('returns empty for a polygon with fewer than 3 points, even if agents and alerts sit on it', () => {
    const twoPoints: Vec2[] = [
      [0, 0],
      [10, 0],
    ];
    expect(roomStatus(twoPoints, [[5, 0]], [])).toBe('empty');
    expect(roomStatus(twoPoints, [[5, 0]], [CRITICAL([5, 0])])).toBe('empty');
  });

  it('returns empty for an empty polygon', () => {
    expect(roomStatus([], [[0, 0]], [WARNING([0, 0])])).toBe('empty');
  });

  it('uses the actual polygon shape, not its bounding box', () => {
    // Triangle (0,0),(10,0),(0,10): the point (6,6) is in the bounding box but outside (x+z > 10).
    const triangle: Vec2[] = [
      [0, 0],
      [10, 0],
      [0, 10],
    ];
    expect(roomStatus(triangle, [[6, 6]], [])).toBe('empty');
    expect(roomStatus(triangle, [[2, 2]], [])).toBe('occupied');
  });
});
