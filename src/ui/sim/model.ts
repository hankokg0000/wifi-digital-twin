import {
  pointInPolygon,
  sampleWorld,
  type Alert,
  type AgentPlan,
  type Id,
  type SceneDoc,
  type Vec2,
  type WorldAgentState,
  type Zone,
} from '../../core';

export interface Occupant {
  id: Id;
  name: string;
  kind: 'person' | 'pet';
  color: string;
  posture: WorldAgentState['posture'];
  room: string;
  levelId: Id;
  levelName: string;
  /** Seconds the agent has been in its current room (capped by the look-back window). */
  inRoomFor: number;
  /** Seconds since the current fall began, or null when not fallen. */
  fallenFor: number | null;
  position: [number, number, number];
}

export interface ZoneStatus {
  zone: Zone;
  levelName: string;
  occupied: boolean;
}

export interface AlertItem {
  alert: Alert;
  acknowledged: boolean;
  /** Critical: the agent is still down. Warning: the agent is still inside the zone. */
  active: boolean;
  room: string;
}

export interface MonitorModel {
  occupants: Occupant[];
  zones: ZoneStatus[];
  /** Needs attention: unacknowledged criticals + currently active warnings, newest first. */
  attention: AlertItem[];
  history: AlertItem[];
  criticalCount: number;
  warningCount: number;
  /** The unacknowledged critical whose person is still down, newest first (banner source). */
  banner: AlertItem[];
}

const LOOKBACK_SECONDS = 900;
const LOOKBACK_STEP = 5;

export function zonePolygon(doc: SceneDoc, zone: Zone): Vec2[] | null {
  if (zone.roomId !== undefined) {
    const room = doc.rooms.find((r) => r.id === zone.roomId);
    return room && room.polygon.length >= 3 ? room.polygon : null;
  }
  return zone.polygon.length >= 3 ? zone.polygon : null;
}

/** Room name at a point on a level; "บันได" when it sits in a stair run, "—" otherwise. */
export function roomNameAt(doc: SceneDoc, levelId: Id, p: Vec2, onStair = false): string {
  if (onStair) return 'บันได';
  const room = doc.rooms.find((r) => r.levelId === levelId && pointInPolygon(p, r.polygon));
  return room?.name ?? '—';
}

function locate(doc: SceneDoc, s: WorldAgentState): { room: string; levelId: Id } {
  const levelId = s.onStairLevels ? s.onStairLevels[0] : s.levelId;
  return { room: roomNameAt(doc, s.levelId, [s.position[0], s.position[2]], !!s.onStairLevels), levelId };
}

function agentInZone(doc: SceneDoc, zone: Zone, kind: 'person' | 'pet', s: WorldAgentState): boolean {
  if (zone.appliesTo !== 'any' && zone.appliesTo !== kind) return false;
  if (s.levelId !== zone.levelId) return false;
  const poly = zonePolygon(doc, zone);
  return !!poly && pointInPolygon([s.position[0], s.position[2]], poly);
}

export function buildModel(
  doc: SceneDoc,
  plans: Map<Id, AgentPlan>,
  alerts: Alert[],
  t: number,
  acknowledged: Record<string, true>,
): MonitorModel {
  const states = sampleWorld(doc, plans, t);
  const stateById = new Map(states.map((s) => [s.agentId, s]));
  const levelName = (id: Id) => doc.levels.find((l) => l.id === id)?.name ?? '—';
  const visible = alerts.filter((a) => a.t <= t);

  // Look back (coarse steps) for when each agent entered its current room.
  const back: WorldAgentState[][] = [];
  for (let tt = t - LOOKBACK_STEP; tt >= Math.max(0, t - LOOKBACK_SECONDS); tt -= LOOKBACK_STEP) {
    back.push(sampleWorld(doc, plans, tt));
  }

  const occupants: Occupant[] = [];
  for (const agent of doc.agents) {
    const s = stateById.get(agent.id);
    if (!s) continue;
    const here = locate(doc, s);
    let inRoomFor = Math.min(t, LOOKBACK_SECONDS);
    for (let i = 0; i < back.length; i++) {
      const prev = back[i]!.find((x) => x.agentId === agent.id);
      if (!prev) continue;
      const loc = locate(doc, prev);
      if (loc.room !== here.room || loc.levelId !== here.levelId) {
        inRoomFor = LOOKBACK_STEP * i;
        break;
      }
    }
    let fallenFor: number | null = null;
    if (s.posture === 'fallen') {
      const start = [...visible].reverse().find((a) => a.agentId === agent.id && a.kind === 'fall');
      fallenFor = start ? t - start.t : 0;
    }
    occupants.push({
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      color: agent.color,
      posture: s.posture,
      room: here.room,
      levelId: here.levelId,
      levelName: levelName(here.levelId),
      inRoomFor,
      fallenFor,
      position: s.position,
    });
  }
  occupants.sort((a, b) => Number(b.posture === 'fallen') - Number(a.posture === 'fallen'));

  const zones: ZoneStatus[] = doc.zones.map((zone) => ({
    zone,
    levelName: levelName(zone.levelId),
    occupied:
      zone.enabled &&
      doc.agents.some((a) => {
        const s = stateById.get(a.id);
        return !!s && agentInZone(doc, zone, a.kind, s);
      }),
  }));

  const items: AlertItem[] = visible.map((alert) => {
    const agent = doc.agents.find((a) => a.id === alert.agentId);
    const s = stateById.get(alert.agentId);
    let active = false;
    if (s && agent) {
      if (alert.severity === 'critical') active = s.posture === 'fallen';
      else {
        const zone = doc.zones.find((z) => z.id === alert.zoneId);
        active = !!zone && zone.enabled && agentInZone(doc, zone, agent.kind, s);
      }
    }
    return {
      alert,
      acknowledged: !!acknowledged[alert.id],
      active,
      room: roomNameAt(doc, alert.levelId, [alert.position[0], alert.position[2]]),
    };
  });
  items.sort((a, b) => b.alert.t - a.alert.t);

  const needsAttention = (i: AlertItem) => (i.alert.severity === 'critical' ? !i.acknowledged : i.active);
  const attention = items.filter(needsAttention);
  const history = items.filter((i) => !needsAttention(i));
  const unackedCritical = attention.filter((i) => i.alert.severity === 'critical');

  return {
    occupants,
    zones,
    attention,
    history,
    // Acknowledging silences the banner but never reads as "all clear": anyone still down
    // keeps the critical pill lit.
    criticalCount: new Set([...unackedCritical.map((i) => i.alert.agentId), ...occupants.filter((o) => o.posture === 'fallen').map((o) => o.id)]).size,
    // Current state, not events: zones with someone inside right now (matches the zone chips
    // and the hatch on the canvas).
    warningCount: zones.filter((z) => z.occupied).length,
    banner: unackedCritical.filter((i) => i.active),
  };
}
