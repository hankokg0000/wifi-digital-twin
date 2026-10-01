import type { SceneDoc, Id, Wall, Opening, Vec2 } from '../types';
import { newId } from '../ids';
import { checked, requireEntity, requireLevel, requireWall } from './shared';

// ===========================================================================
// Wall
// ===========================================================================

export interface AddWallInput {
  levelId: Id;
  a: Vec2;
  b: Vec2;
  materialId?: Id;
  thickness?: number;
  height?: number;
}

export function addWall(doc: SceneDoc, input: AddWallInput): { doc: SceneDoc; id: Id } {
  const level = requireLevel(doc, input.levelId);
  const id = newId('wall');
  const wall: Wall = {
    id,
    levelId: input.levelId,
    a: [input.a[0], input.a[1]],
    b: [input.b[0], input.b[1]],
    thickness: input.thickness ?? 0.15,
    height: input.height ?? level.height,
    materialId: input.materialId ?? 'brick',
  };
  const next = checked({ ...doc, walls: [...doc.walls, wall] });
  return { doc: next, id };
}

export function updateWall(doc: SceneDoc, id: Id, patch: Partial<Omit<Wall, 'id'>>): SceneDoc {
  requireEntity(doc.walls, id, 'wall');
  const walls = doc.walls.map((w) => (w.id === id ? { ...w, ...patch } : w));
  // validateDoc already re-checks that all openings on this wall still fit (offset/width vs
  // new length, sill/height vs new wall height); checked() below surfaces that as SceneOpError.
  return checked({ ...doc, walls });
}

export function removeWall(doc: SceneDoc, id: Id): SceneDoc {
  requireEntity(doc.walls, id, 'wall');
  const next: SceneDoc = {
    ...doc,
    walls: doc.walls.filter((w) => w.id !== id),
    openings: doc.openings.filter((o) => o.wallId !== id),
  };
  return checked(next);
}

// ===========================================================================
// Opening
// ===========================================================================

export interface AddOpeningInput {
  wallId: Id;
  kind: 'door' | 'window';
  offset: number;
  width?: number;
  sill?: number;
  height?: number;
  materialId?: Id;
  open?: boolean;
}

export const OPENING_DEFAULTS = {
  door: { width: 0.9, sill: 0, height: 2.0, materialId: 'wood-door' },
  window: { width: 1.2, sill: 0.9, height: 1.2, materialId: 'glass' },
} as const;

export function addOpening(doc: SceneDoc, input: AddOpeningInput): { doc: SceneDoc; id: Id } {
  requireWall(doc, input.wallId);
  const defaults = OPENING_DEFAULTS[input.kind];
  const id = newId('opening');
  const opening: Opening = {
    id,
    wallId: input.wallId,
    kind: input.kind,
    offset: input.offset,
    width: input.width ?? defaults.width,
    sill: input.sill ?? defaults.sill,
    height: input.height ?? defaults.height,
    materialId: input.materialId ?? defaults.materialId,
    open: input.open ?? false,
  };
  const next = checked({ ...doc, openings: [...doc.openings, opening] });
  return { doc: next, id };
}

export function updateOpening(doc: SceneDoc, id: Id, patch: Partial<Omit<Opening, 'id'>>): SceneDoc {
  requireEntity(doc.openings, id, 'opening');
  const openings = doc.openings.map((o) => (o.id === id ? { ...o, ...patch } : o));
  return checked({ ...doc, openings });
}

export function toggleOpening(doc: SceneDoc, id: Id): SceneDoc {
  const opening = requireEntity(doc.openings, id, 'opening');
  const openings = doc.openings.map((o) => (o.id === id ? { ...o, open: !opening.open } : o));
  return checked({ ...doc, openings });
}
