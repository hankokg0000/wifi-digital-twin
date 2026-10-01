import type { Material } from '../scene/types';

/** Thai noun for the default materials, used to name obstructions ("ผนังอิฐ", "พื้นคอนกรีต"). */
const MATERIAL_TH: Record<string, string> = {
  drywall: 'ยิปซัม',
  'wood-door': 'ไม้',
  brick: 'อิฐ',
  'concrete-wall': 'คอนกรีต',
  'concrete-slab': 'คอนกรีต',
  glass: 'กระจก',
  'glass-lowe': 'กระจก Low-E',
  'wood-furniture': 'ไม้',
  metal: 'โลหะ',
  'human-body': 'ร่างกาย',
};

/** Thai name for a material; falls back to the doc's own (user-editable) name for custom ones. */
export function materialThai(m: Pick<Material, 'id' | 'name'> | undefined, fallbackId: string): string {
  if (!m) return fallbackId;
  return MATERIAL_TH[m.id] ?? m.name;
}
