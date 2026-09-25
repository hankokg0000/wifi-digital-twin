// Data model — design.md §7. Keep these types in exact sync with the doc.

export type Id = string;
export type Vec2 = [x: number, z: number];
export type Vec3 = [x: number, y: number, z: number];
export type Band = '2.4' | '5';

export interface Material {
  id: Id;
  name: string;
  lossDb: Record<Band, number>; // penetration loss per single traversal
  color: string; // for rendering
}

export interface Level {
  id: Id;
  name: string;
  elevation: number; // m, floor of this level
  height: number; // m, floor to ceiling
  slabMaterialId: Id; // floor/ceiling between levels
}

export interface Wall {
  id: Id;
  levelId: Id;
  a: Vec2;
  b: Vec2;
  thickness: number;
  height: number;
  materialId: Id;
}

export interface Opening {
  id: Id;
  wallId: Id;
  kind: 'door' | 'window';
  offset: number; // m from point a along the wall
  width: number;
  sill: number; // m from floor (door = 0)
  height: number;
  materialId: Id; // when closed
  open: boolean; // when open = no loss
}

export interface Room {
  id: Id;
  levelId: Id;
  name: string;
  polygon: Vec2[];
  cameraAllowed: boolean; // privacy: bedrooms/bathrooms = false
}

export interface SceneObject {
  id: Id;
  levelId: Id;
  name: string;
  position: Vec3; // center of base (local to level)
  size: Vec3;
  rotationY: number;
  materialId: Id;
}

export interface Waypoint {
  levelId: Id;
  p: Vec2;
  dwell: number; // seconds to idle at arrival
}

export type AgentBehavior =
  | { type: 'route'; waypoints: Waypoint[]; loop: boolean }
  // roomId undefined = wander anywhere on the level (not restricted to one room).
  | { type: 'wander'; levelId: Id; roomId?: Id; pauseMin: number; pauseMax: number }
  // person: random rooms on any level (uses stairs); the UI's population generator authors this.
  | { type: 'roam'; dwellMin: number; dwellMax: number };

export interface Agent {
  id: Id;
  name: string;
  kind: 'person' | 'pet';
  color: string; // render color
  radius: number; // person 0.2, pet 0.15
  height: number; // person 1.7, pet 0.35
  speed: number; // m/s — person 1.2, pet 0.8
  materialId: Id; // 'human-body' (pets too for now)
  start: Waypoint; // spawn location at t = 0 (levelId + p; dwell = initial idle seconds)
  behavior: AgentBehavior;
}

export interface Zone {
  id: Id;
  name: string;
  levelId: Id;
  roomId?: Id; // if set, the polygon follows that room's polygon (ignore `polygon`)
  polygon: Vec2[]; // used when roomId is undefined
  appliesTo: 'person' | 'pet' | 'any';
  enabled: boolean;
}

export interface Incident {
  id: Id;
  kind: 'fall';
  agentId: Id;
  t: number; // s, when it happens
  duration: number; // s the agent lies down for
}

export interface PopulationSettings {
  people: number;
  pets: number;
  fallsPerHour: number;
}

export interface Stair {
  id: Id;
  fromLevelId: Id; // lower level
  toLevelId: Id; // upper level
  bottom: Vec2; // landing point on the lower level floor
  top: Vec2; // landing point on the upper level floor
  width: number; // m, ~1.0
}

export interface RadioIface {
  band: Band;
  channel: number;
  txPowerDbm: number; // typical home AP ~= 20
}

export interface Radio {
  id: Id;
  levelId: Id;
  name: string;
  role: 'ap' | 'client' | 'sensor-node';
  position: Vec3; // local to level
  ifaces: RadioIface[]; // dual-band router = 2 ifaces
  antennaGainDbi: number;
}

export interface SceneDoc {
  version: 1;
  seed: number; // deterministic simulation seed, default 1
  materials: Material[];
  levels: Level[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  objects: SceneObject[];
  agents: Agent[];
  radios: Radio[];
  stairs: Stair[];
  zones: Zone[];
  incidents: Incident[];
  population: PopulationSettings;
}

export type EntityKind =
  | 'level'
  | 'wall'
  | 'opening'
  | 'room'
  | 'object'
  | 'agent'
  | 'radio'
  | 'material'
  | 'stair'
  | 'zone';

export interface ValidationIssue {
  path: string;
  message: string;
}
