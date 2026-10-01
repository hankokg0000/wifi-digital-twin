import type { SceneDoc, Wall, Vec2, Id } from '../../core';
import type { Draft, SceneState } from '../store';

/** What a tool handler can see and do: the active level's data plus the store actions it needs. */
export interface ToolContext {
  doc: SceneDoc;
  levelId: Id;
  /** Walls on `levelId` (used for snapping and opening placement). */
  walls: Wall[];
  selection: Id | null;
  draft: Draft;
  apply: SceneState['apply'];
  applyOp: SceneState['applyOp'];
  setDraft: SceneState['setDraft'];
  setSelection: SceneState['setSelection'];
}

export interface ToolHandler {
  /** Pointer moved over the level plane; returns the hover point to preview (null = none). */
  onMove?(ctx: ToolContext, p: Vec2): Vec2 | null;
  /** Plane clicked at `p` (raw, unsnapped). */
  onClick?(ctx: ToolContext, p: Vec2): void;
  /** Tool-specific key; return true when the key was consumed (stops further global handling). */
  onKey?(ctx: ToolContext, e: KeyboardEvent): boolean;
  /** Whether hovering shows the grid/endpoint snap indicator. */
  snapIndicator?: boolean;
}
