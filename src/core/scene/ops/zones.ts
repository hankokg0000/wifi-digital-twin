import type { SceneDoc, Id, Zone, Vec2 } from '../types';
import { newId } from '../ids';
import { checked, requireEntity, requireLevel } from './shared';

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
