/**
 * Module-level registry of DOM label elements keyed by a stable id, each with the world
 * position it should be projected to. Populated by <LabelsOverlay> (main React root, plain
 * DOM) and consumed every frame by <LabelProjector> (inside <Canvas>) to position the labels
 * over the 3D scene without drei's per-label DOM-root helper, which could crash R3F's
 * reconciler when it unmounted mid-commit.
 */

export interface LabelEntry {
  el: HTMLElement;
  world: [number, number, number];
  /** Collision priority: higher wins a contested spot (fallen/alert agent 4 > agent 3 > monitored
   * room / radio 2 > room 1). */
  priority: number;
  /** Measured box size in px (0 = not measured yet), cached by <LabelProjector>. */
  w: number;
  h: number;
  /** Vertical CSS margin offset of the box relative to its anchor (e.g. the agent pill's -26px). */
  my: number;
  /** Whether the `label-collided` class is currently applied. */
  collided: boolean;
}

const registry = new Map<string, LabelEntry>();

export function registerLabel(id: string, el: HTMLElement, world: [number, number, number], priority = 1) {
  registry.set(id, { el, world, priority, w: 0, h: 0, my: 0, collided: el.classList.contains('label-collided') });
}

/** Change an already-registered label's collision priority (no re-render). */
export function setLabelPriority(id: string, priority: number) {
  const entry = registry.get(id);
  if (entry) entry.priority = priority;
}

export interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelCandidate {
  id: string;
  rect: LabelRect;
  priority: number;
}

/**
 * Greedy label de-cluttering. Candidates are placed in priority order (highest first, ties broken
 * by id so the outcome is stable frame to frame); any candidate whose rect — grown by `padding`
 * px on every side — intersects an already-placed one is returned in the "hide" set.
 * With padding 0, touching edges do not count as an overlap.
 */
export function resolveLabelOverlaps(items: readonly LabelCandidate[], padding = 4): Set<string> {
  const hide = new Set<string>();
  const order = [...items].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: LabelRect[] = [];
  for (const item of order) {
    const r = item.rect;
    const hits = placed.some(
      (p) =>
        r.x - padding < p.x + p.w &&
        r.x + r.w + padding > p.x &&
        r.y - padding < p.y + p.h &&
        r.y + r.h + padding > p.y,
    );
    if (hits) hide.add(item.id);
    else placed.push(r);
  }
  return hide;
}

export function unregisterLabel(id: string) {
  registry.delete(id);
}

export function labelEntries(): IterableIterator<[string, LabelEntry]> {
  return registry.entries();
}

/**
 * Update an already-registered label's world position without re-registering it (no React
 * state, no re-render) — used for agent name labels, which move every simulation frame.
 */
export function updateLabelWorld(id: string, world: [number, number, number]) {
  const entry = registry.get(id);
  if (entry) entry.world = world;
}

/** Show/hide an already-registered label directly, independent of its on-screen projection
 * (LabelProjector already hides labels that project off-screen via `visibility`; this uses
 * `display` so the two don't fight). */
export function setLabelHidden(id: string, hidden: boolean) {
  const entry = registry.get(id);
  if (entry) entry.el.style.display = hidden ? 'none' : '';
}

/** Toggle a CSS class on an already-registered label — used for per-frame state (e.g. a fallen
 * agent's name turning red) that shouldn't go through React. */
export function toggleLabelClass(id: string, className: string, on: boolean) {
  const entry = registry.get(id);
  if (entry) entry.el.classList.toggle(className, on);
}
