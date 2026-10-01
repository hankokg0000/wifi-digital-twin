import type { SceneDoc, Id, Stair, Vec2 } from '../types';
import { newId } from '../ids';
import { checked, requireEntity, requireLevel } from './shared';

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
