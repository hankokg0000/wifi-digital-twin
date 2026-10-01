import { useMemo } from 'react';
import type { Alert } from '../core';
import { useSceneStore } from './store';
import { alertsFor } from './sim/cache';

/** All alerts for the current doc, recomputed only when `doc` changes (not per tick). */
export function useAlerts(): Alert[] {
  const doc = useSceneStore((s) => s.doc);
  return useMemo(() => alertsFor(doc), [doc]);
}
