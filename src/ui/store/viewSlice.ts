import type { StateCreator } from 'zustand';
import type { SceneDoc } from '../../core';
import type { SceneState, ViewSlice } from './types';

export const createViewSlice =
  (initialDoc: SceneDoc): StateCreator<SceneState, [], [], ViewSlice> =>
  (set) => ({
    selection: null,
    activeLevelId: initialDoc.levels[0]?.id ?? '',
    tool: 'select',
    viewMode: 'plan',
    draft: null,
    lastError: null,
    cameraLocked: false,

    setSelection: (id) => set({ selection: id }),
    setActiveLevelId: (id) => set({ activeLevelId: id, selection: null, draft: null }),
    setTool: (t) => set({ tool: t, draft: null }),
    setViewMode: (v) => set({ viewMode: v }),
    setDraft: (d) => set({ draft: d }),
    clearDraft: () => set({ draft: null }),
    dismissError: () => set({ lastError: null }),
    setCameraLocked: (locked) => set({ cameraLocked: locked }),
  });
