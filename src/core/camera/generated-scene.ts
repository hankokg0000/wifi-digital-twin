import type { CameraPersonDetection, FloorPoint, PersonDetection } from './tracking';

export const SCENE_WIDTH = 192;
export const SCENE_HEIGHT = 108;
export const SCENE_FOV = 50;

export interface GeneratedScene {
  width: number;
  height: number;
  /** Quantized relative disparity; zero marks an unobserved surface. */
  disparity: number[];
}

export interface SceneObservation {
  id: number;
  box: PersonDetection;
  ground?: FloorPoint;
  position?: FloorPoint;
}

export interface BackgroundSample {
  rgb: Uint8Array;
  detections: readonly CameraPersonDetection[];
}

function maskPeople(detections: readonly CameraPersonDetection[], width: number, height: number) {
  const mask = new Uint8Array(width * height);
  for (const { x, y, width: w, height: h, confidence, ground } of detections) {
    if (confidence < 0.38) continue;
    const left = Math.max(0, Math.floor((x - w * 0.30) * width));
    const right = Math.min(width, Math.ceil((x + w * 1.30) * width));
    const top = Math.max(0, Math.floor((y - h * 0.22) * height));
    const bottom = Math.min(height, Math.ceil(Math.max(y + h * 2, (ground?.[1] ?? 0) + 0.02) * height));
    if (right <= left || bottom <= top) continue;
    for (let row = top; row < bottom; row++) mask.fill(1, row * width + left, row * width + right);
  }
  return mask;
}

export function mergeSceneBackground(samples: BackgroundSample[], width: number, height: number) {
  const count = width * height;
  if (!samples.length || samples.some(({ rgb }) => rgb.length !== count * 3)) throw new Error('Invalid background samples');
  const masks = samples.map(({ detections }) => maskPeople(detections, width, height));
  const rgb = new Uint8Array(count * 3);
  const visible = new Uint8Array(count);
  for (let pixel = 0; pixel < count; pixel++) {
    const offset = pixel * 3;
    const ranked = samples.map((sample, index) => ({
      rgb: sample.rgb,
      luminance: sample.rgb[offset]! * 3 + sample.rgb[offset + 1]! * 6 + sample.rgb[offset + 2]!,
      visible: masks[index]![pixel] === 0,
    }));
    const unmasked = ranked.filter((sample) => sample.visible);
    const candidates = unmasked.length ? unmasked : ranked;
    candidates.sort((a, b) => a.luminance - b.luminance);
    const selected = candidates[Math.floor(candidates.length / 2)]!;
    rgb.set(selected.rgb.subarray(offset, offset + 3), offset);
    visible[pixel] = unmasked.length ? 1 : 0;
  }
  return { rgb, visible };
}

export function createGeneratedScene(
  width: number, height: number, depth: number[], background: ReturnType<typeof mergeSceneBackground>,
): GeneratedScene {
  const count = width * height;
  if (depth.length !== count || background.rgb.length !== count * 3 || background.visible.length !== count) {
    throw new Error('Depth and background sizes differ');
  }
  const values = depth.filter((d, index) => background.visible[index] && Number.isFinite(d) && d >= 0).sort((a, b) => a - b);
  const min = values[Math.floor(values.length * 0.04)];
  const max = values[Math.floor(values.length * 0.96)];
  if (values.length < count * 0.18 || min === undefined || max === undefined || max - min < 0.00001) {
    throw new Error('No usable depth contrast');
  }
  return {
    width, height,
    disparity: depth.map((value, index) => background.visible[index] && Number.isFinite(value) && value >= 0
      ? 1 + Math.round(Math.min(1, Math.max(0, (value - min) / (max - min))) * 254) : 0),
  };
}

function detectionDistance(a: PersonDetection, b: PersonDetection) {
  return Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2);
}

/** IDs last through nearby successive clip frames and only serve to connect points during playback. */
export function createSceneTracker(project: (point: FloorPoint) => FloorPoint | null, keepGround = false) {
  let nextId = 1;
  let previous: SceneObservation[] = [];
  return (frame: readonly CameraPersonDetection[]): SceneObservation[] => {
    const boxes = frame.filter(({ confidence }) => confidence >= 0.38);
    const pairs = boxes.flatMap((box, index) => previous.map((track) => ({
      index, id: track.id, distance: detectionDistance(box, track.box),
    })).filter(({ distance }) => distance <= 0.09)).sort((a, b) => a.distance - b.distance);
    const used = new Set<number>();
    const assigned = new Map<number, number>();
    for (const { index, id } of pairs) {
      if (used.has(id) || assigned.has(index)) continue;
      assigned.set(index, id);
      used.add(id);
    }
    previous = boxes.map(({ ground, ...box }, index) => {
      const position = ground && project(ground);
      return { id: assigned.get(index) ?? nextId++, box, ...(ground && (keepGround || position) ? { ground } : {}),
        ...(position ? { position } : {}) };
    });
    return previous;
  };
}

export function trackGeneratedScene(detections: readonly CameraPersonDetection[][], project: (point: FloorPoint) => FloorPoint | null): SceneObservation[][] {
  return detections.map(createSceneTracker(project));
}
