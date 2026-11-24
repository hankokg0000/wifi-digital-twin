import type { FloorPlanGeometry, PlanObject } from './floor-plan';
import type { FloorPoint } from './tracking';

type Point3 = [number, number, number];
type PointTransform = (point: Point3) => Point3;
type SurfaceKind = 'floor' | 'wall' | 'frame' | 'glass' | 'furniture';
export interface UsdRoomModel {
  version: 1;
  surfaces: { kind: SurfaceKind; positions: number[]; indices: number[] }[];
}

interface UsdPrim {
  name: string;
  type: string;
  level: number;
  body: string;
  apply: PointTransform | null;
  parent?: UsdPrim;
}

const numberPattern = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?';
const numbers = new RegExp(numberPattern, 'gi');

export function outlineArea(points: readonly FloorPoint[]) {
  return Math.abs(points.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = points[(index + 1) % points.length]!;
    return sum + x * nextZ - z * nextX;
  }, 0)) / 2;
}

function bounds(outline: readonly FloorPoint[]): FloorPlanGeometry['bounds'] {
  const xs = outline.map(([x]) => x);
  const zs = outline.map(([, z]) => z);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

function makePlan(outline: FloorPoint[], objects: PlanObject[] = []): FloorPlanGeometry {
  return { version: 1, bounds: bounds(outline), visibleFloor: outline, objects,
    walls: outline.map((from, index) => ({ from, to: outline[(index + 1) % outline.length]!, inferred: false })) };
}

function samePoint(a: FloorPoint, b: FloorPoint) {
  return a[0] === b[0] && a[1] === b[1];
}

function boundary(triangles: FloorPoint[][]): FloorPoint[] {
  const edges = new Map<string, [FloorPoint, FloorPoint]>();
  for (const triangle of triangles) {
    for (const [index, point] of triangle.entries()) {
      const other = triangle[(index + 1) % triangle.length]!;
      const key = [point.join(','), other.join(',')].sort().join('|');
      if (edges.has(key)) edges.delete(key);
      else edges.set(key, [point, other]);
    }
  }
  if (edges.size < 3 || edges.size > 64) return [];
  const remaining = [...edges.values()];
  const first = remaining.shift()!;
  const ring = [...first];
  while (remaining.length) {
    const last = ring.at(-1)!;
    const index = remaining.findIndex(([a, b]) => samePoint(a, last) || samePoint(b, last));
    if (index < 0) return [];
    const [a, b] = remaining.splice(index, 1)[0]!;
    ring.push(samePoint(a, last) ? b : a);
  }
  return samePoint(ring[0]!, ring.pop()!) ? ring : [];
}

function arrayData(block: string, property: string) {
  return block.match(new RegExp(`\\b${property}\\s*=\\s*\\[([^\\]]*)\\]`))?.[1]?.match(numbers)?.map(Number) ?? [];
}

function meshPoints(block: string): Point3[] {
  const values = arrayData(block, 'points');
  if (!values.length || values.length % 3 || values.length > 750_000 || values.some((v) => !Number.isFinite(v))) return [];
  const result: Point3[] = [];
  for (let i = 0; i < values.length; i += 3) result.push([values[i]!, values[i + 1]!, values[i + 2]!]);
  return result;
}

function transform(block: string): PointTransform | null {
  const order = block.match(/\bxformOpOrder\s*=\s*\[([^\]]*)\]/)?.[1]?.trim();
  if (order && order !== '"xformOp:transform"') return null;
  const matrix = block.match(/matrix4d xformOp:transform\s*=([^\n]+)/)?.[1]?.match(numbers)?.map(Number);
  if (!matrix) return (point: Point3): Point3 => point;
  if (matrix.length !== 16 || matrix.some((v) => !Number.isFinite(v))) return null;
  return ([x, y, z]: Point3): Point3 => [
    x * matrix[0]! + y * matrix[4]! + z * matrix[8]! + matrix[12]!,
    x * matrix[1]! + y * matrix[5]! + z * matrix[9]! + matrix[13]!,
    x * matrix[2]! + y * matrix[6]! + z * matrix[10]! + matrix[14]!,
  ];
}

