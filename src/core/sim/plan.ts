// Event-based agent trajectories — design.md §7.1. Builds a list of segments once per doc
// (not per tick), so sampling any t later is O(log segments) instead of O(t).
import type { SceneDoc, Id, Vec2, Agent, Stair, Room, Zone } from '../scene/types';
import { dist, pointInPolygon, polygonArea } from '../scene/geometry';
import { getNavGrid, getZoneAvoidingNavGrid, isFree, worldToCell } from './navgrid';
import { findPath } from './pathfind';
import { rngFor } from './rng';
import { activeSegmentIndex, sampleAgent } from './sample';

export type Segment =
  | { kind: 'idle'; t0: number; t1: number; levelId: Id; p: Vec2 }
  | { kind: 'walk'; t0: number; t1: number; levelId: Id; path: Vec2[] } // constant speed along polyline
  | { kind: 'stair'; t0: number; t1: number; stairId: Id; up: boolean }
  // A fall incident: the agent lies at `p` from t0 to t1, then the plan resumes its behavior.
  | { kind: 'fallen'; t0: number; t1: number; levelId: Id; p: Vec2 };

export interface AgentPlan {
  segments: Segment[];
  warnings: string[];
}

const DEFAULT_HORIZON = 3600; // s, 1 h — design.md §7.1
const MAX_LOOP_PASSES = 500; // guards against pathological docs where nothing is ever reachable
const ROAM_MAX_TRIES = 10; // per brief: unreachable room → try another, up to this many times

interface WalkState {
  t: number;
  levelId: Id;
  p: Vec2;
}

function polylineLength(path: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += dist(path[i - 1]!, path[i]!);
  return len;
}

/** Arc-length-truncate a polyline to the point at fraction `frac` (0..1) of its total length —
 * used to cut a `walk` segment exactly at a fall so speed stays constant right up to the fall. */
function truncatePath(path: Vec2[], frac: number): Vec2[] {
  if (path.length <= 1) return path.length === 1 ? [path[0]!] : [];
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = dist(path[i - 1]!, path[i]!);
    segLens.push(d);
    total += d;
  }
  const out: Vec2[] = [path[0]!];
  if (total < 1e-9) return out;
  let target = Math.min(Math.max(frac, 0), 1) * total;
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i]!;
    if (target <= len || i === segLens.length - 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const t = len > 1e-9 ? Math.min(Math.max(target / len, 0), 1) : 0;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      return out;
    }
    out.push(path[i + 1]!);
    target -= len;
  }
  return out;
}

/** BFS over `doc.stairs` for the shortest chain of stairs connecting two levels (one hop is
 * enough for a typical two-storey house; chaining works for more levels too). */
function findStairChain(doc: SceneDoc, fromLevelId: Id, toLevelId: Id): { stair: Stair; up: boolean }[] | null {
  if (fromLevelId === toLevelId) return [];
  const visited = new Set<Id>([fromLevelId]);
  const queue: { levelId: Id; chain: { stair: Stair; up: boolean }[] }[] = [{ levelId: fromLevelId, chain: [] }];
  while (queue.length > 0) {
    const { levelId, chain } = queue.shift()!;
    for (const stair of doc.stairs) {
      let nextLevel: Id | null = null;
      let up = false;
      if (stair.fromLevelId === levelId) {
        nextLevel = stair.toLevelId;
        up = true;
      } else if (stair.toLevelId === levelId) {
        nextLevel = stair.fromLevelId;
        up = false;
      }
      if (nextLevel === null || visited.has(nextLevel)) continue;
      const nextChain = [...chain, { stair, up }];
      if (nextLevel === toLevelId) return nextChain;
      visited.add(nextLevel);
      queue.push({ levelId: nextLevel, chain: nextChain });
    }
  }
  return null;
}

/** Walk from `cur` to `targetP` on the SAME level, pushing a `walk` segment if any distance is
 * covered. Returns the state actually reached (equal to the target only if a path was found). */
