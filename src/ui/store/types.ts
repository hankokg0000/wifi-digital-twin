import type { SceneDoc, Id, Vec2 } from '../../core';

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'room' | 'object' | 'ap' | 'zone';
export type ViewMode = 'plan' | '3d';
export type SimSpeed = 1 | 5 | 20 | 60;

export interface SimState {
  t: number;
  playing: boolean;
  speed: SimSpeed;
}

export type Draft =
  | { kind: 'wall-chain'; points: Vec2[] }
  | { kind: 'room-polygon'; points: Vec2[] }
  | { kind: 'zone-polygon'; points: Vec2[] }
  | null;

export interface DocSlice {
  doc: SceneDoc;
  past: SceneDoc[];
  future: SceneDoc[];

  apply: (fn: (d: SceneDoc) => SceneDoc) => void;
  /** Like `apply`, but for creation ops that return {doc, id}; auto-selects the new entity. */
  applyOp: (fn: (d: SceneDoc) => { doc: SceneDoc; id: Id }) => Id | null;
  loadDoc: (d: SceneDoc) => void;
  newDoc: () => void;
  loadSample: () => void;
  openJsonText: (text: string) => { ok: true } | { ok: false; issues: { path: string; message: string }[] };

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export interface ViewSlice {
  selection: Id | null;
  activeLevelId: Id;
  tool: Tool;
  viewMode: ViewMode;
  draft: Draft;
  lastError: string | null;
  /**
   * True while a scene-object/radio drag is in progress. MapControls' left button is pan and
   * OrbitControls' left button is rotate, both of which would otherwise fight a left-drag on a
   * selected entity; the canvas controls are disabled while this is true.
   */
  cameraLocked: boolean;

  setSelection: (id: Id | null) => void;
  setActiveLevelId: (id: Id) => void;
  setTool: (t: Tool) => void;
  setViewMode: (v: ViewMode) => void;
  setDraft: (d: Draft) => void;
  clearDraft: () => void;
  dismissError: () => void;
  setCameraLocked: (locked: boolean) => void;
}

export interface SimSlice {
  /**
   * Simulation playback state. Deliberately NOT part of `doc` (not undo-tracked, not
   * autosaved) — it's a view over the deterministic plan, not editable document state.
   */
  sim: SimState;

  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (speed: SimSpeed) => void;
  setTime: (t: number) => void;
  resetTime: () => void;
}

export type SceneState = DocSlice & ViewSlice & SimSlice;
