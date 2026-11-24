import { polygonArea } from '../scene/geometry';
import type { Vec2 } from '../scene/types';
import { OFFICE_CALIBRATION, OFFICE_LENGTH, OFFICE_WIDTH } from './office';
import { createFloorProjection, type FloorCalibration, type FloorPoint, type PersonDetection } from './tracking';

export interface OfficeChair {
  id: string;
  point: FloorPoint;
}

export interface ChairSuggestion extends OfficeChair {
  box: readonly [x: number, y: number, width: number, height: number];
  confidence: number;
}

export interface OfficeLayout {
  region: FloorPoint[];
  chairs: OfficeChair[];
  calibration?: FloorCalibration;
}

export const MAX_REGION_POINTS = 12;
export const MAX_OFFICE_CHAIRS = 20;
const defaultProject = createFloorProjection(OFFICE_CALIBRATION);

export function defaultOfficeLayout(): OfficeLayout {
  return { region: [...OFFICE_CALIBRATION.image], chairs: [] };
}

function withinBounds(value: unknown, width: number, height: number): value is FloorPoint {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === 'number' && value[0] >= 0 && value[0] <= width &&
    typeof value[1] === 'number' && value[1] >= 0 && value[1] <= height;
}

export function createOfficeProjector(calibration?: FloorCalibration) {
  const project = calibration ? createFloorProjection(calibration) : defaultProject;
  return (value: unknown): FloorPoint | null => {
    if (!withinBounds(value, 1, 1)) return null;
    const point = project(value);
    return withinBounds(point, OFFICE_WIDTH, OFFICE_LENGTH) ? point : null;
  };
}

export const mapOfficePoint = createOfficeProjector();

function turn(a: FloorPoint, b: FloorPoint, c: FloorPoint) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function edgesIntersect(a: FloorPoint, b: FloorPoint, c: FloorPoint, d: FloorPoint) {
  const overlaps = (index: 0 | 1) =>
    Math.max(Math.min(a[index], b[index]), Math.min(c[index], d[index])) <=
    Math.min(Math.max(a[index], b[index]), Math.max(c[index], d[index]));
  return overlaps(0) && overlaps(1) && turn(a, b, c) * turn(a, b, d) <= 0 &&
    turn(c, d, a) * turn(c, d, b) <= 0;
}

function calibrationCorners(value: unknown, width: number, height: number): FloorCalibration['image'] | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((point) => withinBounds(point, width, height))) return null;
  const points = value as unknown as FloorCalibration['image'];
  const turns = points.map((point, i) => turn(point, points[(i + 1) % 4]!, points[(i + 2) % 4]!));
  const minimum = width * height * 0.001;
  return turns.every((v) => v > minimum) || turns.every((v) => v < -minimum) ? points : null;
}

export function readOfficeCalibration(value: unknown): FloorCalibration | null {
  if (!value || typeof value !== 'object' || !('image' in value) || !('floor' in value)) return null;
  const image = calibrationCorners(value.image, 1, 1);
  const floor = calibrationCorners(value.floor, OFFICE_WIDTH, OFFICE_LENGTH);
  if (!image || !floor) return null;
  const calibration: FloorCalibration = { image, floor };
  try {
    const project = createFloorProjection(calibration);
    for (const [index, point] of image.entries()) {
      const position = project(point);
      const [x, z] = floor[index]!;
      if (!position || Math.hypot(position[0] - x, position[1] - z) > 0.00001) return null;
    }
  } catch {
    return null;
  }
  return calibration;
}

export function recalibrateOffice(layout: OfficeLayout | undefined, calibration: FloorCalibration): OfficeLayout {
  const project = createOfficeProjector(calibration);
  return {
    calibration,
    region: layout && officeRegion(layout.region, calibration) ? layout.region : [...calibration.image],
    chairs: layout?.chairs.filter((chair) => project(chair.point)) ?? [],
  };
}

export function officeRegion(value: unknown, calibration?: FloorCalibration): Vec2[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > MAX_REGION_POINTS) return null;
  const mapped = value.map(createOfficeProjector(calibration));
  if (mapped.some((point) => point === null)) return null;
  const floor = mapped.map((point): Vec2 => [point![0], point![1]]);
  if (Math.abs(polygonArea(floor)) < 0.01) return null;
  for (const [index, a] of floor.entries()) {
    const b = floor[(index + 1) % floor.length]!;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) return null;
    const previous = floor[(index + floor.length - 1) % floor.length]!;
    if (edgesIntersect(previous, a, b, b) || edgesIntersect(b, a, previous, previous)) return null;
    for (let next = index + 2; next < floor.length; next++) {
      if (index === 0 && next === floor.length - 1) continue;
      if (edgesIntersect(a, b, floor[next]!, floor[(next + 1) % floor.length]!)) return null;
    }
  }
  return floor;
}

export function readOfficeLayout(value: unknown): OfficeLayout | null {
  if (!value || typeof value !== 'object' || !('region' in value) || !('chairs' in value)) return null;
  const calibration = 'calibration' in value ? readOfficeCalibration(value.calibration) : undefined;
  if (calibration === null || !officeRegion(value.region, calibration) || !Array.isArray(value.chairs) || value.chairs.length > MAX_OFFICE_CHAIRS) return null;
  const mapPoint = createOfficeProjector(calibration);
  const chairs: OfficeChair[] = [];
  const ids = new Set<string>();
  for (const chair of value.chairs) {
    if (!chair || typeof chair.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(chair.id) ||
        ids.has(chair.id) || !mapPoint(chair.point)) return null;
    ids.add(chair.id);
    chairs.push({ id: chair.id, point: chair.point });
  }
  return { region: value.region as FloorPoint[], chairs, ...(calibration ? { calibration } : {}) };
}

function overlappingBoxes(a: ChairSuggestion['box'], b: ChairSuggestion['box']) {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const width = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  const height = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  return width * height > Math.min(aw * ah, bw * bh) * 0.6;
}

export function chairSuggestions(detections: readonly PersonDetection[], timeMs: number, calibration?: FloorCalibration): ChairSuggestion[] {
  const mapPoint = createOfficeProjector(calibration);
  const suggestions: ChairSuggestion[] = [];
  for (const { x, y, width, height, confidence } of [...detections].sort((a, b) => b.confidence - a.confidence)) {
    if (![x, y, width, height, confidence].every(Number.isFinite) || confidence < 0.22 ||
        width <= 0 || height <= 0 || suggestions.length >= MAX_OFFICE_CHAIRS) continue;
    const box: ChairSuggestion['box'] = [x, y, width, height];
    const point: FloorPoint = [x + width / 2, y + height];
    if (point[1] >= 0.99 || !mapPoint(point) || suggestions.some((chair) =>
      overlappingBoxes(box, chair.box) || Math.hypot(point[0] - chair.point[0], point[1] - chair.point[1]) < 0.025)) continue;
    suggestions.push({ id: `chair-${Math.round(timeMs)}-${suggestions.length + 1}`, point, box, confidence });
  }
  return suggestions;
}
