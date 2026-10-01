import type { SceneDoc, Id, Incident } from '../types';
import { newId } from '../ids';
import { checked, requireEntity } from './shared';

export interface AddIncidentInput {
  agentId: Id;
  t: number;
  duration?: number;
}

export function addIncident(doc: SceneDoc, input: AddIncidentInput): { doc: SceneDoc; id: Id } {
  requireEntity(doc.agents, input.agentId, 'agent');
  const id = newId('incident');
  const incident: Incident = {
    id,
    kind: 'fall',
    agentId: input.agentId,
    t: input.t,
    duration: input.duration ?? 180,
  };
  const next = checked({ ...doc, incidents: [...doc.incidents, incident] });
  return { doc: next, id };
}