// usdcat uses indentation to encode prim nesting, including the parent transforms
// on magicplan's opening assemblies. Stop each property section at the next prim.
function readPrims(source: string): UsdPrim[] {
  const definitions = [...source.matchAll(/^([ \t]*)def (\w+) "([^"]+)"[^\n]*/gm)];
  const stack: UsdPrim[] = [];
  return definitions.map((definition, index) => {
    const [, indent, type, name] = definition;
    const level = indent!.length;
    while (stack.length && stack.at(-1)!.level >= level) stack.pop();
    const body = source.slice(definition.index + definition[0].length, definitions[index + 1]?.index);
    const parent = stack.at(-1);
    const local = transform(body);
    const parentTransform = parent?.apply;
    const apply = parentTransform && local ? (point: Point3) => parentTransform(local(point))
      : parent ? null : local;
    const node = { name: name!, type: type!, level, parent, body, apply };
    stack.push(node);
    return node;
  });
}

function trianglesFor(block: string, pointCount: number, maxFaces: number) {
  const counts = arrayData(block, 'faceVertexCounts');
  const indices = arrayData(block, 'faceVertexIndices');
  if (!counts.length || counts.length > maxFaces || counts.some((count) => count !== 3) ||
      indices.length !== counts.length * 3 ||
      indices.some((index) => !Number.isInteger(index) || index < 0 || index >= pointCount)) return null;
  if (/orientation\s*=\s*"leftHanded"/.test(block)) {
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
  }
  return indices;
}

function furnitureBox(block: string, apply: PointTransform, scale: number, center: FloorPoint, floorHeight: number): PlanObject | null {
  const points = meshPoints(block);
  if (!points.length) return null;
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    point.forEach((value, axis) => { low[axis] = Math.min(low[axis]!, value); high[axis] = Math.max(high[axis]!, value); });
  }
  const origin = apply([low[0]!, low[1]!, low[2]!]);
  const long = apply([high[0]!, low[1]!, low[2]!]);
  const deep = apply([low[0]!, low[1]!, high[2]!]);
  const middle = apply([(low[0]! + high[0]!) / 2, low[1]!, (low[2]! + high[2]!) / 2]);
  const top = apply([low[0]!, high[1]!, low[2]!]);
  const width = Math.hypot(long[0] - origin[0], long[2] - origin[2]) * scale;
  const length = Math.hypot(deep[0] - origin[0], deep[2] - origin[2]) * scale;
  const height = (top[1] - floorHeight) * scale;
  if (![width, length, height].every((size) => Number.isFinite(size) && size >= 0.025 && size < 20)) return null;
  return { kind: 'unknown', width, length, height, rotation: -Math.atan2(long[2] - origin[2], long[0] - origin[0]),
    center: [(middle[0] - center[0]) * scale, (middle[2] - center[1]) * scale] };
}

function surfaceKind(mesh: UsdPrim, glassMaterials: ReadonlySet<string>): SurfaceKind {
  if (/^WholeFloor_/.test(mesh.name)) return 'floor';
  if (/^(InnerSide_|OuterSide_|ExternalWalls_|FloorFillerTop_)/.test(mesh.name)) return 'wall';
  for (let node: UsdPrim | undefined = mesh; node; node = node.parent) {
    if (!/window|door|_frame_/i.test(node.name)) continue;
    const material = mesh.body.match(/rel material:binding\s*=\s*<[^>]*\/([^/>]+)>/)?.[1] ?? '';
    return glassMaterials.has(material) ? 'glass' : 'frame';
  }
  return 'furniture';
}

