import type {
  SceneDoc,
  Id,
  Level,
  Wall,
  Opening,
  Room,
  SceneObject,
  Agent,
  Waypoint,
  AgentBehavior,
  Radio,
  RadioIface,
  Material,
  Stair,
  Zone,
  Incident,
  ValidationIssue,
  Vec2,
  Vec3,
} from './types';
import { newId } from './ids';
import { validateDoc } from './validate';
import { pointInPolygon } from './geometry';

/** Thrown by any op when the input is invalid or would leave the doc in an invalid state. */
export class SceneOpError extends Error {
  issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = 'SceneOpError';
    this.issues = issues;
  }
}

/** Validate `next`; throw SceneOpError if it introduces any issues, otherwise return it. */
function checked(next: SceneDoc): SceneDoc {
  const issues = validateDoc(next);
  if (issues.length > 0) {
    throw new SceneOpError(`operation would produce an invalid document (${issues.length} issue(s))`, issues);
  }
  return next;
}

function requireLevel(doc: SceneDoc, levelId: Id): Level {
  const level = doc.levels.find((l) => l.id === levelId);
  if (!level) throw new SceneOpError(`level "${levelId}" not found`);
  return level;
}

function requireWall(doc: SceneDoc, wallId: Id): Wall {
  const wall = doc.walls.find((w) => w.id === wallId);
  if (!wall) throw new SceneOpError(`wall "${wallId}" not found`);
  return wall;
}

function requireEntity<T extends { id: Id }>(list: T[], id: Id, kind: string): T {
  const entity = list.find((x) => x.id === id);
  if (!entity) throw new SceneOpError(`${kind} "${id}" not found`);
  return entity;
}

// ===========================================================================
// Level
// ===========================================================================

export interface AddLevelInput {
  name?: string;
  elevation?: number;
  height?: number;
  slabMaterialId?: string;
}

export function addLevel(doc: SceneDoc, partial: AddLevelInput = {}): { doc: SceneDoc; id: Id } {
  const highestTop = doc.levels.reduce((top, l) => Math.max(top, l.elevation + l.height), -Infinity);
  const defaultElevation = doc.levels.length === 0 ? 0 : highestTop + 0.2;
  const id = newId('level');
  const level: Level = {
    id,
    name: partial.name ?? `ชั้น ${doc.levels.length + 1}`,
    elevation: partial.elevation ?? defaultElevation,
    height: partial.height ?? 3.0,
    slabMaterialId: partial.slabMaterialId ?? 'concrete-slab',
  };
  const next = checked({ ...doc, levels: [...doc.levels, level] });
  return { doc: next, id };
}

export function updateLevel(doc: SceneDoc, id: Id, patch: Partial<Omit<Level, 'id'>>): SceneDoc {
  requireEntity(doc.levels, id, 'level');
  const levels = doc.levels.map((l) => (l.id === id ? { ...l, ...patch } : l));
  return checked({ ...doc, levels });
}

