import type { GeneratedScene } from './generated-scene';
import { createFloorCoordinates, fitSceneFloor, inverseDepth, planFloorSamples, type FloorProjection } from './floor-projection';
import type { FloorPoint } from './tracking';

export type PlanObjectKind = 'shelf' | 'counter' | 'basket' | 'desk' | 'chair' | 'sofa' | 'unknown';
export type ImageBounds = readonly [left: number, top: number, right: number, bottom: number];
export interface ObjectObservation {
  kind: Exclude<PlanObjectKind, 'unknown'>;
  box: ImageBounds;
  confidence: number;
}
export interface PlanSemantics {
  names: Record<string, string>;
  labels: number[];
  objects: ObjectObservation[];
}
export interface PlanObject {
  kind: PlanObjectKind;
  center: FloorPoint;
  width: number;
  length: number;
  height: number;
  rotation: number;
}
export interface PlanWall {
  from: FloorPoint;
  to: FloorPoint;
  inferred: boolean;
}
export interface FloorPlanGeometry {
  version: 1;
  bounds: readonly [left: number, front: number, right: number, back: number];
  visibleFloor: FloorPoint[];
  walls: PlanWall[];
  objects: PlanObject[];
}

export interface GeneratedFloorPlan extends FloorPlanGeometry {
  projection: FloorProjection;
}

type Kind = PlanObjectKind | 'floor' | 'wall' | 'background' | 'ignored';
const kinds: Readonly<Record<string, Kind>> = {
  floor: 'floor', rug: 'floor', wall: 'wall', door: 'wall', windowpane: 'wall',
  person: 'ignored', ceiling: 'ignored', sky: 'ignored', lamp: 'ignored', light: 'ignored',
  shelf: 'shelf', bookcase: 'shelf', counter: 'counter', countertop: 'counter', 'kitchen island': 'counter',
  basket: 'basket', table: 'desk', desk: 'desk', 'coffee table': 'desk', chair: 'chair', 'swivel chair': 'chair',
  cabinet: 'unknown', case: 'unknown', box: 'unknown', base: 'unknown', buffet: 'unknown',
  'chest of drawers': 'unknown', 'display case': 'unknown', refrigerator: 'unknown', sofa: 'unknown',
};

function quantile(values: number[], fraction: number) {
  return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)]!;
}

function turn(a: FloorPoint, b: FloorPoint, p: FloorPoint) {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

function hull(points: FloorPoint[]) {
  const sorted = [...points].sort(([x, z], [a, b]) => x - a || z - b);
  const sides = (ordered: FloorPoint[]) => {
    const side: FloorPoint[] = [];
    for (const point of ordered) {
      while (side.length >= 2 && turn(side.at(-2)!, side.at(-1)!, point) <= 0) side.pop();
      side.push(point);
    }
    return side.slice(0, -1);
  };
  return [...sides(sorted), ...sides(sorted.reverse())];
}

function components(labels: Kind[], width: number, height: number) {
  const seen = new Uint8Array(labels.length);
  const groups: { kind: PlanObjectKind | 'wall'; pixels: number[] }[] = [];
  for (const [index, kind] of labels.entries()) {
    if (kind === 'floor' || kind === 'background' || kind === 'ignored' || seen[index]) continue;
    const pixels = [index];
    seen[index] = 1;
    for (let position = 0; position < pixels.length; position++) {
      const p = pixels[position]!;
      const x = p % width;
      for (const next of [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, p - width, p + width]) {
        if (next >= 0 && next < width * height && !seen[next] && labels[next] === kind) {
          seen[next] = 1;
          pixels.push(next);
        }
      }
    }
    const minimum = kind === 'basket' || kind === 'chair' ? 38 : kind === 'unknown' ? 135 : 70;
    if (pixels.length >= minimum) groups.push({ kind, pixels });
  }
  return groups;
}

function objectPixels(box: ImageBounds, width: number, height: number) {
  const [left, top, right, bottom] = box;
  const margin = (right - left) * 0.08;
  const pixels: number[] = [];
  for (let y = Math.max(0, Math.floor(top * height)); y < Math.min(height, Math.ceil(bottom * height)); y++) {
    for (let x = Math.max(0, Math.floor((left + margin) * width)); x < Math.min(width, Math.ceil((right - margin) * width)); x++) {
      pixels.push(y * width + x);
    }
  }
  return pixels;
}

function fitPlanObject(kind: PlanObjectKind, points: (readonly [number, number, number])[]): PlanObject | null {
  if (points.length < 16) return null;
  const xs = points.map(([x]) => x);
  const zs = points.map(([, , z]) => z);
  const x0 = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const z0 = zs.reduce((sum, z) => sum + z, 0) / zs.length;
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const [x, , z] of points) {
    xx += (x - x0) ** 2;
    zz += (z - z0) ** 2;
    xz += (x - x0) * (z - z0);
  }
  const angle = Math.atan2(2 * xz, xx - zz) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = points.map(([x, , z]) => (x - x0) * cos + (z - z0) * sin);
  const across = points.map(([x, , z]) => -(x - x0) * sin + (z - z0) * cos);
  const minX = quantile(along, 0.06);
  const maxX = quantile(along, 0.94);
  const minZ = quantile(across, 0.08);
  const maxZ = quantile(across, 0.92);
  const px = (minX + maxX) / 2;
  const pz = (minZ + maxZ) / 2;
  const height = quantile(points.map(([, y]) => y), 0.89);
  const width = maxX - minX;
  const length = Math.max(maxZ - minZ, 0.17);
  if (width < 0.12 || height < 0.12) return null;
  if (kind === 'basket' && (width > length * 3.4 || width > height * 2.9)) return null;
  const maxLength = kind === 'shelf' ? Math.max(0.17, height * 0.54)
    : kind === 'counter' ? width * 0.85 + 0.2 : width + 0.2;
  return {
    kind,
    center: [x0 + px * cos - pz * sin, z0 + px * sin + pz * cos],
    width,
    length: Math.min(length, maxLength),
    height,
    rotation: -angle,
  };
}

