import type { FloorPlanGeometry } from './floor-plan';
import type { SceneObservation } from './generated-scene';
import type { ScanDraft } from './room-scan';
import { createFloorProjection, isInCameraRegion, type FloorCalibration, type FloorPoint } from './tracking';

export const ROOM_MONITOR_API = '/camera-twin/api/monitor/';
export const ROOM_SETUP_PAGE = '/camera-twin/scan/';
export const BOARD_WIDTH = 0.25;
export const BOARD_DEPTH = 0.17;
export const BOARD_CENTRES = [[0.038, 0.038], [0.212, 0.038], [0.212, 0.132], [0.038, 0.132]] as const;

export type RoomCameraSource = 'demo' | 'live';
export type RoomWifiSource = 'simulated' | 'esp32';
export type WifiStatus = 'idle' | 'motion' | 'disconnected' | 'baseline-needed' | 'calibrating';
export interface MonitorRoom {
  id: string;
  title: string;
  plan: FloorPlanGeometry;
  modelUrl?: string;
  metersPerUnit?: number;
}
export interface BoardPlacement {
  index: number;
  outline: FloorCalibration['floor'];
  points: FloorCalibration['floor'];
}
export interface MonitorStatus {
  roomId: string | null;
  camera: RoomCameraSource;
  liveAvailable: boolean;
  liveState: 'offline' | 'ready' | 'connecting';
  demo: { id: string; title: string; url: string } | null;
  uploading: boolean;
  frame: { jpeg: string; observations: SceneObservation[] } | null;
  calibration: 'unscaled' | 'choose' | 'looking' | 'ready';
  placement: BoardPlacement | null;
  placements: number;
  wifi: { source: RoomWifiSource; state: WifiStatus; feedback?: string };
}
export interface MonitorDemo {
  frames: SceneObservation[][];
}

export function roomForMonitor(draft: ScanDraft, modelUrl?: string): MonitorRoom | null {
  if (!draft.document || !draft.plan) return null;
  return {
    id: draft.id, title: draft.document.name, plan: draft.plan, modelUrl,
    metersPerUnit: draft.document.metersPerUnit,
  };
}

function signedArea(ring: readonly FloorPoint[]) {
  return ring.reduce((sum, [x, z], i) => {
    const [a, b] = ring[(i + 1) % ring.length]!;
    return sum + x * b - z * a;
  }, 0) / 2;
}

export function boardPlacements(room: MonitorRoom): BoardPlacement[] {
  const scale = room.metersPerUnit;
  const ring = room.plan.visibleFloor;
  if (!scale || !Number.isFinite(scale) || scale <= 0 || ring.length < 3) return [];
  const winding = Math.sign(signedArea(ring));
  const polygon = ring.map(([x, z]): [number, number] => [x, z]);
  const candidates = ring.flatMap((corner, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length]!;
    const end = ring[(index + 1) % ring.length]!;
    const dx = end[0] - corner[0];
    const dz = end[1] - corner[1];
    const length = Math.hypot(dx, dz);
    const turn = ((corner[0] - previous[0]) * dz - (corner[1] - previous[1]) * dx) * winding;
    // The print has its long edge along the wall and its left edge at the corner.
    // Use a clockwise interior in the printed image (right, then down).
    if (turn <= 1e-6 || length * scale < BOARD_WIDTH * 1.5) return [];
    const along = [dx / length, dz / length] as const;
    const inward = [-along[1] * winding, along[0] * winding] as const;
    const at = ([x, z]: FloorPoint): FloorPoint => {
      const u = winding > 0 ? x : BOARD_WIDTH - x;
      return [corner[0] + (along[0] * u + inward[0] * z) / scale,
        corner[1] + (along[1] * u + inward[1] * z) / scale];
    };
    const outline = [at([0, 0]), at([BOARD_WIDTH, 0]), at([BOARD_WIDTH, BOARD_DEPTH]), at([0, BOARD_DEPTH])] as const;
    const points = [at(BOARD_CENTRES[0]), at(BOARD_CENTRES[1]), at(BOARD_CENTRES[2]), at(BOARD_CENTRES[3])] as const;
    if (![...outline, ...points].every((sample) => isInCameraRegion(sample, polygon))) return [];
    return [{ footprint: { index, outline, points }, length }];
  });
  return candidates.sort((a, b) => b.length - a.length).map(({ footprint }) => footprint);
}

