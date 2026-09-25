import { useMemo } from 'react';
import { planAll, type AgentPlan, type Id } from '../core';
import { useSceneStore } from './store';
import { SIM_HORIZON_SECONDS } from './simClock';

/** All agents' plans, recomputed only when `doc` changes (not per tick, not per frame). */
export function useSimPlans(): Map<Id, AgentPlan> {
  const doc = useSceneStore((s) => s.doc);
  return useMemo(() => planAll(doc, SIM_HORIZON_SECONDS), [doc]);
}