function footprintsOverlap(a: PlanObject, b: PlanObject) {
  const axes = (model: PlanObject): [FloorPoint, FloorPoint] => [
    [Math.cos(model.rotation), -Math.sin(model.rotation)],
    [Math.sin(model.rotation), Math.cos(model.rotation)],
  ];
  const [ax, az] = axes(a);
  const [bx, bz] = axes(b);
  const x = b.center[0] - a.center[0];
  const z = b.center[1] - a.center[1];
  const radius = (model: PlanObject, along: FloorPoint, across: FloorPoint, [u, v]: FloorPoint) =>
    (model.width * Math.abs(along[0] * u + along[1] * v) +
      model.length * Math.abs(across[0] * u + across[1] * v)) * 0.5;
  return [ax, az, bx, bz].every(([u, v]) =>
    Math.abs(x * u + z * v) < (radius(a, ax, az, [u, v]) + radius(b, bx, bz, [u, v])) * 0.93);
}

function seenInRoom([x, z]: FloorPoint, [left, front, right, back]: GeneratedFloorPlan['bounds']) {
  return x >= left && x <= right && z >= front && z <= back;
}

export function floorPlanProjector(plan: GeneratedFloorPlan) {
  const coordinates = createFloorCoordinates(plan.projection);
  return (imagePoint: FloorPoint): FloorPoint | null => {
    const point = coordinates.ground(imagePoint);
    return point && seenInRoom(point, plan.bounds) ? point : null;
  };
}

