import type { StateCreator } from 'zustand';
import { SIM_HORIZON_SECONDS, simClockRef } from '../simClock';
import type { SceneState, SimSlice } from './types';

// --- Simulation playback: plain `set`s, never `apply`/`applyOp` — not undo-tracked, not
// autosaved. `simClockRef.t` (read every frame by SimClock/AgentsLayer, outside React) is
// kept in lockstep here so scrubbing/reset take effect immediately, not on the next frame.
export const createSimSlice: StateCreator<SceneState, [], [], SimSlice> = (set) => ({
  sim: { t: 0, playing: false, speed: 1 },

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
});
