import { create } from 'zustand';
import type { SceneDoc, Id, Vec2 } from '../core';
import { sampleHouse, createEmptyDoc, SceneOpError, SceneParseError, serialize, parse } from '../core';
import { findEntity } from './entityLookup';
import { SIM_HORIZON_SECONDS, simClockRef } from './simClock';

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

const HISTORY_CAP = 100;
const STORAGE_KEY = 'wifi-digital-twin:scene-doc';
const AUTOSAVE_DEBOUNCE_MS = 500;

function loadInitialDoc(): SceneDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return parse(raw);
    }
  } catch {
    // fall through to sample house
  }
  return sampleHouse();
}

/**
 * Keep view state pointing at things that exist after the doc changes (e.g. the active
 * level was deleted, or undo removed the selected entity).
 */
function reconcileView(
  doc: SceneDoc,
  view: { activeLevelId: Id; selection: Id | null; draft: Draft },
): { activeLevelId: Id; selection: Id | null; draft: Draft } {
  const levelOk = doc.levels.some((l) => l.id === view.activeLevelId);
  return {
    activeLevelId: levelOk ? view.activeLevelId : (doc.levels[0]?.id ?? ''),
    selection: view.selection !== null && findEntity(doc, view.selection) ? view.selection : null,
    draft: levelOk ? view.draft : null,
  };
}

interface SceneState {
  doc: SceneDoc;
  past: SceneDoc[];
  future: SceneDoc[];
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

  /**
   * Simulation playback state. Deliberately NOT part of `doc` (not undo-tracked, not
   * autosaved) — it's a view over the deterministic plan, not editable document state.
   */
  sim: SimState;

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

  setSelection: (id: Id | null) => void;
  setActiveLevelId: (id: Id) => void;
  setTool: (t: Tool) => void;
  setViewMode: (v: ViewMode) => void;
  setDraft: (d: Draft) => void;
  clearDraft: () => void;
  dismissError: () => void;
  setCameraLocked: (locked: boolean) => void;

  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (speed: SimSpeed) => void;
  setTime: (t: number) => void;
  resetTime: () => void;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutosave(doc: SceneDoc) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serialize(doc));
    } catch {
      // ignore quota / privacy-mode errors
    }
  }, AUTOSAVE_DEBOUNCE_MS);
}

const initialDoc = loadInitialDoc();

export const useSceneStore = create<SceneState>((set, get) => ({
  doc: initialDoc,
  past: [],
  future: [],
  selection: null,
  activeLevelId: initialDoc.levels[0]?.id ?? '',
  tool: 'select',
  viewMode: 'plan',
  draft: null,
  lastError: null,
  cameraLocked: false,
  sim: { t: 0, playing: false, speed: 1 },

  apply: (fn) => {
    const { doc, past } = get();
    try {
      const next = fn(doc);
      const nextPast = [...past, doc].slice(-HISTORY_CAP);
      set({ doc: next, past: nextPast, future: [], ...reconcileView(next, get()) });
      scheduleAutosave(next);
    } catch (e) {
      if (e instanceof SceneOpError) {
        set({ lastError: e.message });
      } else {
        set({ lastError: e instanceof Error ? e.message : String(e) });
      }
    }
  },

  applyOp: (fn) => {
    const { doc, past } = get();
    try {
      const { doc: next, id } = fn(doc);
      const nextPast = [...past, doc].slice(-HISTORY_CAP);
      set({ doc: next, past: nextPast, future: [], ...reconcileView(next, { ...get(), selection: id }) });
      scheduleAutosave(next);
      return id;
    } catch (e) {
      if (e instanceof SceneOpError) {
        set({ lastError: e.message });
      } else {
        set({ lastError: e instanceof Error ? e.message : String(e) });
      }
      return null;
    }
  },

  loadDoc: (d) => {
    set({
      doc: d,
      past: [],
      future: [],
      selection: null,
      activeLevelId: d.levels[0]?.id ?? '',
      draft: null,
    });
    scheduleAutosave(d);
  },

  newDoc: () => {
    get().loadDoc(createEmptyDoc());
  },

  loadSample: () => {
    get().loadDoc(sampleHouse());
  },

  openJsonText: (text) => {
    try {
      const d = parse(text);
      get().loadDoc(d);
      return { ok: true };
    } catch (e) {
      if (e instanceof SceneParseError) {
        set({ lastError: e.message });
        return { ok: false, issues: e.issues };
      }
      const message = e instanceof Error ? e.message : String(e);
      set({ lastError: message });
      return { ok: false, issues: [{ path: '$', message }] };
    }
  },

  undo: () => {
    const { past, doc, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    set({
      doc: prev,
      past: past.slice(0, -1),
      future: [doc, ...future].slice(0, HISTORY_CAP),
      ...reconcileView(prev, get()),
    });
    scheduleAutosave(prev);
  },

  redo: () => {
    const { future, doc, past } = get();
    if (future.length === 0) return;
    const next = future[0]!;
    set({
      doc: next,
      future: future.slice(1),
      past: [...past, doc].slice(-HISTORY_CAP),
      ...reconcileView(next, get()),
    });
    scheduleAutosave(next);
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  setSelection: (id) => set({ selection: id }),
  setActiveLevelId: (id) => set({ activeLevelId: id, selection: null, draft: null }),
  setTool: (t) => set({ tool: t, draft: null }),
  setViewMode: (v) => set({ viewMode: v }),
  setDraft: (d) => set({ draft: d }),
  clearDraft: () => set({ draft: null }),
  dismissError: () => set({ lastError: null }),
  setCameraLocked: (locked) => set({ cameraLocked: locked }),

  // --- Simulation playback: plain `set`s, never `apply`/`applyOp` — not undo-tracked, not
  // autosaved. `simClockRef.t` (read every frame by SimClock/AgentsLayer, outside React) is
  // kept in lockstep here so scrubbing/reset take effect immediately, not on the next frame.
  play: () => set((s) => ({ sim: { ...s.sim, playing: true } })),
  pause: () => set((s) => ({ sim: { ...s.sim, playing: false } })),
  toggle: () => set((s) => ({ sim: { ...s.sim, playing: !s.sim.playing } })),
  setSpeed: (speed) => set((s) => ({ sim: { ...s.sim, speed } })),
  setTime: (t) => {
    const clamped = Math.min(Math.max(t, 0), SIM_HORIZON_SECONDS);
    simClockRef.t = clamped;
    set((s) => ({ sim: { ...s.sim, t: clamped } }));
  },
  resetTime: () => {
    simClockRef.t = 0;
    set((s) => ({ sim: { ...s.sim, t: 0, playing: false } }));
  },
}));

// Dev-only hook so E2E tests can read and drive editor state without pixel-peeping the canvas.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __sceneStore: typeof useSceneStore }).__sceneStore = useSceneStore;
}
