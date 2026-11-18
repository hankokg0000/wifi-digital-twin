import type { SceneDoc } from '../../core';

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
  width: number;
  depth: number;
}

/** Footprint of walls and radios (± 0.5 m) across all levels; a sensible default for an empty doc. */
export function houseBounds(doc: SceneDoc): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const w of doc.walls) {
    for (const [x, z] of [w.a, w.b]) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  for (const r of doc.radios) {
    minX = Math.min(minX, r.position[0] - 0.5);
    maxX = Math.max(maxX, r.position[0] + 0.5);
    minZ = Math.min(minZ, r.position[2] - 0.5);
    maxZ = Math.max(maxZ, r.position[2] + 0.5);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 10;
    minZ = 0;
    maxZ = 12;
  }
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ };
}
