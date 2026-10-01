import type { StateCreator } from 'zustand';
import type { SceneDoc } from '../../core';
import type { SceneState, ViewSlice } from './types';

export const createViewSlice =
  (initialDoc: SceneDoc): StateCreator<SceneState, [], [], ViewSlice> =>
  (set, get) => ({
    mode: 'monitor',
    focusRequest: null,
    selection: null,
    activeLevelId: initialDoc.levels[0]?.id ?? '',
    tool: 'select',
    viewMode: 'plan',
    draft: null,
    lastError: null,
    cameraLocked: false,
    heatmap: { enabled: false, band: '2.4', source: 'best' },

    setMode: (m) => {
      if (m === 'edit') get().pause();
      set({ mode: m, tool: 'select', draft: null, selection: null });
    },
    requestFocus: (x, z) => set({ focusRequest: { x, z, nonce: (get().focusRequest?.nonce ?? 0) + 1 } }),
    setSelection: (id) => set({ selection: id }),
    setActiveLevelId: (id) => set({ activeLevelId: id, selection: null, draft: null }),
    setTool: (t) => set({ tool: t, draft: null }),
    setViewMode: (v) => set({ viewMode: v }),
    setDraft: (d) => set({ draft: d }),
    clearDraft: () => set({ draft: null }),
    dismissError: () => set({ lastError: null }),
    setCameraLocked: (locked) => set({ cameraLocked: locked }),
    setHeatmap: (patch) => set((s) => ({ heatmap: { ...s.heatmap, ...patch } })),
  });
