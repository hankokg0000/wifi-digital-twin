import { create } from 'zustand';
import { loadInitialDoc, createDocSlice } from './docSlice';
import { createViewSlice } from './viewSlice';
import { createSimSlice } from './simSlice';
import { createAlertSlice } from './alertSlice';
import type { SceneState } from './types';

export type { Tool, ViewMode, Mode, SimSpeed, SimState, Draft, HeatmapSettings, SceneState } from './types';

const initialDoc = loadInitialDoc();

export const useSceneStore = create<SceneState>()((...a) => ({
  ...createDocSlice(initialDoc)(...a),
  ...createViewSlice(initialDoc)(...a),
  ...createSimSlice(...a),
  ...createAlertSlice(...a),
}));

// Dev-only hook so E2E tests can read and drive editor state without pixel-peeping the canvas.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __sceneStore: typeof useSceneStore }).__sceneStore = useSceneStore;
}
