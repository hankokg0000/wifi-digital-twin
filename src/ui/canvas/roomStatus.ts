/**
 * Room status for the Monitor's floor tint. The decision is a pure function; <AgentsLayer>
 * (which already samples every agent every frame) writes the result per room into a tiny
 * module-level registry that <RoomMesh> reads in its own frame loop — same pattern as
 * zoneOccupancy.ts, so nothing here touches React state.
 */
import { pointInPolygon } from '../../core';
import type { Vec2 } from '../../core';

export type RoomStatus = 'empty' | 'occupied' | 'warning' | 'critical';

export interface AlertPoint {
  /** Floor position [x, z] of the agent an active simulated alert is about. */
  p: Vec2;
  severity: 'warning' | 'critical';
}

/**
 * Status of one room on one level:
 *  - `critical` if an active critical alert (fall / fall with no recovery) is inside it,
 *  - else `warning` if an active warning (restricted-zone entry) is inside it,
 *  - else `occupied` if any simulated agent stands inside it,
 *  - else `empty`.
 * `agentPositions` and `alerts` must already be filtered to the room's level.
 */
export function roomStatus(polygon: readonly Vec2[], agentPositions: readonly Vec2[], alerts: readonly AlertPoint[]): RoomStatus {
  if (polygon.length < 3) return 'empty';
  const poly = polygon as Vec2[];
  let warning = false;
  for (const a of alerts) {
    if (!pointInPolygon(a.p, poly)) continue;
    if (a.severity === 'critical') return 'critical';
    warning = true;
  }
  if (warning) return 'warning';
  return agentPositions.some((p) => pointInPolygon(p, poly)) ? 'occupied' : 'empty';
}

const statuses = new Map<string, RoomStatus>();

export function setRoomStatus(roomId: string, status: RoomStatus) {
  statuses.set(roomId, status);
}

export function getRoomStatus(roomId: string): RoomStatus {
  return statuses.get(roomId) ?? 'empty';
}
