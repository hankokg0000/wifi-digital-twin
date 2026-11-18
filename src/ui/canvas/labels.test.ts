import { describe, it, expect } from 'vitest';
import { resolveLabelOverlaps } from './labels';

// Default rect is 10x10. With padding P, two rects collide when the gap between them on an
// axis is < P (on both axes).
const r = (x: number, y: number, w = 10, h = 10) => ({ x, y, w, h });

describe('resolveLabelOverlaps', () => {
  it('hides the lower-priority label when two overlap', () => {
    const hidden = resolveLabelOverlaps([
      { id: 'room', rect: r(0, 0), priority: 1 },
      { id: 'agent', rect: r(5, 5), priority: 3 },
    ]);
    expect(hidden).toEqual(new Set(['room']));
  });

  it('returns an empty set for no candidates', () => {
    expect(resolveLabelOverlaps([])).toEqual(new Set());
  });

  it('keeps every label when none are near each other', () => {
    const hidden = resolveLabelOverlaps([
      { id: 'a', rect: r(0, 0), priority: 1 },
      { id: 'b', rect: r(100, 0), priority: 1 },
      { id: 'c', rect: r(0, 100), priority: 1 },
    ]);
    expect(hidden).toEqual(new Set());
  });

  describe('padding boundary (default padding 4)', () => {
    it('does not hide when the horizontal gap is exactly the padding', () => {
      // a spans x 0..10; b starts at x 14 => gap 4 == padding => allowed
      const hidden = resolveLabelOverlaps([
        { id: 'a', rect: r(0, 0), priority: 2 },
        { id: 'b', rect: r(14, 0), priority: 1 },
      ]);
      expect(hidden).toEqual(new Set());
    });

    it('hides when the horizontal gap is padding - 1', () => {
      // b starts at x 13 => gap 3 < 4 => collision
      const hidden = resolveLabelOverlaps([
        { id: 'a', rect: r(0, 0), priority: 2 },
        { id: 'b', rect: r(13, 0), priority: 1 },
      ]);
      expect(hidden).toEqual(new Set(['b']));
    });

    it('does not hide when the vertical gap is exactly the padding', () => {
      // a spans y 0..10; b starts at y 14 => gap 4 == padding
      const hidden = resolveLabelOverlaps([
        { id: 'a', rect: r(0, 0), priority: 2 },
        { id: 'b', rect: r(0, 14), priority: 1 },
      ]);
      expect(hidden).toEqual(new Set());
    });

    it('hides when the vertical gap is padding - 1', () => {
      const hidden = resolveLabelOverlaps([
        { id: 'a', rect: r(0, 0), priority: 2 },
        { id: 'b', rect: r(0, 13), priority: 1 },
      ]);
      expect(hidden).toEqual(new Set(['b']));
    });

    it('hides touching rects (gap 0 is below the default padding)', () => {
      const hidden = resolveLabelOverlaps([
        { id: 'a', rect: r(0, 0), priority: 2 },
        { id: 'b', rect: r(10, 0), priority: 1 },
      ]);
      expect(hidden).toEqual(new Set(['b']));
    });
  });

  describe('custom padding', () => {
    it('padding 0: touching rects do not collide', () => {
      const hidden = resolveLabelOverlaps(
        [
          { id: 'a', rect: r(0, 0), priority: 2 },
          { id: 'b', rect: r(10, 0), priority: 1 },
        ],
        0,
      );
      expect(hidden).toEqual(new Set());
    });

    it('padding 0: a gap of 1 does not collide', () => {
      const hidden = resolveLabelOverlaps(
        [
          { id: 'a', rect: r(0, 0), priority: 2 },
          { id: 'b', rect: r(11, 0), priority: 1 },
        ],
        0,
      );
      expect(hidden).toEqual(new Set());
    });

    it('padding 0: rects that actually overlap by 1px still collide', () => {
      // b starts at x 9 => overlaps a (0..10) by 1px
      const hidden = resolveLabelOverlaps(
        [
          { id: 'a', rect: r(0, 0), priority: 2 },
          { id: 'b', rect: r(9, 0), priority: 1 },
        ],
        0,
      );
      expect(hidden).toEqual(new Set(['b']));
    });

    it('padding 10: a gap of 9 collides and a gap of 10 does not', () => {
      const close = resolveLabelOverlaps(
        [
          { id: 'a', rect: r(0, 0), priority: 2 },
          { id: 'b', rect: r(19, 0), priority: 1 },
        ],
        10,
      );
      expect(close).toEqual(new Set(['b']));

      const exact = resolveLabelOverlaps(
        [
          { id: 'a', rect: r(0, 0), priority: 2 },
          { id: 'b', rect: r(20, 0), priority: 1 },
        ],
        10,
      );
      expect(exact).toEqual(new Set());
    });
  });

  describe('priority and ordering', () => {
    it('breaks an equal-priority tie by id: lower id is kept', () => {
      // 'b' listed first in the input; 'a' (lower id) must still win.
      const hidden = resolveLabelOverlaps([
        { id: 'b', rect: r(0, 0), priority: 1 },
        { id: 'a', rect: r(5, 0), priority: 1 },
      ]);
      expect(hidden).toEqual(new Set(['b']));
    });

    it('a high-priority label hides a low-priority one even when it comes later in input', () => {
      const hidden = resolveLabelOverlaps([
        { id: 'a', rect: r(0, 0), priority: 1 },
        { id: 'z', rect: r(5, 0), priority: 5 },
      ]);
      expect(hidden).toEqual(new Set(['a']));
    });

    it('gives the same result regardless of input order', () => {
      const items = [
        { id: 'a', rect: r(0, 0), priority: 1 },
        { id: 'z', rect: r(5, 0), priority: 5 },
      ];
      expect(resolveLabelOverlaps([...items].reverse())).toEqual(new Set(['a']));
      expect(resolveLabelOverlaps(items)).toEqual(new Set(['a']));
    });

    it('with three stacked labels, the highest survives and the other two are hidden', () => {
      const hidden = resolveLabelOverlaps([
        { id: 'a', rect: r(0, 0), priority: 1 },
        { id: 'b', rect: r(0, 0), priority: 2 },
        { id: 'c', rect: r(0, 0), priority: 3 },
      ]);
      expect(hidden).toEqual(new Set(['a', 'b']));
    });
  });

  describe('chains', () => {
    it('a label hidden by A does not hide C, which only overlaps B', () => {
      // A (x 0..10, prio 3) hides B (x 12..22, gap 2 < 4, prio 2).
      // C (x 24..34, prio 1) is 14 away from A, so it survives: B was never placed.
      const hidden = resolveLabelOverlaps([
        { id: 'a', rect: r(0, 0), priority: 3 },
        { id: 'b', rect: r(12, 0), priority: 2 },
        { id: 'c', rect: r(24, 0), priority: 1 },
      ]);
      expect(hidden).toEqual(new Set(['b']));
    });

    it('a placed label does hide a later one that overlaps it', () => {
      // A (x 0..10) placed; C (x 13..23, gap 3 < 4) overlaps A and is hidden.
      const hidden = resolveLabelOverlaps([
        { id: 'a', rect: r(0, 0), priority: 3 },
        { id: 'c', rect: r(13, 0), priority: 1 },
      ]);
      expect(hidden).toEqual(new Set(['c']));
    });
  });
});