export function validBoardImage(points: FloorCalibration['image']) {
  if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0.01 || x > 0.99 || y < 0.01 || y > 0.99)) return false;
  if (Math.abs(signedArea(points)) < 0.0008) return false;
  const turns = points.map(([x, y], i) => {
    const [a, b] = points[(i + 1) % 4]!;
    const [c, d] = points[(i + 2) % 4]!;
    return (a - x) * (d - b) - (b - y) * (c - a);
  });
  return turns.every((value) => value > 0.0001) || turns.every((value) => value < -0.0001);
}

export function roomProjector(calibration: FloorCalibration | null, plan: FloorPlanGeometry) {
  const project = calibration && createFloorProjection(calibration);
  const polygon = plan.visibleFloor.map(([x, z]): [number, number] => [x, z]);
  return (point: FloorPoint): FloorPoint | null => {
    const position = project?.(point);
    return position && isInCameraRegion(position, polygon) ? position : null;
  };
}

function insetFrameCoordinate(value: number) {
  return 0.08 + 0.84 * Math.max(0, Math.min(1, value));
}

function simulateFloorPosition(plan: FloorPlanGeometry, [u, v]: FloorPoint): FloorPoint | null {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const [, front, , back] = plan.bounds;
  const z = front + (back - front) * insetFrameCoordinate(v);
  const ring = plan.visibleFloor;
  // Intersect the row with the floor outline, so a concave room keeps its recesses.
  const crossings = ring.flatMap(([x, from], index) => {
    const [nextX, to] = ring[(index + 1) % ring.length]!;
    return (from > z) === (to > z) ? [] : [x + (nextX - x) * (z - from) / (to - from)];
  }).sort((a, b) => a - b);
  const spans: { left: number; length: number }[] = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const left = crossings[i]!;
    const width = crossings[i + 1]! - left;
    if (width > 0) spans.push({ left: left + width * 0.04, length: width * 0.92 });
  }
  let offset = spans.reduce((total, span) => total + span.length, 0) * insetFrameCoordinate(u);
  for (const span of spans) {
    if (offset <= span.length) return [Number((span.left + offset).toFixed(6)), Number(z.toFixed(6))];
    offset -= span.length;
  }
  return null;
}

/** Estimate display positions from a clip without treating it as a calibrated camera. */
export function simulateDemoFrames(frames: MonitorDemo['frames'], plan: FloorPlanGeometry): MonitorDemo['frames'] {
  let previous = new Map<number, FloorPoint>();
  return frames.map((frame) => {
    const anchors = new Map<number, FloorPoint>();
    const projected = frame.map((observation) => {
      const { id, box, ground } = observation;
      // Older clips and upper-body detections can lack a visible ground point.
      const sample = ground ?? [box.x + box.width / 2, box.y + box.height * 1.6];
      const prior = previous.get(id);
      const anchor: FloorPoint = prior ? [prior[0] * 0.35 + sample[0] * 0.65, prior[1] * 0.35 + sample[1] * 0.65] : sample;
      anchors.set(id, anchor);
      const position = simulateFloorPosition(plan, anchor);
      return { ...observation, position: position ?? undefined };
    });
    previous = anchors;
    return projected;
  });
}

export function wifiHighlightsRoom(status: WifiStatus, observations: readonly SceneObservation[]) {
  return status === 'motion' && observations.length === 0;
}

export function parseEspCsi(line: string) {
  if (!line.startsWith('CSI_DATA,') || line.length > 8192) return null;
  const match = /^(.*?),\s*"?(\[[^\[\]]+\])"?\s*$/.exec(line);
  if (!match) return null;
  const fields = match[1]!.split(',');
  if (fields.length !== 24 && fields.length !== 14) return null;
  const peer = fields[2]!.toLowerCase();
  if (!/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(peer)) return null;
  const channel = Number(fields[fields.length === 24 ? 16 : 8]);
  const count = Number(fields.at(-2));
  const invalidFirst = fields.at(-1);
  if (!Number.isInteger(channel) || channel < 1 || channel > 196 || !Number.isInteger(count) || count < 8 ||
      count > 1024 || count % 2 || (invalidFirst !== '0' && invalidFirst !== '1')) return null;
  let data: unknown;
  try { data = JSON.parse(match[2]!); } catch { return null; }
  if (!Array.isArray(data) || data.length !== count || data.some(value => !Number.isInteger(value) || value < -128 || value > 127)) return null;
  const samples = data.slice(invalidFirst === '1' ? 4 : 0);
  const meanPower = samples.reduce((sum, value: number) => sum + value ** 2, 0) / (samples.length / 2);
  const format = fields.length === 24 ? fields.slice(5, 8).join(':') : fields[11];
  return meanPower > 0 ? { peer, key: `${peer}/${channel}/${format}/${count}`, power: 10 * Math.log10(meanPower) } : null;
}
