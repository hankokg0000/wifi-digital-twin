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
}

const registry = new Map<string, LabelEntry>();

export function registerLabel(id: string, el: HTMLElement, world: [number, number, number]) {
  registry.set(id, { el, world });
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
