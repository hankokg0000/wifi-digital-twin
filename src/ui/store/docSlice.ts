import type { StateCreator } from 'zustand';
import type { SceneDoc, Id } from '../../core';
import { sampleHouse, createEmptyDoc, SceneOpError, SceneParseError, serialize, parse } from '../../core';
import { findEntity } from '../entityLookup';
import type { Draft, SceneState, DocSlice } from './types';

const HISTORY_CAP = 100;
const STORAGE_KEY = 'wifi-digital-twin:scene-doc';
const AUTOSAVE_DEBOUNCE_MS = 500;

export function loadInitialDoc(): SceneDoc {
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

export const createDocSlice =
  (initialDoc: SceneDoc): StateCreator<SceneState, [], [], DocSlice> =>
  (set, get) => ({
    doc: initialDoc,
    past: [],
    future: [],

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
        acknowledged: {},
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
  });
