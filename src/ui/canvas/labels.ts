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
