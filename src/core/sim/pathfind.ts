// A* pathfinding over a NavGrid, then string-pulled into a short world-space polyline —
// design.md §7.1.
import type { Vec2 } from '../scene/types';
import { dist } from '../scene/geometry';
import { type NavGrid, isFree, worldToCell, cellToWorld, nearestFree } from './navgrid';

const SNAP_RADIUS = 1.0; // m — brief: snap start/goal to nearest free cell within 1 m

const NEIGHBORS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

function heuristic(ac: number, ar: number, bc: number, br: number): number {
  const dc = Math.abs(ac - bc);
  const dr = Math.abs(ar - br);
  // octile distance — admissible for 8-connected grids with unit/√2 costs.
  return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
}

/** Straight-line-of-sight test between two world points: true if no grid cell it crosses is
 * blocked (sampled at half-cell resolution along the segment). */
function lineOfSight(grid: NavGrid, a: Vec2, b: Vec2): boolean {
  const d = dist(a, b);
  if (d < 1e-9) return true;
  const steps = Math.max(1, Math.ceil(d / (grid.cell / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const [col, row] = worldToCell(grid, p);
    if (!isFree(grid, col, row)) return false;
  }
  return true;
}

/** Greedy string-pull: from each kept point, skip ahead to the farthest point still visible. */
function simplify(grid: NavGrid, path: Vec2[]): Vec2[] {
  if (path.length <= 2) return path;
  const out: Vec2[] = [path[0]!];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !lineOfSight(grid, path[i]!, path[j]!)) j--;
    out.push(path[j]!);
    i = j;
  }
  return out;
}

/** A* (8-connected, no corner cutting) from `start` to `goal` (world coords). Returns a
 * simplified world-space polyline, or null if unreachable. */
export function findPath(grid: NavGrid, start: Vec2, goal: Vec2): Vec2[] | null {
  const snappedStart = nearestFree(grid, start, SNAP_RADIUS);
  const snappedGoal = nearestFree(grid, goal, SNAP_RADIUS);
  if (!snappedStart || !snappedGoal) return null;

  const [sc, sr] = worldToCell(grid, snappedStart);
  const [gc, gr] = worldToCell(grid, snappedGoal);
  if (sc === gc && sr === gr) {
    return simplify(grid, [start, goal]);
  }

  const cols = grid.cols;
  const key = (c: number, r: number) => r * cols + c;
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const open = new Map<number, number>(); // key -> fScore
  gScore.set(key(sc, sr), 0);
  open.set(key(sc, sr), heuristic(sc, sr, gc, gr));

  const closed = new Set<number>();

  while (open.size > 0) {
    let curKey = -1;
    let bestF = Infinity;
    for (const [k, f] of open) {
      if (f < bestF) {
        bestF = f;
        curKey = k;
      }
    }
    open.delete(curKey);
    if (closed.has(curKey)) continue;
    closed.add(curKey);

    const cc = curKey % cols;
    const cr = (curKey - cc) / cols;
    if (cc === gc && cr === gr) break;

    const curG = gScore.get(curKey)!;
    for (const [dc, dr, cost] of NEIGHBORS) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (!isFree(grid, nc, nr)) continue;
      if (dc !== 0 && dr !== 0) {
        // no corner cutting: both orthogonal neighbors of a diagonal move must be free too
        if (!isFree(grid, cc + dc, cr) || !isFree(grid, cc, cr + dr)) continue;
      }
      const nk = key(nc, nr);
      if (closed.has(nk)) continue;
      const tentativeG = curG + cost;
      if (tentativeG < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentativeG);
        cameFrom.set(nk, curKey);
        open.set(nk, tentativeG + heuristic(nc, nr, gc, gr));
      }
    }
  }

  const goalKey = key(gc, gr);
  if (!gScore.has(goalKey)) return null;

  const cellPath: Vec2[] = [];
  let cur: number | undefined = goalKey;
  while (cur !== undefined) {
    const c = cur % cols;
    const r = (cur - c) / cols;
    cellPath.push(cellToWorld(grid, c, r));
    cur = cameFrom.get(cur);
  }
  cellPath.reverse();

  const full = [start, ...cellPath, goal];
  return simplify(grid, full);
}