function roomSurfaces(meshes: UsdPrim[], glassMaterials: ReadonlySet<string>, center: FloorPoint, floorHeight: number, scale: number) {
  const surfaces: UsdRoomModel['surfaces'] = [];
  let totalIndices = 0;
  for (const mesh of meshes) {
    if (!mesh.apply) return null;
    const points = meshPoints(mesh.body);
    const indices = trianglesFor(mesh.body, points.length, 120_000);
    if (!indices || totalIndices + indices.length > 360_000) return null;
    const positions = points.flatMap((point) => {
      const [x, y, z] = mesh.apply!(point);
      return [(x - center[0]) * scale, (y - floorHeight) * scale, (z - center[1]) * scale]
        .map((value) => Math.round(value * 100_000) / 100_000);
    });
    if (positions.some((coordinate) => !Number.isFinite(coordinate) || Math.abs(coordinate) > 100)) return null;
    surfaces.push({ kind: surfaceKind(mesh, glassMaterials), positions, indices });
    totalIndices += indices.length;
  }
  return surfaces;
}

export function readMagicplanUsdRoom(source: string): { plan: FloorPlanGeometry; model: UsdRoomModel } | null {
  if (!/upAxis = "Y"/.test(source)) return null;
  const prims = readPrims(source);
  const meshes = prims.filter(({ type }) => type === 'Mesh');
  const floors = meshes.filter(({ name }) => /^WholeFloor_/.test(name));
  const floor = floors[0];
  if (floors.length !== 1 || !floor?.apply || meshes.length > 200) return null;
  const { body: block, apply } = floor;
  const points = meshPoints(block).map(apply);
  const indices = trianglesFor(block, points.length, 5000);
  if (!points.length || !indices) return null;
  const triangles: FloorPoint[][] = [];
  for (let start = 0; start < indices.length; start += 3) {
    triangles.push(indices.slice(start, start + 3).map((id) => {
      const [x, , z] = points[id]!;
      return [Math.round(x * 1e7) / 1e7, Math.round(z * 1e7) / 1e7];
    }));
  }
  const outline = boundary(triangles);
  if (outline.length < 3 || outlineArea(outline) <= 1e-7) return null;
  const [x0, z0, x1, z1] = bounds(outline);
  const center: FloorPoint = [(x0 + x1) / 2, (z0 + z1) / 2];
  const scale = 5 / Math.max(x1 - x0, z1 - z0);
  const glassMaterials = new Set(prims.filter(({ type, parent, body }) => {
    const opacity = Number(body.match(/float inputs:opacity\s*=\s*([.\d]+)/)?.[1]);
    return type === 'Shader' && parent?.type === 'Material' && opacity >= 0 && opacity < 0.99;
  }).map(({ parent }) => parent!.name));
  const floorHeight = points[0]![1];
  const surfaces = roomSurfaces(meshes, glassMaterials, center, floorHeight, scale);
  if (!surfaces) return null;
  const objects = meshes.filter(({ name }) => /^furniture_/.test(name)).slice(0, 100)
    .flatMap(({ body, apply }) => apply ? furnitureBox(body, apply, scale, center, floorHeight) ?? [] : []);
  return { plan: makePlan(outline.map(([x, z]) => [(x - center[0]) * scale, (z - center[1]) * scale]), objects),
    model: { version: 1, surfaces } };
}

function trimStraight(points: FloorPoint[]) {
  return points.filter(([x, z], index) => {
    const [a, b] = points[(index + points.length - 1) % points.length]!;
    const [c, d] = points[(index + 1) % points.length]!;
    return Math.abs((x - a) * (d - b) - (z - b) * (c - a)) > 0.01;
  });
}

