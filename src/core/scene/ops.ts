import type {
  SceneDoc,
  Id,
  Level,
  Wall,
  Opening,
  Room,
  SceneObject,
  Agent,
  Radio,
  RadioIface,
  Material,
  ValidationIssue,
  Vec2,
  Vec3,
} from './types';
import { newId } from './ids';
import { validateDoc } from './validate';

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
  const next: SceneDoc = {
    ...doc,
    levels: doc.levels.filter((l) => l.id !== id),
    walls: doc.walls.filter((w) => w.levelId !== id),
    openings: doc.openings.filter((o) => !wallIdsOnLevel.has(o.wallId)),
    rooms: doc.rooms.filter((r) => r.levelId !== id),
    objects: doc.objects.filter((o) => o.levelId !== id),
    agents: doc.agents.filter((a) => a.levelId !== id),
    radios: doc.radios.filter((r) => r.levelId !== id),
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

export interface AddAgentInput {
  levelId: Id;
  kind?: 'person' | 'pet';
  radius?: number;
  height?: number;
  path?: { t: number; p: Vec2 }[];
  materialId?: Id;
}

export function addAgent(doc: SceneDoc, input: AddAgentInput): { doc: SceneDoc; id: Id } {
  requireLevel(doc, input.levelId);
  const id = newId('agent');
  const agent: Agent = {
    id,
    levelId: input.levelId,
    kind: input.kind ?? 'person',
    radius: input.radius ?? 0.2,
    height: input.height ?? 1.7,
    path: (input.path ?? [{ t: 0, p: [0, 0] }]).map((wp) => ({ t: wp.t, p: [wp.p[0], wp.p[1]] as Vec2 })),
    materialId: input.materialId ?? 'human-body',
  };
  const next = checked({ ...doc, agents: [...doc.agents, agent] });
  return { doc: next, id };
}

export function updateAgent(doc: SceneDoc, id: Id, patch: Partial<Omit<Agent, 'id'>>): SceneDoc {
  requireEntity(doc.agents, id, 'agent');
  const agents = doc.agents.map((a) => (a.id === id ? { ...a, ...patch } : a));
  return checked({ ...doc, agents });
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
    return checked({ ...doc, rooms: doc.rooms.filter((r) => r.id !== id) });
  }
  if (doc.objects.some((o) => o.id === id)) {
    return checked({ ...doc, objects: doc.objects.filter((o) => o.id !== id) });
  }
  if (doc.agents.some((a) => a.id === id)) {
    return checked({ ...doc, agents: doc.agents.filter((a) => a.id !== id) });
  }
  if (doc.radios.some((r) => r.id === id)) {
    return checked({ ...doc, radios: doc.radios.filter((r) => r.id !== id) });
  }
  if (doc.materials.some((m) => m.id === id)) {
    throw new SceneOpError(`cannot remove material "${id}" via removeEntity; materials are not cascaded`);
  }
  throw new SceneOpError(`entity "${id}" not found`);
}
