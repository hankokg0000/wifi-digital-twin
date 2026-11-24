import { describe, expect, it } from 'vitest';
import { createCameraTracker, createFloorProjection, type FloorCalibration, type PersonDetection } from './tracking';

const calibration: FloorCalibration = {
  image: [[0.25, 0.25], [0.75, 0.25], [1, 0.75], [0, 0.75]],
  floor: [[0, 0], [10, 0], [10, 6], [0, 6]],
};

describe('camera positions on the office floor', () => {
  it('projects a point inside a perspective view to its floor position', () => {
    const project = createFloorProjection(calibration);
    expect(project([0.5, 0.25])).toEqual([5, 0]);
    expect(project([0.5, 0.5])).toEqual([5, 4]);
  });

  it('rejects calibration without four distinct ground points', () => {
    expect(() => createFloorProjection({
      ...calibration,
      image: [[0, 0], [0.25, 0], [0.5, 0], [1, 0]],
    })).toThrow('Camera calibration points must describe a plane');
  });

  it('holds a briefly obscured track, expires it, and ignores people outside the walkway', () => {
    const tracker = createCameraTracker(calibration);
    expect(tracker.update(0, [{ x: 0.45, y: 0.25, width: 0.1, height: 0.25, confidence: 0.9, ground: [0.5, 0.5] }]).track)
      .toEqual({ x: 5, z: 4, heading: 0, visibility: 'visible' });
    expect(tracker.update(250, []).track).toEqual({ x: 5, z: 4, heading: 0, visibility: 'occluded' });
    expect(tracker.update(625, []).track).toBeNull();
    expect(tracker.update(750, [{ x: 0.01, y: 0.1, width: 0.04, height: 0.28, confidence: 0.99, ground: [0.03, 0.38] }]).track)
      .toBeNull();
  });

  it('keeps upper-body evidence in the video without assigning it a floor position', () => {
    const tracker = createCameraTracker(calibration);
    const imageDetection: PersonDetection = { x: 0.45, y: 0.26, width: 0.1, height: 0.18, confidence: 0.9 };
    const track = { x: 5, z: 4, heading: 0, visibility: 'visible' };
    expect(tracker.update(0, [imageDetection])).toEqual({ track: null, imageDetection });
    expect(tracker.update(125, [{ ...imageDetection, ground: [0.5, 0.5] }])).toEqual({ track, imageDetection: null });
    expect(tracker.update(250, [imageDetection])).toEqual({ track: { ...track, visibility: 'occluded' }, imageDetection });
    expect(tracker.update(625, [imageDetection])).toEqual({ track: { ...track, visibility: 'occluded' }, imageDetection });
    expect(tracker.update(750, [imageDetection])).toEqual({ track: null, imageDetection });
    expect(tracker.update(875, [])).toEqual({ track: null, imageDetection: null });
  });

  it('does not associate a distant torso with the last verified position', () => {
    const tracker = createCameraTracker(calibration);
    const imageDetection: PersonDetection = { x: 0.45, y: 0.26, width: 0.1, height: 0.18, confidence: 0.9 };
    tracker.update(0, [{ ...imageDetection, ground: [0.5, 0.5] }]);
    expect(tracker.update(125, [{ ...imageDetection, x: 0.1 }])).toEqual({
      track: { x: 5, z: 4, heading: 0, visibility: 'occluded' }, imageDetection: null,
    });
  });

  it('clears the held position when a supported ground point leaves the configured region', () => {
    const tracker = createCameraTracker(calibration, [[4.5, 3.5], [5.5, 3.5], [5.5, 4.5], [4.5, 4.5]]);
    const imageDetection: PersonDetection = { x: 0.45, y: 0.26, width: 0.1, height: 0.18, confidence: 0.9 };
    tracker.update(0, [{ ...imageDetection, ground: [0.5, 0.5] }]);
    expect(tracker.update(125, [{ ...imageDetection, ground: [0.55, 0.5] }])).toEqual({ track: null, imageDetection: null });
    expect(tracker.update(250, [imageDetection])).toEqual({ track: null, imageDetection });
  });
});
