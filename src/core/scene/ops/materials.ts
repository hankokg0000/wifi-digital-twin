import type { SceneDoc, Id, Material } from '../types';
import { newId } from '../ids';
import { checked, requireEntity } from './shared';

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
