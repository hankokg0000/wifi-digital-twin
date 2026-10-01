import { useMemo } from 'react';
import type { AgentPlan, Id } from '../core';
import { useSceneStore } from './store';
import { plansFor } from './sim/cache';

/** All agents' plans, recomputed only when `doc` changes (not per tick, not per frame). */
export function useSimPlans(): Map<Id, AgentPlan> {
  const doc = useSceneStore((s) => s.doc);
  return useMemo(() => plansFor(doc), [doc]);
}
