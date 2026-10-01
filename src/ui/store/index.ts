import { create } from 'zustand';
import { loadInitialDoc, createDocSlice } from './docSlice';
import { createViewSlice } from './viewSlice';
import { createSimSlice } from './simSlice';
import type { SceneState } from './types';

export type { Tool, ViewMode, SimSpeed, SimState, Draft, SceneState } from './types';

const initialDoc = loadInitialDoc();

export const useSceneStore = create<SceneState>()((...a) => ({
  ...createDocSlice(initialDoc)(...a),
  ...createViewSlice(initialDoc)(...a),
  ...createSimSlice(...a),
}));

// Dev-only hook so E2E tests can read and drive editor state without pixel-peeping the canvas.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __sceneStore: typeof useSceneStore }).__sceneStore = useSceneStore;
}
