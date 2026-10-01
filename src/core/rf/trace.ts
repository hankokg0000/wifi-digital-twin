// Multi-wall link trace — design.md §8. Pure TS: no DOM, no three.
import type { Agent, Band, Id, Level, Material, Opening, SceneDoc, SceneObject, Vec3, Wall } from '../scene/types';
import type { AgentState } from '../sim/sample';
import { BAND_CENTER_MHZ, MIN_DISTANCE_M, PATH_LOSS_EXPONENT, RSSI_FLOOR_DBM, fsplAt1m } from './bands';
import { materialThai } from './labels';

/** A radio endpoint: `position` is local to `levelId` (y = height above that level's floor). */
export interface RfEndpoint {
  levelId: Id;
  position: Vec3;
}

/** What the tracer needs from a sampled agent. `sampleWorld`'s `WorldAgentState` fits as-is. */
export type RfAgent = Pick<AgentState, 'position' | 'posture'> & { agentId: Id };

export interface Obstruction {
  kind: 'wall' | 'opening' | 'object' | 'agent' | 'slab';
  id: Id;
  /** Thai display name, e.g. "ผนังอิฐ", "ประตูไม้", "คน (สมชาย)". */
  name: string;
  lossDb: number;
}

export interface TraceResult {
  pathLossDb: number;
  /** 3D tx–rx distance, m (unclamped). */
  distance: number;
  /** Everything that costs dB, in no particular order. Open openings (0 dB) are not listed. */
  obstructions: Obstruction[];
  obstructionLossDb: number;
}

/** RSSI at the receiver for one tx interface (rx antenna is 0 dBi). Clamped at the floor. */
export function rssiDbm(txPowerDbm: number, txGainDbi: number, pathLossDb: number): number {
  return Math.max(RSSI_FLOOR_DBM, txPowerDbm + txGainDbi - pathLossDb);
}

// ---------------------------------------------------------------------------------------------
// Per-doc index. Docs are immutable (every edit makes a new object), so cache on identity.
// ---------------------------------------------------------------------------------------------

interface WallRec {
  wall: Wall;
  len: number;
  ex: number;
  ez: number;
  openings: Opening[];
}

interface ObjRec {
  object: SceneObject;
  elevation: number;
  cos: number;
  sin: number;
}

interface LevelRec {
  level: Level;
  walls: WallRec[];
  maxWallH: number;
}

export interface TraceIndex {
  levelById: Map<Id, Level>;
  materialById: Map<Id, Material>;
  levels: LevelRec[];
  objects: ObjRec[];
  agentById: Map<Id, Agent>;
  /** Levels that have another level below them: their floor is a slab a ray can cross. */
  slabLevels: Level[];
}

const indexCache = new WeakMap<SceneDoc, TraceIndex>();

export function traceIndexFor(doc: SceneDoc): TraceIndex {
  const hit = indexCache.get(doc);
  if (hit) return hit;

  const levelById = new Map(doc.levels.map((l) => [l.id, l]));
  const materialById = new Map(doc.materials.map((m) => [m.id, m]));
  const openingsByWall = new Map<Id, Opening[]>();
  for (const o of doc.openings) {
    const list = openingsByWall.get(o.wallId);
    if (list) list.push(o);
    else openingsByWall.set(o.wallId, [o]);
  }
  const levels: LevelRec[] = doc.levels.map((level) => {
    const walls: WallRec[] = doc.walls
      .filter((w) => w.levelId === level.id)
      .map((wall) => {
        const ex = wall.b[0] - wall.a[0];
        const ez = wall.b[1] - wall.a[1];
        return { wall, len: Math.hypot(ex, ez), ex, ez, openings: openingsByWall.get(wall.id) ?? [] };
      });
    return { level, walls, maxWallH: walls.reduce((m, w) => Math.max(m, w.wall.height), 0) };
  });
  const objects: ObjRec[] = doc.objects.map((object) => ({
    object,
    elevation: levelById.get(object.levelId)?.elevation ?? 0,
    cos: Math.cos(object.rotationY),
    sin: Math.sin(object.rotationY),
  }));
  const lowest = doc.levels.reduce((m, l) => Math.min(m, l.elevation), Infinity);
  const slabLevels = doc.levels.filter((l) => l.elevation > lowest);

  const idx: TraceIndex = {
    levelById,
    materialById,
    levels,
    objects,
    agentById: new Map(doc.agents.map((a) => [a.id, a])),
    slabLevels,
  };
  indexCache.set(doc, idx);
  return idx;
}

