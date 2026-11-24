import { describe, expect, it } from 'vitest';
import { doorScale, scanIssues, type ScanDoor } from './room-scan';

const doors: ScanDoor[] = [
  { id: 'd1', from: [0, -2], to: [1.5, -2], frameSeconds: 11, imageBox: [0.25, 0.2, 0.5, 0.9] },
  { id: 'd2', from: [0, 0], to: [0, 0], frameSeconds: 18, imageBox: [0.3, 0.1, 0.6, 0.85] },
];

describe('room-scan drafting', () => {
  it('scales only a detected, nonzero door with a valid reference width', () => {
    expect(doorScale(doors, { doorId: 'd1', widthMeters: 0.75 })).toBe(0.5);
    expect(doorScale(doors, { doorId: 'd2', widthMeters: 0.75 })).toBeNull();
    expect(doorScale(doors, { doorId: 'd9', widthMeters: 0.75 })).toBeNull();
    expect(doorScale(doors, { doorId: 'd1', widthMeters: 0.19 })).toBeNull();
    expect(doorScale(doors, { doorId: 'd1', widthMeters: Infinity })).toBeNull();
    expect(doorScale(doors)).toBeNull();
  });

  it('distinguishes failed motion/floor from a viewable draft with missing walls', () => {
    expect(scanIssues({ registeredFrames: 3, attemptedFrames: 50, locatedFloor: false, observedSides: 0 })).toEqual(['camera-path']);
    expect(scanIssues({ registeredFrames: 31, attemptedFrames: 50, locatedFloor: false, observedSides: 0 })).toEqual(['floor']);
    expect(scanIssues({ registeredFrames: 30, attemptedFrames: 50, locatedFloor: true, observedSides: 2 })).toEqual(['overlap', 'walls']);
    expect(scanIssues({ registeredFrames: 31, attemptedFrames: 50, locatedFloor: true, observedSides: 4 })).toEqual([]);
  });
});
