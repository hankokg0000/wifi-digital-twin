import type { FloorPlanGeometry, ImageBounds } from './floor-plan';
import type { FloorPoint } from './tracking';

export const ROOM_SCAN_PAGE = '/camera-twin/scan/';
export const ROOM_SCAN_API = '/camera-twin/api/scan/';
export const SCAN_MIN_SECONDS = 6;
export const SCAN_MAX_SECONDS = 90;
export const SCAN_MAX_BYTES = 180 * 1024 * 1024;
export const PLAN_IMPORT_MAX_BYTES = 25 * 1024 * 1024;

export type ScanIssue = 'camera-path' | 'floor' | 'walls' | 'overlap';

export interface ScanDoor {
  id: string;
  from: FloorPoint;
  to: FloorPoint;
  frameSeconds: number;
  imageBox: ImageBounds;
}

export interface DoorScale {
  doorId: string;
  widthMeters: number;
}

export interface ScanDraft {
  id: string;
  plan: FloorPlanGeometry | null;
  doors: ScanDoor[];
  issues: ScanIssue[];
  recordedSeconds: number;
  registeredFrames: number;
  attemptedFrames: number;
  scale?: DoorScale;
  document?: {
    type: 'pdf' | 'usdz';
    name: string;
    preview?: string;
    referenceName?: string;
    areaMeters?: number;
    metersPerUnit?: number;
  };
}

export function doorScale(doors: readonly ScanDoor[], reference?: DoorScale): number | null {
  if (!reference || !Number.isFinite(reference.widthMeters) || reference.widthMeters < 0.2 || reference.widthMeters > 5) return null;
  const door = doors.find(({ id }) => id === reference.doorId);
  if (!door) return null;
  const distance = Math.hypot(door.to[0] - door.from[0], door.to[1] - door.from[1]);
  return distance > 0.001 ? reference.widthMeters / distance : null;
}

export function scanIssues(input: {
  registeredFrames: number;
  attemptedFrames: number;
  locatedFloor: boolean;
  observedSides: number;
}): ScanIssue[] {
  if (input.registeredFrames < 4) return ['camera-path'];
  if (!input.locatedFloor) return ['floor'];
  const issues: ScanIssue[] = [];
  if (input.registeredFrames < input.attemptedFrames * 0.62) issues.push('overlap');
  if (input.observedSides < 4) issues.push('walls');
  return issues;
}
