import { useSceneStore } from './store';

/** "เริ่มเดโม": reload the sample house, rewind to t=0, ×20, play, Monitor mode, ground floor. */
export function startDemo(): void {
  const s = useSceneStore.getState();
  s.loadSample();
  const { doc } = useSceneStore.getState();
  s.setMode('monitor');
  s.setActiveLevelId(doc.levels[0]?.id ?? '');
  s.resetTime();
  s.setSpeed(20);
  s.play();
}
