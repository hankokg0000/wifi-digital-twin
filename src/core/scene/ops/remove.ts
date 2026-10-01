import type { SceneDoc, Id } from '../types';
import { checked, SceneOpError } from './shared';
import { removeLevel } from './levels';
import { removeWall } from './walls';

/** Remove any entity by id, dispatching to the right cascade-aware remove op. */
export function removeEntity(doc: SceneDoc, id: Id): SceneDoc {
  if (doc.levels.some((l) => l.id === id)) return removeLevel(doc, id);
  if (doc.walls.some((w) => w.id === id)) return removeWall(doc, id);
  if (doc.openings.some((o) => o.id === id)) {
    return checked({ ...doc, openings: doc.openings.filter((o) => o.id !== id) });
  }
  if (doc.rooms.some((r) => r.id === id)) {
    return checked({
      ...doc,
      rooms: doc.rooms.filter((r) => r.id !== id),
      zones: doc.zones.filter((z) => z.roomId !== id),
    });
  }
  if (doc.objects.some((o) => o.id === id)) {
    return checked({ ...doc, objects: doc.objects.filter((o) => o.id !== id) });
  }
  if (doc.agents.some((a) => a.id === id)) {
    return checked({
      ...doc,
      agents: doc.agents.filter((a) => a.id !== id),
      incidents: doc.incidents.filter((i) => i.agentId !== id),
    });
  }
  if (doc.radios.some((r) => r.id === id)) {
    return checked({ ...doc, radios: doc.radios.filter((r) => r.id !== id) });
  }
  if (doc.stairs.some((s) => s.id === id)) {
    return checked({ ...doc, stairs: doc.stairs.filter((s) => s.id !== id) });
  }
  if (doc.zones.some((z) => z.id === id)) {
    return checked({ ...doc, zones: doc.zones.filter((z) => z.id !== id) });
  }
  if (doc.incidents.some((i) => i.id === id)) {
    return checked({ ...doc, incidents: doc.incidents.filter((i) => i.id !== id) });
  }
  if (doc.materials.some((m) => m.id === id)) {
    throw new SceneOpError(`cannot remove material "${id}" via removeEntity; materials are not cascaded`);
  }
  throw new SceneOpError(`entity "${id}" not found`);
}
