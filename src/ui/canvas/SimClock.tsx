import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSceneStore } from '../store';
import { simClockRef, SIM_HORIZON_SECONDS } from '../simClock';

const UI_SYNC_INTERVAL_MS = 100; // ~10x/s — see simClockRef's doc comment

/**
 * Lives inside <Canvas>. Advances `simClockRef.t` every frame while playing (full frame rate,
 * no React involved), and syncs it into the zustand store at a throttled rate purely so the DOM
 * sim bar (slider/clock readout) can read it. Renders nothing.
 */
export function SimClock() {
  const playing = useSceneStore((s) => s.sim.playing);
  const speed = useSceneStore((s) => s.sim.speed);
  const setTime = useSceneStore((s) => s.setTime);
  const pause = useSceneStore((s) => s.pause);
  const lastSync = useRef(0);

  useFrame((_, dt) => {
    if (!playing) return;

    let next = simClockRef.t + dt * speed;
    const atHorizon = next >= SIM_HORIZON_SECONDS;
    if (atHorizon) next = SIM_HORIZON_SECONDS;
    simClockRef.t = next;

    const now = performance.now();
    if (atHorizon || now - lastSync.current >= UI_SYNC_INTERVAL_MS) {
      lastSync.current = now;
      setTime(next);
    }
    if (atHorizon) pause();
  });

  return null;
}
