import type { SceneDoc, Id, Room, Agent, Waypoint, AgentBehavior, Vec2 } from '../types';
import { newId } from '../ids';
import { pointInPolygon } from '../geometry';
import { checked, requireEntity, requireLevel, SceneOpError } from './shared';

// Colors deliberately avoid '#5ac8fa' — that's the app's selection-highlight accent, so a new
// agent in that color would look identical whether selected or not.
const AGENT_DEFAULTS = {
  person: { radius: 0.2, height: 1.7, speed: 1.2, color: '#4a90d9', name: 'คนใหม่' },
  pet: { radius: 0.15, height: 0.35, speed: 0.8, color: '#ffb020', name: 'สัตว์เลี้ยงใหม่' },
} as const;

export interface AddAgentInput {
  kind?: 'person' | 'pet';
  start: Waypoint;
  name?: string;
  color?: string;
  radius?: number;
  height?: number;
  speed?: number;
  materialId?: Id;
}

/** Find the room (if any) on `levelId` whose polygon contains `p`. */
function findRoomAt(doc: SceneDoc, levelId: Id, p: Vec2): Room | undefined {
  return doc.rooms.find((r) => r.levelId === levelId && pointInPolygon(p, r.polygon));
}

export function addAgent(doc: SceneDoc, input: AddAgentInput): { doc: SceneDoc; id: Id } {
  requireLevel(doc, input.start.levelId);
  const kind = input.kind ?? 'person';
  const defaults = AGENT_DEFAULTS[kind];
  const id = newId('agent');
  const start: Waypoint = { levelId: input.start.levelId, p: [input.start.p[0], input.start.p[1]], dwell: input.start.dwell };

  let behavior: AgentBehavior;
  if (kind === 'pet') {
    const room = findRoomAt(doc, start.levelId, start.p);
    behavior = room
      ? { type: 'wander', levelId: start.levelId, roomId: room.id, pauseMin: 5, pauseMax: 20 }
      : { type: 'route', waypoints: [{ ...start }], loop: false };
  } else {
    behavior = { type: 'route', waypoints: [{ ...start }], loop: false };
  }

  const agent: Agent = {
    id,
    name: input.name ?? defaults.name,
    kind,
    color: input.color ?? defaults.color,
    radius: input.radius ?? defaults.radius,
    height: input.height ?? defaults.height,
    speed: input.speed ?? defaults.speed,
    materialId: input.materialId ?? 'human-body',
    start,
    behavior,
  };
  const next = checked({ ...doc, agents: [...doc.agents, agent] });
  return { doc: next, id };
}

export function updateAgent(doc: SceneDoc, id: Id, patch: Partial<Omit<Agent, 'id'>>): SceneDoc {
  requireEntity(doc.agents, id, 'agent');
  const agents = doc.agents.map((a) => (a.id === id ? { ...a, ...patch } : a));
  return checked({ ...doc, agents });
}

/** Append a waypoint to a route agent's behavior. Throws if the agent is not a route agent. */
export function addWaypoint(doc: SceneDoc, agentId: Id, wp: Waypoint): SceneDoc {
  const agent = requireEntity(doc.agents, agentId, 'agent');
  if (agent.behavior.type !== 'route') {
    throw new SceneOpError(`agent "${agentId}" is not a route agent`);
  }
  const waypoints = [...agent.behavior.waypoints, { levelId: wp.levelId, p: [wp.p[0], wp.p[1]] as Vec2, dwell: wp.dwell }];
  const agents = doc.agents.map((a) => (a.id === agentId ? { ...a, behavior: { ...a.behavior, waypoints } as AgentBehavior } : a));
  return checked({ ...doc, agents });
}

/** Patch one waypoint (by index) of a route agent. */
export function updateWaypoint(doc: SceneDoc, agentId: Id, index: number, patch: Partial<Waypoint>): SceneDoc {
  const agent = requireEntity(doc.agents, agentId, 'agent');
  if (agent.behavior.type !== 'route') {
    throw new SceneOpError(`agent "${agentId}" is not a route agent`);
  }
  if (index < 0 || index >= agent.behavior.waypoints.length) {
    throw new SceneOpError(`waypoint index ${index} out of range for agent "${agentId}"`);
  }
  const waypoints = agent.behavior.waypoints.map((wp, i) => (i === index ? { ...wp, ...patch } : wp));
  const agents = doc.agents.map((a) => (a.id === agentId ? { ...a, behavior: { ...a.behavior, waypoints } as AgentBehavior } : a));
  return checked({ ...doc, agents });
}

/** Remove one waypoint (by index) from a route agent. */
export function removeWaypoint(doc: SceneDoc, agentId: Id, index: number): SceneDoc {
  const agent = requireEntity(doc.agents, agentId, 'agent');
  if (agent.behavior.type !== 'route') {
    throw new SceneOpError(`agent "${agentId}" is not a route agent`);
  }
  if (index < 0 || index >= agent.behavior.waypoints.length) {
    throw new SceneOpError(`waypoint index ${index} out of range for agent "${agentId}"`);
  }
  const waypoints = agent.behavior.waypoints.filter((_, i) => i !== index);
  const agents = doc.agents.map((a) => (a.id === agentId ? { ...a, behavior: { ...a.behavior, waypoints } as AgentBehavior } : a));
  return checked({ ...doc, agents });
}