export function removeLevel(doc: SceneDoc, id: Id): SceneDoc {
  requireEntity(doc.levels, id, 'level');
  if (doc.levels.length <= 1) {
    throw new SceneOpError('cannot remove the last level');
  }
  const wallIdsOnLevel = new Set(doc.walls.filter((w) => w.levelId === id).map((w) => w.id));

  // Agents whose spawn is on this level are dropped entirely; agents that merely have
  // waypoints/a wander room on this level keep their spawn but lose the references to it.
  const agents: Agent[] = [];
  for (const agent of doc.agents) {
    if (agent.start.levelId === id) continue;
    if (agent.behavior.type === 'route') {
      const waypoints = agent.behavior.waypoints.filter((wp) => wp.levelId !== id);
      agents.push({
        ...agent,
        behavior: { type: 'route', waypoints: waypoints.length > 0 ? waypoints : [{ ...agent.start }], loop: agent.behavior.loop },
      });
    } else if (agent.behavior.type === 'wander' && agent.behavior.levelId === id) {
      // Wander level was removed: fall back to a trivial route at the spawn point.
      agents.push({ ...agent, behavior: { type: 'route', waypoints: [{ ...agent.start }], loop: false } });
    } else {
      // roam has no levelId/roomId of its own (any level, reachable via stairs) — unaffected.
      agents.push(agent);
    }
  }

  const remainingAgentIds = new Set(agents.map((a) => a.id));

  const next: SceneDoc = {
    ...doc,
    levels: doc.levels.filter((l) => l.id !== id),
    walls: doc.walls.filter((w) => w.levelId !== id),
    openings: doc.openings.filter((o) => !wallIdsOnLevel.has(o.wallId)),
    rooms: doc.rooms.filter((r) => r.levelId !== id),
    objects: doc.objects.filter((o) => o.levelId !== id),
    agents,
    radios: doc.radios.filter((r) => r.levelId !== id),
    stairs: doc.stairs.filter((s) => s.fromLevelId !== id && s.toLevelId !== id),
    zones: doc.zones.filter((z) => z.levelId !== id),
    incidents: doc.incidents.filter((i) => remainingAgentIds.has(i.agentId)),
  };
  return checked(next);
}

// ===========================================================================
// Wall
// ===========================================================================

export interface AddWallInput {
  levelId: Id;
  a: Vec2;
  b: Vec2;
  materialId?: Id;
  thickness?: number;
  height?: number;
}

export function addWall(doc: SceneDoc, input: AddWallInput): { doc: SceneDoc; id: Id } {
  const level = requireLevel(doc, input.levelId);
  const id = newId('wall');
  const wall: Wall = {
    id,
    levelId: input.levelId,
    a: [input.a[0], input.a[1]],
    b: [input.b[0], input.b[1]],
    thickness: input.thickness ?? 0.15,
    height: input.height ?? level.height,
    materialId: input.materialId ?? 'brick',
  };
  const next = checked({ ...doc, walls: [...doc.walls, wall] });
  return { doc: next, id };
}

export function updateWall(doc: SceneDoc, id: Id, patch: Partial<Omit<Wall, 'id'>>): SceneDoc {
  requireEntity(doc.walls, id, 'wall');
  const walls = doc.walls.map((w) => (w.id === id ? { ...w, ...patch } : w));
  // validateDoc already re-checks that all openings on this wall still fit (offset/width vs
  // new length, sill/height vs new wall height); checked() below surfaces that as SceneOpError.
  return checked({ ...doc, walls });
}

export function removeWall(doc: SceneDoc, id: Id): SceneDoc {
  requireEntity(doc.walls, id, 'wall');
  const next: SceneDoc = {
    ...doc,
    walls: doc.walls.filter((w) => w.id !== id),
    openings: doc.openings.filter((o) => o.wallId !== id),
  };
  return checked(next);
}

// ===========================================================================
// Opening
// ===========================================================================

export interface AddOpeningInput {
  wallId: Id;
  kind: 'door' | 'window';
  offset: number;
  width?: number;
  sill?: number;
  height?: number;
  materialId?: Id;
  open?: boolean;
}

export const OPENING_DEFAULTS = {
  door: { width: 0.9, sill: 0, height: 2.0, materialId: 'wood-door' },
  window: { width: 1.2, sill: 0.9, height: 1.2, materialId: 'glass' },
} as const;

export function addOpening(doc: SceneDoc, input: AddOpeningInput): { doc: SceneDoc; id: Id } {
  requireWall(doc, input.wallId);
  const defaults = OPENING_DEFAULTS[input.kind];
  const id = newId('opening');
  const opening: Opening = {
    id,
    wallId: input.wallId,
    kind: input.kind,
    offset: input.offset,
    width: input.width ?? defaults.width,
    sill: input.sill ?? defaults.sill,
    height: input.height ?? defaults.height,
    materialId: input.materialId ?? defaults.materialId,
    open: input.open ?? false,
  };
  const next = checked({ ...doc, openings: [...doc.openings, opening] });
  return { doc: next, id };
}

