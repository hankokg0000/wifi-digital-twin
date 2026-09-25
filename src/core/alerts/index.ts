// Alerts engine — design.md §7.2. Pure and deterministic: scans agent states at a fixed step
// over the horizon and raises alerts for restricted-zone entry, falls, and falls with no
// recovery within 60 s.
//
// `stateAt` is the seam Phase 3 plugs into: today the caller passes `t => sampleWorld(doc, plans,
// t)` (ground truth). Once estimators exist, the same signature can be satisfied by the twin's
// *estimated* state instead — computeAlerts itself never reads World directly, so nothing here
// needs to change (design.md §2 "World ≠ Twin").
import type { SceneDoc, Id, Vec2, Vec3, Zone } from '../scene/types';
import { pointInPolygon } from '../scene/geometry';
import type { WorldAgentState } from '../sim/world';

export type AlertKind = 'zone-entry' | 'fall' | 'fall-no-recovery';

export interface Alert {
  id: string;
  t: number;
  kind: AlertKind;
  severity: 'warning' | 'critical';
  agentId: Id;
  zoneId?: Id;
  levelId: Id;
  position: Vec3;
  message: string;
}

/** Ground truth today, estimated twin state in Phase 3 — see module comment. */
export type StateAt = (t: number) => WorldAgentState[];

const FALL_NO_RECOVERY_SECONDS = 60;

function appliesToAgentKind(zone: Zone, kind: 'person' | 'pet'): boolean {
  return zone.appliesTo === 'any' || zone.appliesTo === kind;
}

/** The polygon a zone currently occupies: the linked room's polygon, or its own. */
function zonePolygon(doc: SceneDoc, zone: Zone): Vec2[] | null {
  if (zone.roomId !== undefined) {
    const room = doc.rooms.find((r) => r.id === zone.roomId);
    return room && room.polygon.length >= 3 ? room.polygon : null;
  }
  return zone.polygon.length >= 3 ? zone.polygon : null;
}

function pointToSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.min(Math.max(((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2, 0), 1);
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
}

/** Room name for an alert message: point-in-polygon over the level's rooms, falling back to
 * "บันได" if the point sits on a stair (no room contains it there) and "—" otherwise. */
function roomNameAt(doc: SceneDoc, levelId: Id, p: Vec2): string {
  const room = doc.rooms.find((r) => r.levelId === levelId && pointInPolygon(p, r.polygon));
  if (room) return room.name;
  const nearStair = doc.stairs.some((s) => {
    if (s.fromLevelId !== levelId && s.toLevelId !== levelId) return false;
    return pointToSegmentDistance(p, s.bottom, s.top) <= Math.max(s.width, 1);
  });
  return nearStair ? 'บันได' : '—';
}

/**
 * Scan `stateAt` from 0 to `horizon` in `step`-second increments and return every alert raised,
 * sorted by time. Pure function of its inputs (same doc/stateAt/horizon/step → same alerts).
 */
export function computeAlerts(doc: SceneDoc, stateAt: StateAt, horizon: number, step = 0.5): Alert[] {
  const alerts: Alert[] = [];
  const agentsById = new Map(doc.agents.map((a) => [a.id, a]));
  const enabledZones = doc.zones.filter((z) => z.enabled);

  const wasInsideZone = new Map<string, boolean>(); // `${agentId}:${zoneId}` -> was inside last sample
  const fallStartByAgent = new Map<Id, number>(); // agentId -> t the current fall episode started
  const noRecoveryRaised = new Set<Id>(); // agentId set, so "no recovery" fires once per episode

  for (let t = 0; t <= horizon + 1e-9; t += step) {
    const states = stateAt(t);
    for (const state of states) {
      const agent = agentsById.get(state.agentId);
      if (!agent) continue;

      for (const zone of enabledZones) {
        if (!appliesToAgentKind(zone, agent.kind)) continue;
        const poly = zonePolygon(doc, zone);
        if (!poly) continue;
        const inside = state.levelId === zone.levelId && pointInPolygon([state.position[0], state.position[2]], poly);
        const key = `${agent.id}:${zone.id}`;
        // The first sample is the baseline: starting inside a zone is not an "entry".
        const before = wasInsideZone.get(key) ?? inside;
        if (inside && !before) {
          alerts.push({
            id: `zone:${zone.id}:${agent.id}:${t.toFixed(2)}`,
            t,
            kind: 'zone-entry',
            severity: 'warning',
            agentId: agent.id,
            zoneId: zone.id,
            levelId: state.levelId,
            position: state.position,
            message: `${agent.name} เข้าพื้นที่ห้ามเข้า: ${zone.name}`,
          });
        }
        wasInsideZone.set(key, inside);
      }

      if (state.posture === 'fallen') {
        const start = fallStartByAgent.get(agent.id);
        if (start === undefined) {
          fallStartByAgent.set(agent.id, t);
          noRecoveryRaised.delete(agent.id);
          const roomName = roomNameAt(doc, state.levelId, [state.position[0], state.position[2]]);
          alerts.push({
            id: `fall:${agent.id}:${t.toFixed(2)}`,
            t,
            kind: 'fall',
            severity: 'critical',
            agentId: agent.id,
            levelId: state.levelId,
            position: state.position,
            message: `ตรวจพบคนล้ม: ${agent.name} ที่ ${roomName}`,
          });
        } else if (t - start >= FALL_NO_RECOVERY_SECONDS && !noRecoveryRaised.has(agent.id)) {
          noRecoveryRaised.add(agent.id);
          alerts.push({
            id: `fall-no-recovery:${agent.id}:${t.toFixed(2)}`,
            t,
            kind: 'fall-no-recovery',
            severity: 'critical',
            agentId: agent.id,
            levelId: state.levelId,
            position: state.position,
            message: `${agent.name} ล้มและยังไม่ลุกเกิน 60 วินาที`,
          });
        }
      } else {
        fallStartByAgent.delete(agent.id);
      }
    }
  }

  alerts.sort((a, b) => a.t - b.t);
  return alerts;
}
