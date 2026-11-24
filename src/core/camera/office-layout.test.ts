import { describe, expect, it } from 'vitest';
import { chairSuggestions, createOfficeProjector, defaultOfficeLayout, mapOfficePoint, officeRegion, readOfficeCalibration, readOfficeLayout, recalibrateOffice } from './office-layout';
import { createCameraReplay, replaySnapshot } from './feed';
import { OFFICE_CALIBRATION } from './office';
import { createCameraTracker, type FloorCalibration } from './tracking';

describe('editable office layout', () => {
  it('keeps the default aisle and maps points near the desks past the aisle boundary', () => {
    expect(officeRegion(defaultOfficeLayout().region)).toEqual(OFFICE_CALIBRATION.floor);
    expect(mapOfficePoint([0.45, 0.67])).toEqual([5.834471, 10.410674]);
    expect(mapOfficePoint([0.04, 0.05])).toBeNull();
    expect(mapOfficePoint([Infinity, 0.67])).toBeNull();
  });

  it('rejects crossing boundaries, overlapping adjacent edges and duplicate chair IDs', () => {
    expect(officeRegion([[0.36, 0.52], [0.71, 0.89], [0.74, 0.51], [0.31, 0.90]])).toBeNull();
    expect(officeRegion([[0.36, 0.52], [0.74, 0.52], [0.55, 0.52], [0.31, 0.9]])).toBeNull();
    const chair = { id: 'chair-6000-1', point: [0.625, 0.75] as const };
    const layout = { ...defaultOfficeLayout(), chairs: [chair] };
    expect(readOfficeLayout(layout)).toEqual(layout);
    expect(readOfficeLayout({ ...layout, chairs: [chair, chair] })).toBeNull();
  });

  it('keeps one projected anchor for overlapping detections and excludes weak or unmappable boxes', () => {
    expect(chairSuggestions([
      { x: 0.589, y: 0.517, width: 0.125, height: 0.25, confidence: 0.89 },
      { x: 0.5625, y: 0.72, width: 0.125, height: 0.28, confidence: 0.99 },
      { x: 0.5625, y: 0.5, width: 0.125, height: 0.25, confidence: 0.94 },
      { x: 0.4, y: 0.6, width: 0.125, height: 0.15, confidence: 0.10 },
      { x: 0.1, y: 0.05, width: 0.1, height: 0.1, confidence: 0.98 },
    ], 6021)).toEqual([{
      id: 'chair-6021-1', point: [0.625, 0.75], box: [0.5625, 0.5, 0.125, 0.25], confidence: 0.94,
    }]);
  });

  it('tracks only within the selected shape and keeps a smoothed point inside a concave boundary', () => {
    const calibration: FloorCalibration = {
      image: [[0, 0], [1, 0], [1, 1], [0, 1]],
      floor: [[0, 0], [4, 0], [4, 4], [0, 4]],
    };
    const tracker = createCameraTracker(calibration, [
      [0.5, 0.5], [2.5, 0.5], [2.5, 2.5], [1.5, 1.5], [0.5, 2.5],
    ]);
    const at = (x: number, z: number) => [
      { x: x / 4 - 0.05, y: z / 4 - 0.1, width: 0.1, height: 0.1, confidence: 0.9, ground: [x / 4, z / 4] as const },
    ];
    expect(tracker.update(0, at(1.5, 2)).track).toBeNull();
    expect(tracker.update(125, at(1, 2)).track).toEqual({ x: 1, z: 2, heading: 0, visibility: 'visible' });
    expect(tracker.update(250, at(2, 2)).track).toEqual({ x: 2, z: 2, heading: Math.PI / 2, visibility: 'visible' });
    expect(tracker.update(875, at(3, 2)).track).toBeNull();
  });

  it('maps the same room from a new camera angle and retains the calibration with the layout', () => {
    const calibration: FloorCalibration = {
      image: [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]],
      floor: [[1, 1], [1, 7], [7, 7], [7, 1]],
    };
    expect(readOfficeCalibration(calibration)).toEqual(calibration);
    const layout = recalibrateOffice(undefined, calibration);
    expect(layout).toEqual({ calibration, region: calibration.image, chairs: [] });
    expect(readOfficeLayout(layout)).toEqual(layout);
    const point = [0.5, 0.625] as const;
    expect(createOfficeProjector(calibration)(point)).toEqual([5.5, 4]);
    expect(mapOfficePoint(point)).not.toEqual([5.5, 4]);
    expect(officeRegion(layout.region, calibration)).toEqual(calibration.floor);
    expect(recalibrateOffice({ ...layout, chairs: [{ id: 'seat', point }] }, calibration))
      .toEqual({ ...layout, chairs: [{ id: 'seat', point }] });
  });

  it('rejects crossed, cramped and out-of-room point pairs', () => {
    const image = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
    expect(readOfficeCalibration({ image, floor: [[1, 1], [7, 7], [1, 7], [7, 1]] })).toBeNull();
    expect(readOfficeCalibration({ image: [[.25, .25], [.251, .25], [.251, .251], [.25, .251]],
      floor: [[1, 1], [1, 7], [7, 7], [7, 1]] })).toBeNull();
    expect(readOfficeCalibration({ image, floor: [[1, 1], [1, 7], [12, 7], [12, 1]] })).toBeNull();
    expect(readOfficeLayout({ ...defaultOfficeLayout(), calibration: { image, floor: [] } })).toBeNull();
  });

  it('replays a new camera angle as image-only until valid floor mapping is supplied', () => {
    const imageDetection = { x: 0.45, y: 0.4, width: 0.1, height: 0.2, confidence: 0.9 };
    const detections = [[{ ...imageDetection, ground: [0.5, 0.625] as const }]];
    const pending = replaySnapshot(createCameraReplay(detections, null), 0, 0);
    expect(pending.track).toBeNull();
    expect(pending.imageDetection).toEqual(imageDetection);

    const calibration: FloorCalibration = {
      image: [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]],
      floor: [[1, 1], [1, 7], [7, 7], [7, 1]],
    };
    const ready = replaySnapshot(createCameraReplay(detections, calibration), 0, 0);
    expect(ready.track).toEqual({ x: 5.5, z: 4, heading: 0, visibility: 'visible' });
    expect(ready.imageDetection).toBeNull();
  });
});
