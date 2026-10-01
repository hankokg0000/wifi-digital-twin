import type { SceneState } from '../store';
import type { ToolContext } from './types';

/** Build a ToolContext for the active level from a store snapshot (used by keyboard handling). */
export function toolContextFromStore(s: SceneState): ToolContext {
  return {
    doc: s.doc,
    levelId: s.activeLevelId,
    walls: s.doc.walls.filter((w) => w.levelId === s.activeLevelId),
    selection: s.selection,
    draft: s.draft,
    apply: s.apply,
    applyOp: s.applyOp,
    setDraft: s.setDraft,
    setSelection: s.setSelection,
  };
}
