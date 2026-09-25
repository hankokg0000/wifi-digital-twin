// World-level simulation entry points — design.md §7.1. This is what later phases treat as
// `home/sim/truth`: the ground-truth state the virtual sensors observe from.
import type { SceneDoc, Id } from '../scene/types';
import { planAgent, type AgentPlan } from './plan';
import { sampleAgent, activeSegmentIndex, type AgentState } from './sample';

export interface WorldAgentState extends AgentState {
  agentId: Id;
  /** Set while the agent is mid-stair-transit: the [lower, upper] level ids it should render
   * on simultaneously (a stair segment straddles both). Null the rest of the time. */
  onStairLevels: [Id, Id] | null;
}

/** Plan every agent in the doc out to `horizonSeconds`. Pure and deterministic: call once per
 * doc (e.g. memoized on doc identity in the UI), not per frame. */
export function planAll(doc: SceneDoc, horizonSeconds?: number): Map<Id, AgentPlan> {
  const plans = new Map<Id, AgentPlan>();
  for (const agent of doc.agents) {
    plans.set(agent.id, planAgent(doc, agent, horizonSeconds));
  }
  return plans;
}

/** Sample the whole world's agent states at time `t`. Cheap (binary search per agent) — safe
 * to call every animation frame. */
export function sampleWorld(doc: SceneDoc, plans: Map<Id, AgentPlan>, t: number): WorldAgentState[] {
  return doc.agents.map((agent): WorldAgentState => {
    const plan = plans.get(agent.id);
    if (!plan || plan.segments.length === 0) {
      const level = doc.levels.find((l) => l.id === agent.start.levelId);
      return {
        agentId: agent.id,
        levelId: agent.start.levelId,
        position: [agent.start.p[0], level?.elevation ?? 0, agent.start.p[1]],
        heading: 0,
        moving: false,
        posture: 'standing',
        onStairLevels: null,
      };
    }
    const state = sampleAgent(doc, plan.segments, t);
    const idx = activeSegmentIndex(plan.segments, t);
    const seg = plan.segments[idx]!;
    let onStairLevels: [Id, Id] | null = null;
    if (seg.kind === 'stair') {
      const stair = doc.stairs.find((s) => s.id === seg.stairId);
      if (stair) onStairLevels = [stair.fromLevelId, stair.toLevelId];
    }
    return { agentId: agent.id, ...state, onStairLevels };
  });
}
