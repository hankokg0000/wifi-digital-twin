import { updateAgent, addIncident, pointInPolygon, sampleAgent, type Agent, type SceneDoc } from '../../core';
import { useSceneStore } from '../store';
import { useSimPlans } from '../useSimPlans';
import { Field } from './fields';

export function AgentInspector({ agent, doc }: { agent: Agent; doc: SceneDoc }) {
  const apply = useSceneStore((s) => s.apply);
  const simT = useSceneStore((s) => s.sim.t);
  const plans = useSimPlans();
  const warnings = plans.get(agent.id)?.warnings ?? [];
  const segments = plans.get(agent.id)?.segments;
  const state = segments && segments.length > 0 ? sampleAgent(doc, segments, simT) : null;
  const postureLabel = state?.posture === 'fallen' ? 'ล้มอยู่' : state?.posture === 'walking' ? 'กำลังเดิน' : 'ยืนอยู่';
  const currentRoom = state
    ? doc.rooms.find((r) => r.levelId === state.levelId && pointInPolygon([state.position[0], state.position[2]], r.polygon))
    : undefined;
  return (
    <>
      <Field label="Name">
        <input value={agent.name} onChange={(e) => apply((d) => updateAgent(d, agent.id, { name: e.target.value }))} />
      </Field>
      <Field label="Color">
        <input type="color" value={agent.color} onChange={(e) => apply((d) => updateAgent(d, agent.id, { color: e.target.value }))} />
      </Field>
      <Field label="Kind">
        <span className="readonly-value">{agent.kind === 'person' ? 'คน' : 'สัตว์เลี้ยง'}</span>
      </Field>
      <Field label="ท่าทางปัจจุบัน">
        <span className={`readonly-value${state?.posture === 'fallen' ? ' text-danger' : ''}`}>{postureLabel}</span>
      </Field>
      <Field label="อยู่ที่ห้อง">
        <span className="readonly-value">{currentRoom?.name ?? '—'}</span>
      </Field>

      {agent.kind === 'person' && (
        <div className="field-block">
          <button
            className="toolbar-btn"
            onClick={() => apply((d) => addIncident(d, { agentId: agent.id, t: simT, duration: 180 }).doc)}
          >
            จำลองล้มตอนนี้
          </button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="field-block">
          <span className="field-label">Planning warnings</span>
          <ul className="warning-list">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
