import { computeAlerts, planAll, sampleWorld, type Alert, type AgentPlan, type Id, type SceneDoc } from '../../core';
import { SIM_HORIZON_SECONDS } from '../simClock';

// Plans and alerts are pure functions of the doc, and several components (canvas, timeline,
// rails, top bar) need them. Caching by doc identity means the (expensive) planner and alert
// scan run once per doc change, not once per consumer.
const plansCache = new WeakMap<SceneDoc, Map<Id, AgentPlan>>();
const alertsCache = new WeakMap<SceneDoc, Alert[]>();

export function plansFor(doc: SceneDoc): Map<Id, AgentPlan> {
  let plans = plansCache.get(doc);
  if (!plans) {
    plans = planAll(doc, SIM_HORIZON_SECONDS);
    plansCache.set(doc, plans);
  }
  return plans;
}

/** Ground-truth alerts today; Phase 3's estimator plugs into core's `computeAlerts` seam. */
export function alertsFor(doc: SceneDoc): Alert[] {
  let alerts = alertsCache.get(doc);
  if (!alerts) {
    const plans = plansFor(doc);
    alerts = computeAlerts(doc, (t) => sampleWorld(doc, plans, t), SIM_HORIZON_SECONDS);
    alertsCache.set(doc, alerts);
  }
  return alerts;
}