function walkOnLevel(
  doc: SceneDoc,
  agent: Agent,
  cur: WalkState,
  targetP: Vec2,
  segments: Segment[],
  warn: (msg: string) => void,
): WalkState {
  if (dist(cur.p, targetP) < 1e-6) return cur;
  // Route around restricted zones unless this leg starts or ends inside one (a trespass).
  const trespassing =
    isRestrictedFor(doc, agent, cur.levelId, cur.p) || isRestrictedFor(doc, agent, cur.levelId, targetP);
  const path = trespassing
    ? findPath(getNavGrid(doc, cur.levelId, agent.radius, agent.kind), cur.p, targetP)
    : findPath(getZoneAvoidingNavGrid(doc, cur.levelId, agent.radius, agent.kind), cur.p, targetP);
  if (!path && !trespassing && findPath(getNavGrid(doc, cur.levelId, agent.radius, agent.kind), cur.p, targetP)) {
    // Only reachable by cutting through a restricted zone: a law-abiding agent skips this target
    // (the caller picks another). Not a planning error, so no warning.
    return cur;
  }
  if (!path) {
    warn(`agent "${agent.name}" (${agent.id}): unreachable point [${targetP[0]}, ${targetP[1]}] on level "${cur.levelId}"`);
    return cur;
  }
  const length = polylineLength(path);
  if (length < 1e-6) return cur;
  const duration = length / agent.speed;
  segments.push({ kind: 'walk', t0: cur.t, t1: cur.t + duration, levelId: cur.levelId, path });
  return { t: cur.t + duration, levelId: cur.levelId, p: targetP };
}

/** Walk to a point that may be on a different level, chaining through stairs (BFS-found) as
 * needed. Pushes `walk`/`stair` segments; stops (with a warning) at the first unreachable leg. */
function walkTo(
  doc: SceneDoc,
  agent: Agent,
  cur: WalkState,
  target: { levelId: Id; p: Vec2 },
  segments: Segment[],
  warn: (msg: string) => void,
): WalkState {
  if (cur.levelId === target.levelId) {
    return walkOnLevel(doc, agent, cur, target.p, segments, warn);
  }

  const chain = findStairChain(doc, cur.levelId, target.levelId);
  if (!chain) {
    warn(`agent "${agent.name}" (${agent.id}): no stair route from level "${cur.levelId}" to "${target.levelId}"`);
    return cur;
  }

  let state = cur;
  for (const { stair, up } of chain) {
    const landing = up ? stair.bottom : stair.top;
    state = walkOnLevel(doc, agent, state, landing, segments, warn);
    if (dist(state.p, landing) > 1e-6) return state; // couldn't even reach the stair — stop the chain

    const otherLevelId = up ? stair.toLevelId : stair.fromLevelId;
    const otherLanding = up ? stair.top : stair.bottom;
    const fromLevel = doc.levels.find((l) => l.id === stair.fromLevelId);
    const toLevel = doc.levels.find((l) => l.id === stair.toLevelId);
    const dElev = Math.abs((toLevel?.elevation ?? 0) - (fromLevel?.elevation ?? 0));
    const dist3D = Math.hypot(dist(stair.bottom, stair.top), dElev);
    const duration = dist3D / (agent.speed * 0.6);
    segments.push({ kind: 'stair', t0: state.t, t1: state.t + duration, stairId: stair.id, up });
    state = { t: state.t + duration, levelId: otherLevelId, p: otherLanding };
  }

  return walkOnLevel(doc, agent, state, target.p, segments, warn);
}

/** Rejection-sample a free point inside a room's polygon, using the room's own navgrid so the
 * chosen point is actually walkable (not on furniture, not inside a wall). */
/**
 * Chance that a random target may land in a zone restricted for this agent. Most people (and
 * pets) keep out of restricted areas; the occasional violation is what the alerts demo needs.
 */
const RESTRICTED_VISIT_CHANCE = 0.1;