export function updateOpening(doc: SceneDoc, id: Id, patch: Partial<Omit<Opening, 'id'>>): SceneDoc {
  requireEntity(doc.openings, id, 'opening');
  const openings = doc.openings.map((o) => (o.id === id ? { ...o, ...patch } : o));
  return checked({ ...doc, openings });
}

export function toggleOpening(doc: SceneDoc, id: Id): SceneDoc {
  const opening = requireEntity(doc.openings, id, 'opening');
  const openings = doc.openings.map((o) => (o.id === id ? { ...o, open: !opening.open } : o));
  return checked({ ...doc, openings });
}

// ===========================================================================
// Room
// ===========================================================================

export interface AddRoomInput {
  levelId: Id;
  name?: string;
  polygon: Vec2[];
  cameraAllowed?: boolean;
}

export function addRoom(doc: SceneDoc, input: AddRoomInput): { doc: SceneDoc; id: Id } {
  requireLevel(doc, input.levelId);
  const id = newId('room');
  const room: Room = {
    id,
    levelId: input.levelId,
    name: input.name ?? 'ห้องใหม่',
    polygon: input.polygon.map((p): Vec2 => [p[0], p[1]]),
    cameraAllowed: input.cameraAllowed ?? false, // privacy by default
  };
  const next = checked({ ...doc, rooms: [...doc.rooms, room] });
  return { doc: next, id };
}

export function updateRoom(doc: SceneDoc, id: Id, patch: Partial<Omit<Room, 'id'>>): SceneDoc {
  requireEntity(doc.rooms, id, 'room');
  const rooms = doc.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r));
  return checked({ ...doc, rooms });
}

// ===========================================================================
// SceneObject
// ===========================================================================

export interface AddObjectInput {
  levelId: Id;
  name?: string;
  position?: Vec3;
  size?: Vec3;
  rotationY?: number;
  materialId?: Id;
}

export function addObject(doc: SceneDoc, input: AddObjectInput): { doc: SceneDoc; id: Id } {
  requireLevel(doc, input.levelId);
  const id = newId('object');
  const object: SceneObject = {
    id,
    levelId: input.levelId,
    name: input.name ?? 'วัตถุใหม่',
    position: input.position ?? [0, 0, 0],
    size: input.size ?? [1, 0.8, 1],
    rotationY: input.rotationY ?? 0,
    materialId: input.materialId ?? 'wood-furniture',
  };
  const next = checked({ ...doc, objects: [...doc.objects, object] });
  return { doc: next, id };
}

export function updateObject(doc: SceneDoc, id: Id, patch: Partial<Omit<SceneObject, 'id'>>): SceneDoc {
  requireEntity(doc.objects, id, 'object');
  const objects = doc.objects.map((o) => (o.id === id ? { ...o, ...patch } : o));
  return checked({ ...doc, objects });
}

// ===========================================================================
// Agent
// ===========================================================================

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

// ===========================================================================
// Stair
// ===========================================================================

export interface AddStairInput {
  fromLevelId: Id;
  toLevelId: Id;
  bottom: Vec2;
  top: Vec2;
  width?: number;
}

export function addStair(doc: SceneDoc, input: AddStairInput): { doc: SceneDoc; id: Id } {
  requireLevel(doc, input.fromLevelId);
  requireLevel(doc, input.toLevelId);
  const id = newId('stair');
  const stair: Stair = {
    id,
    fromLevelId: input.fromLevelId,
    toLevelId: input.toLevelId,
    bottom: [input.bottom[0], input.bottom[1]],
    top: [input.top[0], input.top[1]],
    width: input.width ?? 1.0,
  };
  const next = checked({ ...doc, stairs: [...doc.stairs, stair] });
  return { doc: next, id };
}

