import type { Id } from '../../core';
import { useSceneStore } from '../store';

/** Select an agent, show its floor and pan the camera to it. `setActiveLevelId` clears the
 * selection as a side effect, so the level is switched first and the selection set second. */
export function focusAgent(agentId: Id, levelId: Id, x: number, z: number): void {
  const s = useSceneStore.getState();
  if (s.activeLevelId !== levelId) s.setActiveLevelId(levelId);
  s.setSelection(agentId);
  s.requestFocus(x, z);
}

/** Jump the sim to an alert (paused), select who it concerns, show their floor and pan to them. */
export function jumpToAlert(alert: { t: number; agentId: Id; levelId: Id; position: [number, number, number] }): void {
  const s = useSceneStore.getState();
  s.pause();
  s.setTime(alert.t);
  focusAgent(alert.agentId, alert.levelId, alert.position[0], alert.position[2]);
}
