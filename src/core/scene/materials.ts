import type { Material } from './types';

// design.md §8 material defaults table (dB per single traversal).
export const DEFAULT_MATERIALS: Material[] = [
  { id: 'drywall', name: 'Drywall', lossDb: { '2.4': 3, '5': 4 }, color: '#d8d2c4' },
  { id: 'wood-door', name: 'Wood door', lossDb: { '2.4': 3, '5': 4 }, color: '#a1662f' },
  { id: 'brick', name: 'Brick', lossDb: { '2.4': 8, '5': 12 }, color: '#b5573c' },
  { id: 'concrete-wall', name: 'Concrete wall 15cm', lossDb: { '2.4': 12, '5': 18 }, color: '#9a9a94' },
  { id: 'concrete-slab', name: 'Concrete slab', lossDb: { '2.4': 18, '5': 25 }, color: '#7d7d78' },
  { id: 'glass', name: 'Glass', lossDb: { '2.4': 2, '5': 3 }, color: '#bfe3ee' },
  { id: 'glass-lowe', name: 'Glass low-E', lossDb: { '2.4': 20, '5': 25 }, color: '#8fc8dc' },
  { id: 'wood-furniture', name: 'Wood furniture', lossDb: { '2.4': 2, '5': 3 }, color: '#c08a4e' },
  { id: 'metal', name: 'Metal', lossDb: { '2.4': 25, '5': 30 }, color: '#9fa6ad' },
  { id: 'human-body', name: 'Human body', lossDb: { '2.4': 4, '5': 6 }, color: '#e8b98c' },
];