function zoneAppliesTo(zone: Zone, kind: Agent['kind']): boolean {
  return zone.appliesTo === 'any' || zone.appliesTo === kind;
}

/** True when `p` on `levelId` is inside an enabled zone that restricts this agent's kind. */
function isRestrictedFor(doc: SceneDoc, agent: Agent, levelId: Id, p: Vec2): boolean {
  return doc.zones.some((zone) => {
    if (!zone.enabled || zone.levelId !== levelId || !zoneAppliesTo(zone, agent.kind)) return false;
    const poly = zone.roomId ? doc.rooms.find((r) => r.id === zone.roomId)?.polygon : zone.polygon;
    return !!poly && poly.length >= 3 && pointInPolygon(p, poly);
  });
}

function pickRandomFreePoint(doc: SceneDoc, roomId: Id, agent: Agent, rng: () => number): Vec2 | null {
  const room = doc.rooms.find((r) => r.id === roomId);
  if (!room || room.polygon.length < 3) return null;
  const grid = getNavGrid(doc, room.levelId, agent.radius, agent.kind);

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

  const mayTrespass = rng() < RESTRICTED_VISIT_CHANCE;
  for (let attempt = 0; attempt < 200; attempt++) {
    const p: Vec2 = [minX + rng() * (maxX - minX), minZ + rng() * (maxZ - minZ)];
    if (!pointInPolygon(p, room.polygon)) continue;
    if (!mayTrespass && isRestrictedFor(doc, agent, room.levelId, p)) continue;
    const [col, row] = worldToCell(grid, p);
    if (isFree(grid, col, row)) return p;
  }
  return null;
}

/** Rejection-sample a free point anywhere on a level (wander without a roomId). */
function pickRandomFreePointOnLevel(doc: SceneDoc, levelId: Id, agent: Agent, rng: () => number): Vec2 | null {
  const grid = getNavGrid(doc, levelId, agent.radius, agent.kind);
  const maxX = grid.minX + grid.cols * grid.cell;
  const maxZ = grid.minZ + grid.rows * grid.cell;
  // Indoors only: the grid has a margin around the house that is walkable but outside it.
  const rooms = doc.rooms.filter((r) => r.levelId === levelId);
  // Occasionally the agent deliberately heads INTO a restricted zone (the violation alerts catch);
  // otherwise it keeps out of them.
  const trespass = rng() < RESTRICTED_VISIT_CHANCE;
  for (let attempt = 0; attempt < 200; attempt++) {
    const p: Vec2 = [grid.minX + rng() * (maxX - grid.minX), grid.minZ + rng() * (maxZ - grid.minZ)];
    if (rooms.length > 0 && !rooms.some((r) => pointInPolygon(p, r.polygon))) continue;
    if (isRestrictedFor(doc, agent, levelId, p) !== trespass && attempt < 150) continue;
    const [col, row] = worldToCell(grid, p);
    if (isFree(grid, col, row)) return p;
  }
  return null;
}

/** Pick a room from ANY level, weighted by sqrt(area) so small rooms (bathrooms) still get
 * visited but large ones (living rooms) get picked more often — used by `roam`. Rooms
 * restricted for this agent are down-weighted by RESTRICTED_VISIT_CHANCE. */