function lossOf(idx: TraceIndex, materialId: Id, band: Band): { lossDb: number; name: string } {
  const m = idx.materialById.get(materialId);
  return { lossDb: m?.lossDb[band] ?? 0, name: materialThai(m, materialId) };
}

/** Vertical clearance used for a fallen agent (a person lying on the floor). */
const FALLEN_HEIGHT_M = 0.3;
const EPS = 1e-9;
/** Wall crossings closer than this along the ray are one physical crossing (a wall junction). */
const JUNCTION_M = 0.03;

interface Crossing {
  t: number;
  kind: 'wall' | 'opening';
  id: Id;
  name: string;
  lossDb: number;
}

/**
 * Trace one link between two WORLD points [x, y, z] and return its loss budget. `out`, when
 * given, receives the obstruction list (the heatmap passes null and only wants the sum).
 */
export function traceWorld(
  idx: TraceIndex,
  tx: Vec3,
  rx: Vec3,
  band: Band,
  agents: readonly RfAgent[],
  out: Obstruction[] | null,
): TraceResult {
  const [tx0, ty0, tz0] = tx;
  const rdx = rx[0] - tx0;
  const rdy = rx[1] - ty0;
  const rdz = rx[2] - tz0;
  const distance = Math.hypot(rdx, rdy, rdz);
  const yLo = Math.min(ty0, rx[1]);
  const yHi = Math.max(ty0, rx[1]);
  let extra = 0;

  const add = (kind: Obstruction['kind'], id: Id, name: string, lossDb: number) => {
    if (lossDb <= 0) return;
    extra += lossDb;
    out?.push({ kind, id, name, lossDb });
  };

  // --- Walls & openings: 2D segment crossing per level, then a height check at the crossing.
  const crossings: Crossing[] = [];
  for (const lv of idx.levels) {
    const floor = lv.level.elevation;
    if (lv.walls.length === 0 || yHi < floor - EPS || yLo > floor + lv.maxWallH + EPS) continue;
    for (const w of lv.walls) {
      if (w.len < EPS) continue;
      const denom = rdx * w.ez - rdz * w.ex; // cross(r, e)
      if (Math.abs(denom) < EPS) continue; // parallel: no crossing
      const ax = w.wall.a[0] - tx0;
      const az = w.wall.a[1] - tz0;
      const t = (ax * w.ez - az * w.ex) / denom;
      const u = (ax * rdz - az * rdx) / denom;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const h = ty0 + rdy * t - floor; // ray height above this level's floor at the crossing
      if (h < 0 || h > w.wall.height) continue;

      const along = u * w.len;
      let opening: Opening | undefined;
      for (const o of w.openings) {
        if (along >= o.offset && along <= o.offset + o.width && h >= o.sill && h <= o.sill + o.height) {
          opening = o;
          break;
        }
      }
      if (opening) {
        if (opening.open) continue; // gap: no loss, and the wall itself isn't crossed here
        const m = lossOf(idx, opening.materialId, band);
        crossings.push({ t, kind: 'opening', id: opening.id, name: `${opening.kind === 'door' ? 'ประตู' : 'หน้าต่าง'}${m.name}`, lossDb: m.lossDb });
      } else {
        const m = lossOf(idx, w.wall.materialId, band);
        crossings.push({ t, kind: 'wall', id: w.wall.id, name: `ผนัง${m.name}`, lossDb: m.lossDb });
      }
    }
  }
  // A ray through the exact corner/T where walls meet crosses each of them "at once". That is one
  // physical crossing, not two or three: keep only the lossiest of crossings within JUNCTION_M.
  if (crossings.length > 1) {
    crossings.sort((a, b) => a.t - b.t);
    const planar = Math.hypot(rdx, rdz);
    let kept = crossings[0]!;
    for (let i = 1; i < crossings.length; i++) {
      const c = crossings[i]!;
      if ((c.t - kept.t) * planar < JUNCTION_M) {
        if (c.lossDb > kept.lossDb) kept = c;
      } else {
        add(kept.kind, kept.id, kept.name, kept.lossDb);
        kept = c;
      }
    }
    add(kept.kind, kept.id, kept.name, kept.lossDb);
  } else if (crossings.length === 1) {
    const c = crossings[0]!;
    add(c.kind, c.id, c.name, c.lossDb);
  }

  // --- Objects: ray vs rotated-rectangle footprint (slab method in the object's frame) + height.
  for (const o of idx.objects) {
    const [sx, sy, sz] = o.object.size;
    const dx0 = tx0 - o.object.position[0];
    const dz0 = tz0 - o.object.position[2];
    // World offset -> object frame (three.js rotation.y = θ: local x = (cosθ, -sinθ), z = (sinθ, cosθ)).
    const px = dx0 * o.cos - dz0 * o.sin;
    const pz = dx0 * o.sin + dz0 * o.cos;
    const vx = rdx * o.cos - rdz * o.sin;
    const vz = rdx * o.sin + rdz * o.cos;
    let tIn = 0;
    let tOut = 1;
    let hit = true;
    for (const [p, v, half] of [
      [px, vx, sx / 2],
      [pz, vz, sz / 2],
    ] as const) {
      if (Math.abs(v) < EPS) {
        if (Math.abs(p) > half) {
          hit = false;
          break;
        }
        continue;
      }
      let t1 = (-half - p) / v;
      let t2 = (half - p) / v;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tIn = Math.max(tIn, t1);
      tOut = Math.min(tOut, t2);
      if (tIn > tOut) {
        hit = false;
        break;
      }
    }
    if (!hit) continue;
    // The ray must be inside [base, top] somewhere while it is over the footprint.
    const yA = ty0 + rdy * tIn - o.elevation;
    const yB = ty0 + rdy * tOut - o.elevation;
    const base = o.object.position[1];
    if (Math.min(yA, yB) > base + sy || Math.max(yA, yB) < base) continue;
    const m = lossOf(idx, o.object.materialId, band);
    add('object', o.object.id, o.object.name, m.lossDb);
  }

  // --- Agents: ray vs vertical cylinder (circle in XZ at the closest approach + height check).
  const len2 = rdx * rdx + rdz * rdz;
  for (const a of agents) {
    const def = idx.agentById.get(a.agentId);
    if (!def) continue;
    const cx = a.position[0] - tx0;
    const cz = a.position[2] - tz0;
    const t = len2 < EPS ? 0 : Math.min(1, Math.max(0, (cx * rdx + cz * rdz) / len2));
    const ex = cx - rdx * t;
    const ez = cz - rdz * t;
    if (ex * ex + ez * ez > def.radius * def.radius) continue;
    const y = ty0 + rdy * t;
    const floor = a.position[1];
    const top = floor + (a.posture === 'fallen' ? FALLEN_HEIGHT_M : def.height);
    if (y < floor - 0.05 || y > top) continue;
    const m = lossOf(idx, def.materialId, band);
    add('agent', def.id, `${def.kind === 'person' ? 'คน' : 'สัตว์เลี้ยง'} (${def.name})`, m.lossDb);
  }

  // --- Slabs: each level floor strictly between the two endpoints' elevations.
  for (const level of idx.slabLevels) {
    if (yLo < level.elevation && yHi > level.elevation) {
      const m = lossOf(idx, level.slabMaterialId, band);
      add('slab', level.id, `พื้น${m.name}`, m.lossDb);
    }
  }

  const pathLossDb =
    fsplAt1m(BAND_CENTER_MHZ[band]) + 10 * PATH_LOSS_EXPONENT * Math.log10(Math.max(distance, MIN_DISTANCE_M)) + extra;
  return { pathLossDb, distance, obstructions: out ?? [], obstructionLossDb: extra };
}

/**
 * Loss budget of the straight 3D link `tx` → `rx` on `band`. Positions are local to their level.
 * RSSI is left to the caller (it depends on which interface transmits): see `rssiDbm`.
 *
 * Cross-level links are approximated as one straight ray: walls of every level whose vertical
 * span the ray passes through are tested at the ray's true height, plus one slab loss per level
 * floor in between. No stair voids, no diffraction (design.md §8, §11).
 */
export function traceLink(
  doc: SceneDoc,
  tx: RfEndpoint,
  rx: RfEndpoint,
  band: Band,
  agents: readonly RfAgent[] = [],
): TraceResult {
  const idx = traceIndexFor(doc);
  const elev = (id: Id) => idx.levelById.get(id)?.elevation ?? 0;
  return traceWorld(
    idx,
    [tx.position[0], elev(tx.levelId) + tx.position[1], tx.position[2]],
    [rx.position[0], elev(rx.levelId) + rx.position[1], rx.position[2]],
    band,
    agents,
    [],
  );
}
