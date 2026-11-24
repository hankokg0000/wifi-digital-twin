import { pointInPolygon } from '../scene/geometry';
import type { Vec2 } from '../scene/types';

export type FloorPoint = readonly [x: number, z: number];
type Corners = readonly [FloorPoint, FloorPoint, FloorPoint, FloorPoint];

export interface FloorCalibration {
  /** Frame-relative coordinates, measured from the upper-left pixel. */
  image: Corners;
  floor: Corners;
}

export interface PersonDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface CameraPersonDetection extends PersonDetection {
  /** Frame coordinates of a supported ground contact. */
  ground?: FloorPoint;
}

export interface CameraTrackingFrame {
  track: CameraTrack | null;
  imageDetection: PersonDetection | null;
}

export interface CameraTrack {
  x: number;
  z: number;
  heading: number;
  visibility: 'visible' | 'occluded';
}

const MIN_PIVOT = 1e-9;
const HOLD_MS = 500;
const MIN_CONFIDENCE = 0.38;
const MAX_TRACK_DISTANCE = 1.7;

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

export function createFloorProjection(calibration: FloorCalibration) {
  const rows = calibration.image.flatMap(([u, v], index) => {
    const [x, z] = calibration.floor[index]!;
    return [
      [u, v, 1, 0, 0, 0, -u * x, -v * x, x],
      [0, 0, 0, u, v, 1, -u * z, -v * z, z],
    ];
  });

  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = row;
    }
    const divisor = rows[pivot]![column]!;
    if (!Number.isFinite(divisor) || Math.abs(divisor) < MIN_PIVOT) {
      throw new Error('Camera calibration points must describe a plane');
    }
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const normalized = rows[column]!.map((value) => value / divisor);
    rows[column] = normalized;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = rows[row]![column]!;
      rows[row] = rows[row]!.map((value, index) => value - factor * normalized[index]!);
    }
  }

  const [a, b, c, d, e, f, g, h] = rows.map((row) => row[8]!) as [
    number, number, number, number, number, number, number, number,
  ];
  const [firstU, firstV] = calibration.image[0];
  const facing = Math.sign(g * firstU + h * firstV + 1);
  return ([u, v]: FloorPoint): FloorPoint | null => {
    const scale = g * u + h * v + 1;
    if (!Number.isFinite(scale) || scale * facing < MIN_PIVOT) return null;
    return [rounded((a * u + b * v + c) / scale), rounded((d * u + e * v + f) / scale)];
  };
}

function withinWalkway([x, z]: FloorPoint, corners: Corners): boolean {
  // Corners must be in perimeter order, starting at any corner.
  const crosses = corners.map(([ax, az], index) => {
    const [bx, bz] = corners[(index + 1) % 4]!;
    return (bx - ax) * (z - az) - (bz - az) * (x - ax);
  });
  return crosses.every((value) => value >= -MIN_PIVOT)
    || crosses.every((value) => value <= MIN_PIVOT);
}

export function isInCameraRegion([x, z]: FloorPoint, region: Vec2[]) {
  return pointInPolygon([x, z], region) || region.some(([ax, az], index) => {
    const [bx, bz] = region[(index + 1) % region.length]!;
    return Math.abs((bx - ax) * (z - az) - (bz - az) * (x - ax)) < 1e-5 &&
      (x - ax) * (x - bx) + (z - az) * (z - bz) <= 1e-8;
  });
}

export function createCameraTracker(calibration: FloorCalibration | null, region?: Vec2[]) {
  const contains = (position: FloorPoint) => region
    ? isInCameraRegion(position, region) : Boolean(calibration && withinWalkway(position, calibration.floor));
  const project = calibration && createFloorProjection(calibration);
  let active: CameraTrack | null = null;
  let lastSeenAt = -Infinity;
  let lastBox: PersonDetection | null = null;

  function nearLastBox(detection: PersonDetection) {
    if (!lastBox) return false;
    return Math.abs(detection.x + detection.width / 2 - lastBox.x - lastBox.width / 2) <= Math.max(0.045, lastBox.width * 0.75)
      && Math.abs(detection.y + detection.height / 2 - lastBox.y - lastBox.height / 2) <= Math.max(0.05, lastBox.height * 0.5);
  }

  return {
    update(timestamp: number, detections: readonly CameraPersonDetection[]): CameraTrackingFrame {
      if (timestamp - lastSeenAt > HOLD_MS) {
        active = null;
        lastBox = null;
      }
      const previous = active;
      let candidate: { x: number; z: number; rank: number; box: PersonDetection } | undefined;
      let imageDetection: PersonDetection | null = null;
      let exitedRegion = false;

      for (const detection of detections) {
        if (detection.confidence < MIN_CONFIDENCE) continue;
        if (!project || !detection.ground) {
          if ((!previous || nearLastBox(detection)) &&
              (!imageDetection || detection.confidence > imageDetection.confidence)) {
            const { x, y, width, height, confidence } = detection;
            imageDetection = { x, y, width, height, confidence };
          }
          continue;
        }

        const position = project(detection.ground);
        if (!position || !contains(position)) {
          if (previous && position && nearLastBox(detection)) exitedRegion = true;
          continue;
        }
        const [x, z] = position;
        const distance = previous ? Math.hypot(x - previous.x, z - previous.z) : 0;
        if (distance > MAX_TRACK_DISTANCE) continue;
        const rank = distance - detection.confidence * 0.25;
        if (!candidate || rank < candidate.rank) candidate = { x, z, rank, box: detection };
      }

      if (!candidate) {
        if (exitedRegion) {
          active = null;
          lastBox = null;
          return { track: null, imageDetection: null };
        }
        return { track: previous ? { ...previous, visibility: 'occluded' } : null, imageDetection };
      }
      let x = rounded(previous ? previous.x * 0.3 + candidate.x * 0.7 : candidate.x);
      let z = rounded(previous ? previous.z * 0.3 + candidate.z * 0.7 : candidate.z);
      if (region && !contains([x, z])) ({ x, z } = candidate);
      const dx = previous ? x - previous.x : 0;
      const dz = previous ? z - previous.z : 0;
      const heading = Math.hypot(dx, dz) > 0.04 ? Math.atan2(dx, dz) : previous?.heading ?? 0;
      active = { x, z, heading, visibility: 'visible' };
      lastSeenAt = timestamp;
      lastBox = candidate.box;
      return { track: active, imageDetection: null };
    },
  };
}
