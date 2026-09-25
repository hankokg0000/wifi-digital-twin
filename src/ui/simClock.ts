/**
 * Per-frame authoritative sim time, updated every animation frame by <SimClock/> (inside
 * <Canvas>) and read every frame by <AgentsLayer/> — both live outside zustand so agent motion
 * never triggers a React re-render of the scene. The store's `sim.t` (used by the UI: slider,
 * clock readout, per-agent chips) is synced from this ref at a much lower rate; see SimClock.
 */
export const simClockRef = { t: 0 };

/** Simulation horizon: how far ahead agents are planned, and the sim bar's scrub range. */
export const SIM_HORIZON_SECONDS = 3600; // 1 h — design.md §7.1

/** Simulated day starts at 07:00:00; the sim bar's clock readout is this + t seconds. */
export const SIM_DAY_START_SECONDS = 7 * 3600;

export function formatClock(daySeconds: number): string {
  const total = Math.floor(daySeconds) % 86400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