export function createFloorPlan(scene: GeneratedScene, semantics: PlanSemantics): GeneratedFloorPlan {
  const { width, height } = scene;
  if (semantics.labels.length !== width * height) throw new Error('Segmentation dimensions differ from the depth map');
  const labels = semantics.labels.map((id) => kinds[semantics.names[String(id)]?.split(',')[0]?.trim() ?? ''] ?? 'background');
  const floorSamples = planFloorSamples(scene, (index) => labels[index] === 'floor');
  const plane = fitSceneFloor(floorSamples);
  if (!plane) throw new Error('The visible floor could not be fitted');
  const projection: FloorProjection = { aspect: width / height, plane };
  const map = createFloorCoordinates(projection);
  const floor = floorSamples.flatMap((sample) => {
    const { u, v, inverse } = sample;
    if (Math.abs(plane[0] * u + plane[1] * v + plane[2] - inverse) > 0.045) return [];
    const point = map.ground([u, v]);
    return point ? [point] : [];
  });
  if (floor.length < 24) throw new Error('Too little floor coverage');
  const left = quantile(floor.map(([x]) => x), 0.015);
  const right = quantile(floor.map(([x]) => x), 0.985);
  const front = quantile(floor.map(([, z]) => z), 0.015);
  const back = quantile(floor.map(([, z]) => z), 0.985);
  if (right - left < 0.4 || back - front < 0.3) throw new Error('The floor region is too narrow');
  const margin = Math.max(right - left, back - front) * 0.14;
  const workingBounds = [left - margin, front - margin, right + margin, back + margin] as const;

  const surface = (index: number) => {
    if (!scene.disparity[index]) return null;
    return map.surface([(index % width + 0.5) / width, (Math.floor(index / width) + 0.5) / height], inverseDepth(scene.disparity[index]!));
  };
  const aboveFloor = (pixels: number[]) => pixels.flatMap((index) => {
    if (labels[index] === 'floor' || labels[index] === 'ignored') return [];
    const point = surface(index);
    return point && point[1] > 0.08 && point[1] < 3 && seenInRoom([point[0], point[2]], workingBounds) ? [point] : [];
  });

  const regions = components(labels, width, height);
  const fits: { model: PlanObject; priority: number }[] = [];
  for (const observation of semantics.objects) {
    const pixels = objectPixels(observation.box, width, height);
    const comparable = pixels.filter((index) => labels[index] === observation.kind ||
      (observation.kind === 'counter' && labels[index] === 'unknown'));
    if (observation.kind === 'counter' && comparable.length < pixels.length * 0.12) continue;
    const support = comparable.length >= pixels.length * 0.12 ? comparable
      : pixels.filter((index) => labels[index] === 'background' || labels[index] === 'unknown' || labels[index] === observation.kind);
    const model = fitPlanObject(observation.kind, aboveFloor(support));
    if (!model) continue;
    if (model.kind === 'basket') {
      const [left, top, right, bottom] = observation.box;
      const floorContact = map.ground([(left + right) / 2, bottom - (bottom - top) * 0.06]);
      if (floorContact && seenInRoom(floorContact, workingBounds) &&
          Math.hypot(floorContact[0] - model.center[0], floorContact[1] - model.center[1]) < model.width * 1.8) {
        model.center = [model.center[0] * 0.25 + floorContact[0] * 0.75, model.center[1] * 0.25 + floorContact[1] * 0.75];
      }
    }
    fits.push({ model, priority: 2 + observation.confidence });
  }
  for (const region of regions) {
    if (region.kind === 'wall') continue;
    const model = fitPlanObject(region.kind, aboveFloor(region.pixels));
    if (model) fits.push({ model, priority: region.kind === 'unknown' ? 0 : 1 });
  }
  const objects: PlanObject[] = [];
  for (const { model } of fits.sort((a, b) => b.priority - a.priority || b.model.width - a.model.width)) {
    if (objects.some((other) =>
      (other.kind === model.kind || other.kind === 'unknown' || model.kind === 'unknown') &&
      footprintsOverlap(other, model))) continue;
    objects.push(model);
    if (objects.length >= 24) break;
  }

  const bounds = workingBounds;
  const [a, b, c, d] = bounds;
  const edges: FloorPoint[] = [[a, b], [c, b], [c, d], [a, d]];
  const walls: PlanWall[] = edges.map((from, index) => ({ from, to: edges[(index + 1) % edges.length]!, inferred: true }));
  for (const region of regions) {
    if (region.kind !== 'wall') continue;
    const wall = fitPlanObject('shelf', aboveFloor(region.pixels));
    if (!wall || wall.width < 0.65 || wall.length > wall.width * 0.45) continue;
    const dx = Math.cos(wall.rotation) * wall.width * 0.5;
    const dz = -Math.sin(wall.rotation) * wall.width * 0.5;
    const [x, z] = wall.center;
    walls.push({ from: [x - dx, z - dz], to: [x + dx, z + dz], inferred: false });
  }
  return {
    version: 1, projection, bounds, walls, objects,
    visibleFloor: hull(floor.filter((point) => seenInRoom(point, bounds))),
  };
}
