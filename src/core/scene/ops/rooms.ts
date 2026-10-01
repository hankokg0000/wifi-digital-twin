import type { SceneDoc, Id, Room, Vec2 } from '../types';
import { newId } from '../ids';
import { checked, requireEntity, requireLevel } from './shared';

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