export function updateStair(doc: SceneDoc, id: Id, patch: Partial<Omit<Stair, 'id'>>): SceneDoc {
  requireEntity(doc.stairs, id, 'stair');
  const stairs = doc.stairs.map((s) => (s.id === id ? { ...s, ...patch } : s));
  return checked({ ...doc, stairs });
}

// ===========================================================================
// Zone
// ===========================================================================

export interface AddZoneInput {
  levelId: Id;
  name?: string;
  roomId?: Id;
  polygon?: Vec2[];
  appliesTo?: 'person' | 'pet' | 'any';
  enabled?: boolean;
}

export function addZone(doc: SceneDoc, input: AddZoneInput): { doc: SceneDoc; id: Id } {
  requireLevel(doc, input.levelId);
  const id = newId('zone');
  const zone: Zone = {
    id,
    name: input.name ?? `พื้นที่ ${doc.zones.length + 1}`,
    levelId: input.levelId,
    ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
    polygon: (input.polygon ?? []).map((p): Vec2 => [p[0], p[1]]),
    appliesTo: input.appliesTo ?? 'any',
    enabled: input.enabled ?? true,
  };
  const next = checked({ ...doc, zones: [...doc.zones, zone] });
  return { doc: next, id };
}

export function updateZone(doc: SceneDoc, id: Id, patch: Partial<Omit<Zone, 'id'>>): SceneDoc {
  requireEntity(doc.zones, id, 'zone');
  const zones = doc.zones.map((z) => (z.id === id ? { ...z, ...patch } : z));
  return checked({ ...doc, zones });
}

/**
 * Mark (or unmark) a room as restricted: adds/removes the one room-linked zone for that room
 * (at most one per room, by convention — custom polygon zones from the Zone tool never set
 * `roomId`). `appliesTo` only matters when `on` is true.
 */
export function setRoomRestricted(doc: SceneDoc, roomId: Id, on: boolean, appliesTo: 'person' | 'pet' | 'any' = 'any'): SceneDoc {
  const room = requireEntity(doc.rooms, roomId, 'room');
  const existing = doc.zones.find((z) => z.roomId === roomId);

  if (!on) {
    if (!existing) return doc; // already unrestricted, nothing to do
    return checked({ ...doc, zones: doc.zones.filter((z) => z.id !== existing.id) });
  }

  if (existing) {
    const zones = doc.zones.map((z) => (z.id === existing.id ? { ...z, appliesTo, enabled: true } : z));
    return checked({ ...doc, zones });
  }

  return addZone(doc, { levelId: room.levelId, roomId, name: `${room.name} (ห้ามเข้า)`, appliesTo, enabled: true }).doc;
}

// ===========================================================================
// Incident
// ===========================================================================

export interface AddIncidentInput {
  agentId: Id;
  t: number;
  duration?: number;
}

export function addIncident(doc: SceneDoc, input: AddIncidentInput): { doc: SceneDoc; id: Id } {
  requireEntity(doc.agents, input.agentId, 'agent');
  const id = newId('incident');
  const incident: Incident = {
    id,
    kind: 'fall',
    agentId: input.agentId,
    t: input.t,
    duration: input.duration ?? 180,
  };
  const next = checked({ ...doc, incidents: [...doc.incidents, incident] });
  return { doc: next, id };
}

// ===========================================================================
// Radio
// ===========================================================================

export interface AddRadioInput {
  levelId: Id;
  name?: string;
  role?: 'ap' | 'client' | 'sensor-node';
  position?: Vec3;
  ifaces?: RadioIface[];
  antennaGainDbi?: number;
}

const DEFAULT_AP_IFACES: RadioIface[] = [
  { band: '2.4', channel: 6, txPowerDbm: 20 },
  { band: '5', channel: 36, txPowerDbm: 23 },
];

