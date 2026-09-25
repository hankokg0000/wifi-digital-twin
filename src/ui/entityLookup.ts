import type { SceneDoc, Id, EntityKind } from '../core';

export type FoundEntity =
  | { kind: 'level'; index: number }
  | { kind: 'wall'; index: number }
  | { kind: 'opening'; index: number }
  | { kind: 'room'; index: number }
  | { kind: 'object'; index: number }
  | { kind: 'agent'; index: number }
  | { kind: 'radio'; index: number }
  | { kind: 'material'; index: number }
  | { kind: 'stair'; index: number }
  | { kind: 'zone'; index: number }
  | null;

/** Find which collection an id belongs to and its index, or null if not found. */
export function findEntity(doc: SceneDoc, id: Id): FoundEntity {
  let i = doc.levels.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'level', index: i };
  i = doc.walls.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'wall', index: i };
  i = doc.openings.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'opening', index: i };
  i = doc.rooms.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'room', index: i };
  i = doc.objects.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'object', index: i };
  i = doc.agents.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'agent', index: i };
  i = doc.radios.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'radio', index: i };
  i = doc.materials.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'material', index: i };
  i = doc.stairs.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'stair', index: i };
  i = doc.zones.findIndex((x) => x.id === id);
  if (i >= 0) return { kind: 'zone', index: i };
  return null;
}

export const KIND_LABEL: Record<EntityKind, string> = {
  level: 'Level',
  wall: 'Wall',
  opening: 'Opening',
  room: 'Room',
  object: 'Object',
  agent: 'Agent',
  radio: 'Radio',
  material: 'Material',
  stair: 'Stair',
  zone: 'Zone',
};
