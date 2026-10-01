import { useMemo } from 'react';
import { useSceneStore } from '../store';
import { plansFor, alertsFor } from './cache';
import { buildModel, type MonitorModel } from './model';

// Several components read the model on the same tick; remember the last result so it is built
// once per (doc, t, acknowledged), not once per consumer.
let last: { key: unknown[]; model: MonitorModel } | null = null;

/** Everything the Monitor UI shows, derived from the doc + sim time (~10 Hz, from the store). */
export function useMonitorModel(): MonitorModel {
  const doc = useSceneStore((s) => s.doc);
  const t = useSceneStore((s) => s.sim.t);
  const acknowledged = useSceneStore((s) => s.acknowledged);
  return useMemo(() => {
    const key = [doc, t, acknowledged];
    if (last && last.key.every((k, i) => k === key[i])) return last.model;
    const model = buildModel(doc, plansFor(doc), alertsFor(doc), t, acknowledged);
    last = { key, model };
    return model;
  }, [doc, t, acknowledged]);
}
