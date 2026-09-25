// Per-level occupancy grid for agent pathfinding — design.md §7.1.
import type { SceneDoc, Id, Vec2 } from '../scene/types';
import { pointInPolygon, projectPointOnWall } from '../scene/geometry';

const CELL = 0.2; // m
const MARGIN = 1.0; // m, added around the level's content bounding box

export interface NavGrid {
  levelId: Id;
  cell: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  /** rows * cols, row-major, 1 = blocked, 0 = free. */
  blocked: Uint8Array;
}

function colOf(grid: NavGrid, x: number): number {
  return Math.floor((x - grid.minX) / grid.cell);
}
function rowOf(grid: NavGrid, z: number): number {
  return Math.floor((z - grid.minZ) / grid.cell);
}
function inBounds(grid: NavGrid, col: number, row: number): boolean {
  return col >= 0 && col < grid.cols && row >= 0 && row < grid.rows;
}
function cellCenter(grid: NavGrid, col: number, row: number): Vec2 {
  return [grid.minX + (col + 0.5) * grid.cell, grid.minZ + (row + 0.5) * grid.cell];
}

export function isFree(grid: NavGrid, col: number, row: number): boolean {
  if (!inBounds(grid, col, row)) return false;
  return grid.blocked[row * grid.cols + col] === 0;
}

export function worldToCell(grid: NavGrid, p: Vec2): [number, number] {
  return [colOf(grid, p[0]), rowOf(grid, p[1])];
}

export function cellToWorld(grid: NavGrid, col: number, row: number): Vec2 {
  return cellCenter(grid, col, row);
}

/** Nearest free cell to `p`, searching outward ring by ring up to `maxDist` meters. Returns
 * the cell's world-space center, or null if nothing free is found within range. */
export function nearestFree(grid: NavGrid, p: Vec2, maxDist: number): Vec2 | null {
  const [c0, r0] = worldToCell(grid, p);
  if (isFree(grid, c0, r0)) return cellCenter(grid, c0, r0);
  const maxRing = Math.ceil(maxDist / grid.cell);
  let found = false;
  let bestCol = 0;
  let bestRow = 0;
  let bestD2 = Infinity;
  for (let ring = 1; ring <= maxRing; ring++) {
    for (let dc = -ring; dc <= ring; dc++) {
      for (let dr = -ring; dr <= ring; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue; // only the ring's perimeter
        const col = c0 + dc;
        const row = r0 + dr;
        if (!isFree(grid, col, row)) continue;
        const center = cellCenter(grid, col, row);
        const d2 = (center[0] - p[0]) ** 2 + (center[1] - p[1]) ** 2;
        if (d2 <= maxDist * maxDist && d2 < bestD2) {
          bestD2 = d2;
          bestCol = col;
          bestRow = row;
          found = true;
        }
      }
    }
    if (found) break; // this ring is already the closest possible; no need to search further out
  }
  return found ? cellCenter(grid, bestCol, bestRow) : null;
}

function boxCorners(cx: number, cz: number, sx: number, sz: number, rotationY: number): Vec2[] {
  const hx = sx / 2;
  const hz = sz / 2;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const local: Vec2[] = [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ];
  return local.map(([lx, lz]): Vec2 => [cx + lx * cos - lz * sin, cz + lx * sin + lz * cos]);
}

/** Point-in-rotated-rectangle test via inverse rotation into the box's local frame. */
function pointInBox(p: Vec2, cx: number, cz: number, sx: number, sz: number, rotationY: number): boolean {
  const cos = Math.cos(-rotationY);
  const sin = Math.sin(-rotationY);
  const dx = p[0] - cx;
  const dz = p[1] - cz;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= sx / 2 && Math.abs(lz) <= sz / 2;
}

/**
 * Build (uncached) the occupancy grid for one level. Blocked = cells within
 * (wall.thickness/2 + agentRadius) of a wall segment, except across door openings (any door,
 * open or closed — people open doors); windows are treated as solid wall. Objects taller than
 * 0.3 m block too (both kinds — people step over rugs, not sofas; pets are blocked the same).
 */
