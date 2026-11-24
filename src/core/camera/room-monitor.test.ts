import { describe, expect, it } from 'vitest';
import type { FloorPlanGeometry } from './floor-plan';
import { boardPlacements, parseEspCsi, roomForMonitor, roomProjector, simulateDemoFrames, validBoardImage, wifiHighlightsRoom } from './room-monitor';
import type { FloorCalibration } from './tracking';

const plan: FloorPlanGeometry = {
  version: 1, bounds: [0, 0, 4, 3], visibleFloor: [[0, 0], [4, 0], [4, 3], [0, 3]], walls: [], objects: [],
};
const rectangle: FloorCalibration['image'] = [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4]];
const room = { id: 'room', title: 'Demo', plan, metersPerUnit: 1 };

describe('monitoring an imported room', () => {
  it('places the physical board in room coordinates and requires a known scale', () => {
    expect(boardPlacements(room)[0]).toEqual({
      index: 0,
      outline: [[0, 0], [0.25, 0], [0.25, 0.17], [0, 0.17]],
      points: [[0.038, 0.038], [0.212, 0.038], [0.212, 0.132], [0.038, 0.132]],
    });
    expect(boardPlacements({ ...room, plan: { ...plan, visibleFloor: [...plan.visibleFloor].reverse() } })).toHaveLength(4);
    expect(boardPlacements({ ...room, metersPerUnit: undefined })).toEqual([]);
    expect(roomForMonitor({
      id: room.id, plan, doors: [], issues: [], recordedSeconds: 20, registeredFrames: 8, attemptedFrames: 10,
    })).toBeNull();
  });

  it('projects only a reliable board into the room and rejects crossed or tiny readings', () => {
    expect(validBoardImage(rectangle)).toBe(true);
    expect(validBoardImage([rectangle[0], rectangle[2], rectangle[1], rectangle[3]])).toBe(false);
    expect(validBoardImage([[0.2, 0.2], [0.21, 0.2], [0.21, 0.21], [0.2, 0.21]])).toBe(false);
    const calibration = { image: rectangle, floor: boardPlacements(room)[0]!.points };
    const project = roomProjector(calibration, plan);
    expect(project([0.3, 0.3])).toEqual([0.125, 0.085]);
    expect(project([0.01, 0.01])).toBeNull();
    expect(roomProjector(null, plan)([0.3, 0.3])).toBeNull();
  });

  it('uses Wi-Fi only for a room indication when the camera does not see someone', () => {
    const detection = { id: 1, box: { x: 0.2, y: 0.3, width: 0.1, height: 0.2, confidence: 0.9 } };
    expect(wifiHighlightsRoom('motion', [])).toBe(true);
    expect(wifiHighlightsRoom('idle', [])).toBe(false);
    expect(wifiHighlightsRoom('disconnected', [])).toBe(false);
    expect(wifiHighlightsRoom('motion', [detection])).toBe(false);
  });
});

describe('simulated positions from demo clips', () => {
  const person = { id: 1, box: { x: 0.2, y: 0.3, width: 0.1, height: 0.2, confidence: 0.9 } };

  it('moves with the detected ground point and disappears when a frame loses the person', () => {
    const frames = [
      [{ ...person, ground: [0.5, 0.5] as const }],
      [{ ...person, ground: [0.8, 0.6] as const }],
      [],
      [person],
    ];
    expect(simulateDemoFrames(frames, plan).map((frame) => frame.map(({ position }) => position))).toEqual([
      [[2, 1.5]], [[2.602784, 1.6638]], [], [[1.2272, 1.8024]],
    ]);
    expect(frames[3]).toEqual([person]);
  });

  it('maps into the floor at that depth, including a concave room', () => {
    const concave: FloorPlanGeometry = {
      ...plan, visibleFloor: [[0, 0], [4, 0], [4, 1], [2, 1], [2, 3], [0, 3]],
    };
    const frames = [[{ ...person, ground: [0.9, 0.9] as const }]];
    expect(simulateDemoFrames(frames, concave)[0]?.[0]?.position).toEqual([1.61824, 2.508]);
  });
});

describe('USB CSI protocol', () => {
  it('validates the packet and skips the invalid first word before calculating power', () => {
    const wire = 'CSI_DATA,1,01:23:45:67:89:ab,-60,0,1,0,0,0,0,0,0,0,0,-95,0,6,0,0,0,0,0,8,1,"[127,127,127,127,1,1,1,1]"';
    expect(parseEspCsi(wire)).toEqual({ peer: '01:23:45:67:89:ab', key: '01:23:45:67:89:ab/6/1:0:0/8', power: 10 * Math.log10(2) });
    expect(parseEspCsi(wire.replace('127,127', '128,127'))).toBeNull();
    expect(parseEspCsi(wire.replace(',8,1,', ',10,1,'))).toBeNull();
    expect(parseEspCsi('ESP-ROM:esp32')).toBeNull();
  });
});
