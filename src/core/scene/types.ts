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

export interface Agent {
  id: Id;
  levelId: Id;
  kind: 'person' | 'pet';
  radius: number; // person ~= 0.2
  height: number; // person ~= 1.7
  path: { t: number; p: Vec2 }[]; // waypoints over time, loop
  materialId: Id; // 'human-body'
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
  materials: Material[];
  levels: Level[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  objects: SceneObject[];
  agents: Agent[];
  radios: Radio[];
}

export type EntityKind =
  | 'level'
  | 'wall'
  | 'opening'
  | 'room'
  | 'object'
  | 'agent'
  | 'radio'
  | 'material';

export interface ValidationIssue {
  path: string;
  message: string;
}
