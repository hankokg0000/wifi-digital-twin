import type { SceneDoc, Id, Level, Agent } from '../types';
import { newId } from '../ids';
import { checked, requireEntity, SceneOpError } from './shared';

export interface AddLevelInput {
  name?: string;
  elevation?: number;
  height?: number;
  slabMaterialId?: string;
}

export function addLevel(doc: SceneDoc, partial: AddLevelInput = {}): { doc: SceneDoc; id: Id } {
  const highestTop = doc.levels.reduce((top, l) => Math.max(top, l.elevation + l.height), -Infinity);
  const defaultElevation = doc.levels.length === 0 ? 0 : highestTop + 0.2;
  const id = newId('level');
  const level: Level = {
    id,
    name: partial.name ?? `ชั้น ${doc.levels.length + 1}`,
    elevation: partial.elevation ?? defaultElevation,
    height: partial.height ?? 3.0,
    slabMaterialId: partial.slabMaterialId ?? 'concrete-slab',
  };
  const next = checked({ ...doc, levels: [...doc.levels, level] });
  return { doc: next, id };
}

export function updateLevel(doc: SceneDoc, id: Id, patch: Partial<Omit<Level, 'id'>>): SceneDoc {
  requireEntity(doc.levels, id, 'level');
  const levels = doc.levels.map((l) => (l.id === id ? { ...l, ...patch } : l));
  return checked({ ...doc, levels });
}

export function removeLevel(doc: SceneDoc, id: Id): SceneDoc {
  requireEntity(doc.levels, id, 'level');
  if (doc.levels.length <= 1) {
    throw new SceneOpError('cannot remove the last level');
  }
  const wallIdsOnLevel = new Set(doc.walls.filter((w) => w.levelId === id).map((w) => w.id));

  // Agents whose spawn is on this level are dropped entirely; agents that merely have
  // waypoints/a wander room on this level keep their spawn but lose the references to it.
  const agents: Agent[] = [];
  for (const agent of doc.agents) {
    if (agent.start.levelId === id) continue;
    if (agent.behavior.type === 'route') {
      const waypoints = agent.behavior.waypoints.filter((wp) => wp.levelId !== id);
      agents.push({
        ...agent,
        behavior: { type: 'route', waypoints: waypoints.length > 0 ? waypoints : [{ ...agent.start }], loop: agent.behavior.loop },
      });
    } else if (agent.behavior.type === 'wander' && agent.behavior.levelId === id) {
      // Wander level was removed: fall back to a trivial route at the spawn point.
      agents.push({ ...agent, behavior: { type: 'route', waypoints: [{ ...agent.start }], loop: false } });
    } else {
      // roam has no levelId/roomId of its own (any level, reachable via stairs) — unaffected.
      agents.push(agent);
    }
  }

  const remainingAgentIds = new Set(agents.map((a) => a.id));

  const next: SceneDoc = {
    ...doc,
    levels: doc.levels.filter((l) => l.id !== id),
    walls: doc.walls.filter((w) => w.levelId !== id),
    openings: doc.openings.filter((o) => !wallIdsOnLevel.has(o.wallId)),
    rooms: doc.rooms.filter((r) => r.levelId !== id),
    objects: doc.objects.filter((o) => o.levelId !== id),
    agents,
    radios: doc.radios.filter((r) => r.levelId !== id),
    stairs: doc.stairs.filter((s) => s.fromLevelId !== id && s.toLevelId !== id),
    zones: doc.zones.filter((z) => z.levelId !== id),
    incidents: doc.incidents.filter((i) => remainingAgentIds.has(i.agentId)),
  };
  return checked(next);
}
