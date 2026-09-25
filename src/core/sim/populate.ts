// Random population generator — design.md §7.1. Pure and deterministic: the same doc (layout) +
// settings + seed always produces the same agents/incidents, so "สุ่มใหม่" is reproducible from
// its seed alone. Replaces ALL existing agents and incidents; leaves everything else (zones
// included) untouched.
import type { SceneDoc, PopulationSettings, Agent, Incident, Room, Id, Vec2 } from '../scene/types';
import { pointInPolygon } from '../scene/geometry';
import { mulberry32 } from './rng';
import { getNavGrid, isFree, worldToCell } from './navgrid';

// Same horizon the planner uses (design.md §7.1) — falls are scheduled across the whole thing.
const HORIZON_SECONDS = 3600;
const MIN_FALL_SPACING = 300; // s, minimum gap between two falls for the same person

const PERSON_NAMES = [
  'สมชาย', 'สมศรี', 'มานี', 'ปิติ', 'ชูใจ', 'วีระ', 'ดวงใจ', 'ประเสริฐ', 'เก่ง', 'มาลี', 'สมหญิง', 'อรุณ',
];
// Deliberately avoids '#5ac8fa' (the app's selection-highlight accent) — see ops.ts AGENT_DEFAULTS.
const PERSON_COLORS = [
  '#4a90d9', '#e0699a', '#4caf50', '#f5a623', '#9b59b6', '#16a596',
  '#d0021b', '#7f8c9a', '#c9a227', '#2f8fd0', '#e67e22', '#5d4a9c',
];
const PET_COLORS = ['#ff9a3c', '#8d6e63'];

function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Deterministic, sequential id — populate() can't use `newId()` (crypto.randomUUID is not
 * reproducible), and doesn't need to: these prefixes never collide with editor-authored ids. */
function seqId(prefix: string, i: number): Id {
  return `${prefix}_${i.toString(36)}`;
}

/** Rejection-sample a free point anywhere on a level (not restricted to one room). */
function randomFreePointOnLevel(doc: SceneDoc, levelId: Id, radius: number, kind: 'person' | 'pet', rng: () => number): Vec2 | null {
  const grid = getNavGrid(doc, levelId, radius, kind);
  const maxX = grid.minX + grid.cols * grid.cell;
  const maxZ = grid.minZ + grid.rows * grid.cell;
  // Indoors only: the grid has a margin around the house that is walkable but outside it.
  const rooms = doc.rooms.filter((r) => r.levelId === levelId);
  for (let attempt = 0; attempt < 200; attempt++) {
    const p: Vec2 = [randRange(rng, grid.minX, maxX), randRange(rng, grid.minZ, maxZ)];
    if (rooms.length > 0 && !rooms.some((r) => pointInPolygon(p, r.polygon))) continue;
    const [col, row] = worldToCell(grid, p);
    if (isFree(grid, col, row)) return p;
  }
  return null;
}

/** Rejection-sample a free point inside one room's polygon. */
function randomFreePointInRoom(doc: SceneDoc, room: Room, radius: number, kind: 'person' | 'pet', rng: () => number): Vec2 | null {
  const grid = getNavGrid(doc, room.levelId, radius, kind);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of room.polygon) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const p: Vec2 = [randRange(rng, minX, maxX), randRange(rng, minZ, maxZ)];
    if (!pointInPolygon(p, room.polygon)) continue;
    const [col, row] = worldToCell(grid, p);
    if (isFree(grid, col, row)) return p;
  }
  return null;
}

/** Poisson process over [0, horizon): exponential inter-arrival times, dropping any candidate
 * closer than `MIN_FALL_SPACING` to the previous accepted one. */
function generateFallTimes(rng: () => number, ratePerHour: number, horizon: number): number[] {
  if (!(ratePerHour > 0)) return [];
  const ratePerSecond = ratePerHour / 3600;
  const times: number[] = [];
  let t = 0;
  while (true) {
    const gap = -Math.log(1 - rng()) / ratePerSecond;
    t += gap;
    if (t >= horizon) break;
    const prev = times[times.length - 1];
    if (prev === undefined || t - prev >= MIN_FALL_SPACING) times.push(t);
  }
  return times;
}

/**
 * Replace every agent and incident in `doc` with a freshly-generated population: `settings.people`
 * people (random room spawn, `roam` behavior across the whole house) and `settings.pets` pets
 * (spawn on the ground level, `wander` the whole level), plus Poisson-scheduled fall incidents
 * per person at `settings.fallsPerHour`. Stores `settings` and `seed` on the returned doc.
 */
export function populate(doc: SceneDoc, settings: PopulationSettings, seed: number): SceneDoc {
  const rng = mulberry32(seed >>> 0);
  const groundLevel = doc.levels.reduce<SceneDoc['levels'][number] | null>(
    (lowest, l) => (lowest === null || l.elevation < lowest.elevation ? l : lowest),
    null,
  );
  const groundLevelId = groundLevel?.id ?? doc.levels[0]?.id ?? '';

  const agents: Agent[] = [];

  for (let i = 0; i < settings.people; i++) {
    const room = doc.rooms.length > 0 ? doc.rooms[Math.floor(rng() * doc.rooms.length)]! : null;
    const levelId = room?.levelId ?? groundLevelId;
    const p = room ? (randomFreePointInRoom(doc, room, 0.2, 'person', rng) ?? [0, 0]) : ([0, 0] as Vec2);
    agents.push({
      id: seqId('agent_p', i),
      name: PERSON_NAMES[i % PERSON_NAMES.length]!,
      kind: 'person',
      color: PERSON_COLORS[i % PERSON_COLORS.length]!,
      radius: 0.2,
      height: randRange(rng, 1.5, 1.8),
      speed: randRange(rng, 1.0, 1.4),
      materialId: 'human-body',
      start: { levelId, p, dwell: randRange(rng, 0, 30) },
      behavior: { type: 'roam', dwellMin: 15, dwellMax: 120 },
    });
  }

  let catCount = 0;
  let dogCount = 0;
  for (let i = 0; i < settings.pets; i++) {
    const isCat = i % 2 === 0;
    const name = isCat ? `แมว ${++catCount}` : `หมา ${++dogCount}`;
    const p = randomFreePointOnLevel(doc, groundLevelId, 0.15, 'pet', rng) ?? ([0, 0] as Vec2);
    agents.push({
      id: seqId('agent_c', i),
      name,
      kind: 'pet',
      color: PET_COLORS[i % PET_COLORS.length]!,
      radius: 0.15,
      height: 0.35,
      speed: 0.8,
      materialId: 'human-body',
      start: { levelId: groundLevelId, p, dwell: randRange(rng, 0, 30) },
      behavior: { type: 'wander', levelId: groundLevelId, pauseMin: 5, pauseMax: 40 },
    });
  }

  const incidents: Incident[] = [];
  let incidentCounter = 0;
  for (const person of agents.filter((a) => a.kind === 'person')) {
    for (const t of generateFallTimes(rng, settings.fallsPerHour, HORIZON_SECONDS)) {
      incidents.push({
        id: seqId('incident', incidentCounter++),
        kind: 'fall',
        agentId: person.id,
        t,
        duration: randRange(rng, 90, 300),
      });
    }
  }

  return { ...doc, agents, incidents, population: { ...settings }, seed };
}