export function addRadio(doc: SceneDoc, input: AddRadioInput): { doc: SceneDoc; id: Id } {
  requireLevel(doc, input.levelId);
  const id = newId('radio');
  const radio: Radio = {
    id,
    levelId: input.levelId,
    name: input.name ?? 'AP ใหม่',
    role: input.role ?? 'ap',
    position: input.position ?? [0, 2.0, 0],
    ifaces: (input.ifaces ?? DEFAULT_AP_IFACES).map((f) => ({ ...f })),
    antennaGainDbi: input.antennaGainDbi ?? 3,
  };
  const next = checked({ ...doc, radios: [...doc.radios, radio] });
  return { doc: next, id };
}

export function updateRadio(doc: SceneDoc, id: Id, patch: Partial<Omit<Radio, 'id'>>): SceneDoc {
  requireEntity(doc.radios, id, 'radio');
  const radios = doc.radios.map((r) => (r.id === id ? { ...r, ...patch } : r));
  return checked({ ...doc, radios });
}

// ===========================================================================
// Material
// ===========================================================================

export interface AddMaterialInput {
  id?: Id;
  name: string;
  lossDb: Record<'2.4' | '5', number>;
  color: string;
}

export function addMaterial(doc: SceneDoc, input: AddMaterialInput): { doc: SceneDoc; id: Id } {
  const id = input.id ?? newId('material');
  const material: Material = {
    id,
    name: input.name,
    lossDb: { '2.4': input.lossDb['2.4'], '5': input.lossDb['5'] },
    color: input.color,
  };
  const next = checked({ ...doc, materials: [...doc.materials, material] });
  return { doc: next, id };
}

export function updateMaterial(doc: SceneDoc, id: Id, patch: Partial<Omit<Material, 'id'>>): SceneDoc {
  requireEntity(doc.materials, id, 'material');
  const materials = doc.materials.map((m) => (m.id === id ? { ...m, ...patch, lossDb: { ...m.lossDb, ...patch.lossDb } } : m));
  return checked({ ...doc, materials });
}

// ===========================================================================
// Generic removal
// ===========================================================================

/** Remove any entity by id, dispatching to the right cascade-aware remove op. */
export function removeEntity(doc: SceneDoc, id: Id): SceneDoc {
  if (doc.levels.some((l) => l.id === id)) return removeLevel(doc, id);
  if (doc.walls.some((w) => w.id === id)) return removeWall(doc, id);
  if (doc.openings.some((o) => o.id === id)) {
    return checked({ ...doc, openings: doc.openings.filter((o) => o.id !== id) });
  }
  if (doc.rooms.some((r) => r.id === id)) {
    return checked({
      ...doc,
      rooms: doc.rooms.filter((r) => r.id !== id),
      zones: doc.zones.filter((z) => z.roomId !== id),
    });
  }
  if (doc.objects.some((o) => o.id === id)) {
    return checked({ ...doc, objects: doc.objects.filter((o) => o.id !== id) });
  }
  if (doc.agents.some((a) => a.id === id)) {
    return checked({
      ...doc,
      agents: doc.agents.filter((a) => a.id !== id),
      incidents: doc.incidents.filter((i) => i.agentId !== id),
    });
  }
  if (doc.radios.some((r) => r.id === id)) {
    return checked({ ...doc, radios: doc.radios.filter((r) => r.id !== id) });
  }
  if (doc.stairs.some((s) => s.id === id)) {
    return checked({ ...doc, stairs: doc.stairs.filter((s) => s.id !== id) });
  }
  if (doc.zones.some((z) => z.id === id)) {
    return checked({ ...doc, zones: doc.zones.filter((z) => z.id !== id) });
  }
  if (doc.incidents.some((i) => i.id === id)) {
    return checked({ ...doc, incidents: doc.incidents.filter((i) => i.id !== id) });
  }
  if (doc.materials.some((m) => m.id === id)) {
    throw new SceneOpError(`cannot remove material "${id}" via removeEntity; materials are not cascaded`);
  }
  throw new SceneOpError(`entity "${id}" not found`);
}
