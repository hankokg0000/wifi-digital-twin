import { SCENE_FOV, type GeneratedScene } from './generated-scene';
import type { FloorPoint } from './tracking';

type Vector3 = readonly [number, number, number];
export type InverseDepthPlane = readonly [u: number, v: number, offset: number];
export interface FloorProjection {
  aspect: number;
  plane: InverseDepthPlane;
}

export function inverseDepth(disparity: number): number {
  return 0.13 + 0.46 * (disparity - 1) / 254;
}

function dot(a: Vector3, b: Vector3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(vector: Vector3): Vector3 {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

export function createFloorCoordinates({ aspect, plane: [a, b, offset] }: FloorProjection) {
  const rayHeight = 2 * Math.tan(SCENE_FOV * Math.PI / 360);
  const rayWidth = rayHeight * aspect;
  // The inverse distance to a flat surface is affine in image coordinates.
  const normal: Vector3 = [a / rayWidth, -b / rayHeight, -offset - (a + b) * 0.5];
  const up = unit([-normal[0], -normal[1], -normal[2]]);
  const right = unit(cross(up, [0, 0, 1]));
  const forward = cross(right, up);
  const cameraHeight = 1 / Math.hypot(...normal);

  function surface([u, v]: FloorPoint, inverse: number): Vector3 | null {
    if (!Number.isFinite(inverse) || inverse < 0.065) return null;
    const position: Vector3 = [(u - 0.5) * rayWidth / inverse, (0.5 - v) * rayHeight / inverse, -1 / inverse];
    return [dot(position, right), cameraHeight + dot(position, up), dot(position, forward)];
  }

  return {
    surface,
    ground([u, v]: FloorPoint): FloorPoint | null {
      if (![u, v].every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)) return null;
      const point = surface([u, v], a * u + b * v + offset);
      return point ? [point[0], point[2]] : null;
    },
  };
}

export interface FloorSample {
  u: number;
  v: number;
  inverse: number;
}

function fitPlane(samples: FloorSample[]): InverseDepthPlane | null {
  const means = samples.reduce((sum, s) => (
    { u: sum.u + s.u, v: sum.v + s.v, inverse: sum.inverse + s.inverse }
  ), { u: 0, v: 0, inverse: 0 });
  means.u /= samples.length;
  means.v /= samples.length;
  means.inverse /= samples.length;
  let uu = 0;
  let vv = 0;
  let uv = 0;
  let ud = 0;
  let vd = 0;
  for (const s of samples) {
    const u = s.u - means.u;
    const v = s.v - means.v;
    const d = s.inverse - means.inverse;
    uu += u * u;
    vv += v * v;
    uv += u * v;
    ud += u * d;
    vd += v * d;
  }
  const determinant = uu * vv - uv * uv;
  if (determinant < 1e-7) return null;
  const a = (ud * vv - vd * uv) / determinant;
  const b = (vd * uu - ud * uv) / determinant;
  if (b < 0.035 || b < Math.abs(a) * 0.12) return null;
  return [a, b, means.inverse - a * means.u - b * means.v];
}

function residual([a, b, c]: InverseDepthPlane, sample: FloorSample) {
  return Math.abs(sample.inverse - a * sample.u - b * sample.v - c);
}

export function fitSceneFloor(samples: FloorSample[]): InverseDepthPlane | null {
  if (samples.length < 24) return null;
  const stride = Math.max(1, Math.floor(samples.length / 700));
  const probe = samples.filter((_, i) => i % stride === 0);
  let seed = 17831;
  const pick = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return probe[seed % probe.length]!;
  };
  let best: InverseDepthPlane | null = null;
  let bestScore = -Infinity;
  const tolerance = 0.033;
  for (let i = 0; i < 96; i++) {
    const plane = fitPlane([pick(), pick(), pick()]);
    if (!plane) continue;
    const score = probe.reduce((sum, sample) => sum + Math.max(0, 1 - residual(plane, sample) / tolerance), 0);
    if (score > bestScore) {
      best = plane;
      bestScore = score;
    }
  }
  if (!best) return null;
  const inliers = samples.filter((sample) => residual(best!, sample) <= tolerance);
  return inliers.length >= samples.length * 0.38 ? fitPlane(inliers) ?? best : null;
}

export function planFloorSamples(scene: GeneratedScene, isFloor: (index: number) => boolean): FloorSample[] {
  const points: FloorSample[] = [];
  const { width, height, disparity } = scene;
  for (let index = 0; index < disparity.length; index++) {
    const value = disparity[index]!;
    if (value <= 1 || value >= 255 || !isFloor(index)) continue;
    points.push({ u: (index % width + 0.5) / width, v: (Math.floor(index / width) + 0.5) / height, inverse: inverseDepth(value) });
  }
  return points;
}