function pickRandomRoomWeighted(doc: SceneDoc, agent: Agent, rng: () => number): Room | null {
  if (doc.rooms.length === 0) return null;
  const weights = doc.rooms.map((r) => {
    const w = Math.sqrt(Math.max(Math.abs(polygonArea(r.polygon)), 1e-6));
    const restricted = doc.zones.some((z) => z.enabled && z.roomId === r.id && zoneAppliesTo(z, agent.kind));
    return restricted ? w * RESTRICTED_VISIT_CHANCE : w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return doc.rooms[Math.floor(rng() * doc.rooms.length)] ?? null;
  let x = rng() * total;
  for (let i = 0; i < doc.rooms.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return doc.rooms[i]!;
  }
  return doc.rooms[doc.rooms.length - 1]!;
}

/**
 * Truncate whichever segment covers `incident.t`, insert a `fallen` segment there, and return
 * the state the agent's behavior should resume from once it recovers. Mutates `segments` in
 * place (drops everything from the covering segment onward, then re-appends the truncated
 * version + the fall). Position/level at the fall moment come from `sampleAgent` on the
 * (not-yet-mutated) segments, so this works uniformly for idle/walk/stair/an-earlier-fall.
 */
function applyFall(doc: SceneDoc, segments: Segment[], incident: { t: number; duration: number }, warn: (msg: string) => void): WalkState {
  if (segments.length === 0) {
    warn(`incident at t=${incident.t}: agent has no segments yet`);
    return { t: incident.t + incident.duration, levelId: doc.levels[0]?.id ?? '', p: [0, 0] };
  }
  const idx = activeSegmentIndex(segments, incident.t);
  const seg = segments[idx]!;
  const sampled = sampleAgent(doc, segments, incident.t);
  const fallP: Vec2 = [sampled.position[0], sampled.position[2]];
  const fallLevelId = sampled.levelId;
  const cutT1 = Math.max(incident.t, seg.t0);

  let truncated: Segment;
  if (seg.kind === 'idle' || seg.kind === 'fallen') {
    truncated = { kind: 'idle', t0: seg.t0, t1: cutT1, levelId: seg.levelId, p: seg.p };
  } else if (seg.kind === 'walk') {
    const frac = (cutT1 - seg.t0) / Math.max(seg.t1 - seg.t0, 1e-9);
    truncated = { kind: 'walk', t0: seg.t0, t1: cutT1, levelId: seg.levelId, path: truncatePath(seg.path, frac) };
  } else {
    // stair — approximate the pre-fall stretch as a straight walk from the stair's start landing
    // to the interpolated fall point; height is ignored for this short stretch (posture/rendering
    // only care about the eventual `fallen` segment's floor position).
    const stair = doc.stairs.find((s) => s.id === seg.stairId);
    const startPoint = stair ? (seg.up ? stair.bottom : stair.top) : fallP;
    truncated = { kind: 'walk', t0: seg.t0, t1: cutT1, levelId: fallLevelId, path: [startPoint, fallP] };
  }

  segments.length = idx;
  segments.push(truncated);
  segments.push({ kind: 'fallen', t0: incident.t, t1: incident.t + incident.duration, levelId: fallLevelId, p: fallP });
  return { t: incident.t + incident.duration, levelId: fallLevelId, p: fallP };
}

/** Plan one agent's full trajectory out to `horizonSeconds`. Deterministic: same doc.seed +
 * agent.id + agent data always produces the same segments. Fall incidents (from `doc.incidents`)
 * cut into whichever segment is active at their time and the behavior resumes afterward. */
export function planAgent(doc: SceneDoc, agent: Agent, horizonSeconds: number = DEFAULT_HORIZON): AgentPlan {
  const segments: Segment[] = [];
  const warningSet = new Set<string>();
  const warn = (msg: string) => warningSet.add(msg);

  let state: WalkState = { t: 0, levelId: agent.start.levelId, p: agent.start.p };
  segments.push({ kind: 'idle', t0: state.t, t1: state.t + agent.start.dwell, levelId: state.levelId, p: state.p });
  state = { ...state, t: state.t + agent.start.dwell };

  const rng = agent.behavior.type === 'route' ? null : rngFor(doc.seed, agent.id);

  // Route behavior needs a cursor that survives across chunk boundaries (see below) so a fall
  // mid-route doesn't restart the agent at waypoint 0.
  let routeWpIndex = 0;

  /** Extend `segments`/`state` up to `localHorizon` (a bound <= horizonSeconds), driving
   * whichever behavior this agent has. Safe to call multiple times in increasing localHorizon —
   * each call resumes exactly where the previous one left off (via the closured `state`,
   * `routeWpIndex`, and `rng`). */
  function runChunk(localHorizon: number) {
    if (agent.behavior.type === 'route') {
      const { waypoints, loop } = agent.behavior;
      if (waypoints.length === 0) return;
      let guard = 0;
      while (state.t < localHorizon && guard++ < MAX_LOOP_PASSES * waypoints.length) {
        const wp = waypoints[routeWpIndex]!;
        const tBefore = state.t;
        const next = walkTo(doc, agent, state, { levelId: wp.levelId, p: wp.p }, segments, warn);
        const reached = next.levelId === wp.levelId && dist(next.p, wp.p) < 1e-6;
        state = next;
        if (reached) {
          segments.push({ kind: 'idle', t0: state.t, t1: state.t + wp.dwell, levelId: state.levelId, p: state.p });
          state = { ...state, t: state.t + wp.dwell };
        }
        routeWpIndex++;
        if (routeWpIndex >= waypoints.length) {
          if (!loop) break;
          routeWpIndex = 0;
        }
        if (!reached && state.t === tBefore) break; // stuck — nothing moved at all this leg
      }
    } else if (agent.behavior.type === 'wander') {
      const { levelId, roomId, pauseMin, pauseMax } = agent.behavior;
      while (state.t < localHorizon) {
        const tBefore = state.t;
        const target = roomId
          ? pickRandomFreePoint(doc, roomId, agent, rng!)
          : pickRandomFreePointOnLevel(doc, levelId, agent, rng!);
        if (!target) {
          warn(`agent "${agent.name}" (${agent.id}): could not find a free point to wander to`);
          break;
        }
        state = walkTo(doc, agent, state, { levelId, p: target }, segments, warn);
        const pause = pauseMin + rng!() * (pauseMax - pauseMin);
        segments.push({ kind: 'idle', t0: state.t, t1: state.t + pause, levelId: state.levelId, p: state.p });
        state = { ...state, t: state.t + pause };
        if (state.t === tBefore) break;
      }
    } else {
      // roam: random room on any level (weighted by sqrt(area)), reachable via stairs.
      const { dwellMin, dwellMax } = agent.behavior;
      while (state.t < localHorizon) {
        const tBefore = state.t;
        let reached = false;
        for (let tries = 0; tries < ROAM_MAX_TRIES && !reached; tries++) {
          const room = pickRandomRoomWeighted(doc, agent, rng!);
          if (!room) {
            warn(`agent "${agent.name}" (${agent.id}): no rooms to roam to`);
            break;
          }
          const target = pickRandomFreePoint(doc, room.id, agent, rng!);
          if (!target) continue;
          const next = walkTo(doc, agent, state, { levelId: room.levelId, p: target }, segments, warn);
          reached = next.levelId === room.levelId && dist(next.p, target) < 1e-6;
          state = next;
        }
        if (!reached) {
          segments.push({ kind: 'idle', t0: state.t, t1: state.t + 10, levelId: state.levelId, p: state.p });
          state = { ...state, t: state.t + 10 };
        } else {
          const dwell = dwellMin + rng!() * (dwellMax - dwellMin);
          segments.push({ kind: 'idle', t0: state.t, t1: state.t + dwell, levelId: state.levelId, p: state.p });
          state = { ...state, t: state.t + dwell };
        }
        if (state.t === tBefore) break;
      }
    }
  }

  const incidents = doc.incidents
    .filter((i) => i.agentId === agent.id && i.t >= 0 && i.t <= horizonSeconds)
    .sort((a, b) => a.t - b.t);

  for (const incident of incidents) {
    if (incident.t > state.t) runChunk(Math.min(incident.t, horizonSeconds));
    state = applyFall(doc, segments, incident, warn);
  }
  if (state.t < horizonSeconds) runChunk(horizonSeconds);

  return { segments, warnings: [...warningSet] };
}