export function buildNavGrid(doc: SceneDoc, levelId: Id, radius: number, _kind: 'person' | 'pet'): NavGrid {
  const walls = doc.walls.filter((w) => w.levelId === levelId);
  const wallIds = new Set(walls.map((w) => w.id));
  const rooms = doc.rooms.filter((r) => r.levelId === levelId);
  const objects = doc.objects.filter((o) => o.levelId === levelId && o.size[1] > 0.3);

  const doorsByWall = new Map<Id, { offset: number; width: number }[]>();
  for (const o of doc.openings) {
    if (o.kind !== 'door' || !wallIds.has(o.wallId)) continue;
    const list = doorsByWall.get(o.wallId) ?? [];
    list.push({ offset: o.offset, width: o.width });
    doorsByWall.set(o.wallId, list);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const grow = (x: number, z: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (const w of walls) {
    grow(w.a[0], w.a[1]);
    grow(w.b[0], w.b[1]);
  }
  for (const r of rooms) {
    for (const p of r.polygon) grow(p[0], p[1]);
  }
  for (const o of doc.objects.filter((o) => o.levelId === levelId)) {
    for (const [x, z] of boxCorners(o.position[0], o.position[2], o.size[0], o.size[2], o.rotationY)) grow(x, z);
  }
  if (!Number.isFinite(minX)) {
    // Nothing on this level yet — a minimal grid keeps callers from dividing by zero.
    minX = -1;
    maxX = 1;
    minZ = -1;
    maxZ = 1;
  }
  minX -= MARGIN;
  minZ -= MARGIN;
  maxX += MARGIN;
  maxZ += MARGIN;

  const cols = Math.max(1, Math.ceil((maxX - minX) / CELL));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / CELL));
  const grid: NavGrid = { levelId, cell: CELL, minX, minZ, cols, rows, blocked: new Uint8Array(cols * rows) };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const center = cellCenter(grid, col, row);
      let blocked = false;

      for (const w of walls) {
        const blockDist = w.thickness / 2 + radius;
        const { offset, distance } = projectPointOnWall(w, center);
        if (distance > blockDist) continue;
        const doors = doorsByWall.get(w.id) ?? [];
        const throughDoor = doors.some((d) => offset >= d.offset - 1e-9 && offset <= d.offset + d.width + 1e-9);
        if (throughDoor) continue;
        blocked = true;
        break;
      }

      if (!blocked) {
        for (const o of objects) {
          if (pointInBox(center, o.position[0], o.position[2], o.size[0], o.size[2], o.rotationY)) {
            blocked = true;
            break;
          }
        }
      }

      grid.blocked[row * cols + col] = blocked ? 1 : 0;
    }
  }

  return grid;
}

const cache = new WeakMap<SceneDoc, Map<string, NavGrid>>();

/** Cached per (doc, levelId, radius, kind) — a fresh `doc` reference (any edit) always misses. */
export function getNavGrid(doc: SceneDoc, levelId: Id, radius: number, kind: 'person' | 'pet'): NavGrid {
  let perDoc = cache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    cache.set(doc, perDoc);
  }
  const key = `${levelId}:${radius}:${kind}`;
  let grid = perDoc.get(key);
  if (!grid) {
    grid = buildNavGrid(doc, levelId, radius, kind);
    perDoc.set(key, grid);
  }
  return grid;
}

const avoidCache = new WeakMap<SceneDoc, Map<string, NavGrid>>();

/**
 * Like getNavGrid, but cells inside enabled zones that restrict `kind` are also blocked, so
 * law-abiding agents route around restricted areas instead of cutting through them.
 */
export function getZoneAvoidingNavGrid(doc: SceneDoc, levelId: Id, radius: number, kind: 'person' | 'pet'): NavGrid {
  let perDoc = avoidCache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    avoidCache.set(doc, perDoc);
  }
  const key = `${levelId}:${radius}:${kind}`;
  let grid = perDoc.get(key);
  if (!grid) {
    const base = getNavGrid(doc, levelId, radius, kind);
    const polys = doc.zones
      .filter((z) => z.enabled && z.levelId === levelId && (z.appliesTo === 'any' || z.appliesTo === kind))
      .map((z) => (z.roomId ? doc.rooms.find((r) => r.id === z.roomId)?.polygon : z.polygon))
      .filter((poly): poly is Vec2[] => !!poly && poly.length >= 3);
    const blocked = base.blocked.slice();
    if (polys.length > 0) {
      for (let row = 0; row < base.rows; row++) {
        for (let col = 0; col < base.cols; col++) {
          const c: Vec2 = [base.minX + (col + 0.5) * base.cell, base.minZ + (row + 0.5) * base.cell];
          if (polys.some((poly) => pointInPolygon(c, poly))) blocked[row * base.cols + col] = 1;
        }
      }
    }
    grid = { ...base, blocked };
    perDoc.set(key, grid);
  }
  return grid;
}
