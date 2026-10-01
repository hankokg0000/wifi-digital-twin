import type { StateCreator } from 'zustand';
import type { SceneState, AlertSlice } from './types';

export const createAlertSlice: StateCreator<SceneState, [], [], AlertSlice> = (set) => ({
  acknowledged: {},
  acknowledge: (ids) =>
    set((s) => {
      const next = { ...s.acknowledged };
      for (const id of ids) next[id] = true;
      return { acknowledged: next };
    }),
  clearAcknowledged: () => set({ acknowledged: {} }),
});
