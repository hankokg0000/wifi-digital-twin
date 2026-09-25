import { useMemo } from 'react';
import { computeAlerts, sampleWorld, type Alert } from '../core';
import { useSceneStore } from './store';
import { useSimPlans } from './useSimPlans';
import { SIM_HORIZON_SECONDS } from './simClock';

/** All alerts for the current doc, recomputed only when `doc`/`plans` change (not per tick). The
 * `stateAt` passed to computeAlerts is ground truth today; Phase 3's estimator plugs in here
 * unchanged (see core/alerts/index.ts). */
export function useAlerts(): Alert[] {
  const doc = useSceneStore((s) => s.doc);
  const plans = useSimPlans();
  return useMemo(
    () => computeAlerts(doc, (t) => sampleWorld(doc, plans, t), SIM_HORIZON_SECONDS),
    [doc, plans],
  );
}
