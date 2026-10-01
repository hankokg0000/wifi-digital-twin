import type { SceneDoc, Id, SceneObject, Vec3 } from '../types';
import { newId } from '../ids';
import { checked, requireEntity, requireLevel } from './shared';

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