// Magicplan colors each room face with a transparent fill. Its window insets
// protrude past the inner wall, so remove shallow four-corner excursions.
function straightenInsets(points: FloorPoint[]) {
  const [x0, z0, x1, z1] = bounds(points);
  const limit = Math.max(x1 - x0, z1 - z0) * 0.032;
  const drop = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    const [a, b, c, d] = Array.from({ length: 4 }, (_, offset) => points[(i + offset) % points.length]!) as [FloorPoint, FloorPoint, FloorPoint, FloorPoint];
    const [x, z] = [b[0] - a[0], b[1] - a[1]];
    const depth = Math.hypot(x, z);
    const dx = d[0] - a[0];
    const dz = d[1] - a[1];
    if (depth > 0 && depth < limit && Math.hypot(dx, dz) > depth * 3 &&
        Math.abs(dx * x + dz * z) < 0.05 &&
        Math.hypot(x + d[0] - c[0], z + d[1] - c[1]) < 0.01) {
      drop.add((i + 1) % points.length);
      drop.add((i + 2) % points.length);
    }
  }
  return trimStraight(points.filter((_, index) => !drop.has(index)));
}

export function readMagicplanPdf(svg: string, text: string) {
  if (!/sensopia|magicplan/i.test(text) || text.match(/\bROOMS:\s*(\d+)\b/i)?.[1] !== '1') return null;
  const area = Number(text.match(/\b(\d+(?:[.,]\d+)?)\s*m[²2]\s*\(/i)?.[1]?.replace(',', '.'));
  if (!Number.isFinite(area) || area < 0.5 || area > 2000) return null;
  const candidates: FloorPoint[][] = [];
  for (const [tag] of svg.matchAll(/<path\s[^>]*>/g)) {
    const opacity = Number(tag.match(/\bfill-opacity="([^"]+)"/)?.[1]);
    if (!(opacity > 0.02 && opacity < 0.4) || tag.includes('transform=')) continue;
    const path = tag.match(/\sd="([^"]+)"/)?.[1] ?? '';
    if (!/^M(?:\s+[-.\d]+){2}(?: L(?:\s+[-.\d]+){2})+(?:\s+Z)?\s*$/.test(path)) continue;
    const coords = path.match(numbers)?.map(Number) ?? [];
    if (coords.length < 8 || coords.length > 128 || coords.length % 2) continue;
    const ring: FloorPoint[] = [];
    for (let i = 0; i < coords.length; i += 2) ring.push([coords[i]!, coords[i + 1]!]);
    const closed = samePoint(ring[0]!, ring.at(-1)!);
    if (!closed && !path.trim().endsWith('Z')) continue;
    if (closed) ring.pop();
    if (ring.length >= 3 && outlineArea(ring) > 2000) candidates.push(ring);
  }
  if (candidates.length !== 1) return null;
  const outline = straightenInsets(candidates[0]!);
  const rawArea = outlineArea(outline);
  if (outline.length < 3 || rawArea <= 0) return null;
  const [x0, z0, x1, z1] = bounds(outline);
  const scale = Math.sqrt(area / rawArea);
  return { area, plan: makePlan(outline.map(([x, z]) => [(x - (x0 + x1) / 2) * scale, (z - (z0 + z1) / 2) * scale])) };
}

export function referenceScale(model: readonly FloorPoint[], sketch: readonly FloorPoint[]) {
  const modelArea = outlineArea(model);
  const area = outlineArea(sketch);
  if (model.length !== sketch.length || model.length < 3 || area <= 0 || modelArea <= 0) return null;
  const scale = Math.sqrt(area / modelArea);
  const edges = (ring: readonly FloorPoint[]) => ring.map(([x, z], index) => {
    const [a, b] = ring[(index + 1) % ring.length]!;
    return Math.hypot(a - x, b - z);
  });
  const lengths = edges(model).map((length) => length * scale);
  const target = edges(sketch);
  const same = (ordered: number[]) => ordered.some((_, start) => lengths.every((length, index) => {
    const expected = ordered[(start + index) % ordered.length]!;
    return Math.abs(length - expected) <= Math.max(0.03, expected * 0.045);
  }));
  return same(target) || same([...target].reverse()) ? scale : null;
}
