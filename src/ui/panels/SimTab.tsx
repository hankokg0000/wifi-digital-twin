import { useState } from 'react';
import { updateZone, addIncident, populate, type PopulationSettings } from '../../core';
import { useSceneStore } from '../store';

const APPLIES_TO_LABEL = { person: 'คน', pet: 'สัตว์', any: 'ทั้งหมด' } as const;
const FALLS_PER_HOUR_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'ปิด' },
  { value: 0.5, label: 'ต่ำ (0.5/ชม.)' },
  { value: 3, label: 'สูง (3/ชม.)' },
];

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper-row">
      <span className="field-label">{label}</span>
      <div className="stepper-controls">
        <button className="small-btn" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          −
        </button>
        <span className="stepper-value">{value}</span>
        <button className="small-btn" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

export function SimTab() {
  const doc = useSceneStore((s) => s.doc);
  const selection = useSceneStore((s) => s.selection);
  const simT = useSceneStore((s) => s.sim.t);
  const apply = useSceneStore((s) => s.apply);
  const setTime = useSceneStore((s) => s.setTime);
  const play = useSceneStore((s) => s.play);
  const setSelection = useSceneStore((s) => s.setSelection);

  const [settings, setSettings] = useState<PopulationSettings>(doc.population);

  function randomize() {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    apply((d) => populate(d, settings, seed));
    setTime(0);
    play();
  }

  function simulateFallNow() {
    const people = doc.agents.filter((a) => a.kind === 'person');
    if (people.length === 0) return;
    const selected = people.find((p) => p.id === selection);
    const target = selected ?? people[Math.floor(Math.random() * people.length)]!;
    apply((d) => addIncident(d, { agentId: target.id, t: simT, duration: 180 }).doc);
    // Don't touch selection/level here — falling doesn't imply the user wants to jump to them;
    // the alerts panel/toast already offers a one-click way to do that once the fall fires.
  }

  return (
    <div className="panel-body">
      <div className="panel-section">
        <div className="panel-section-header">
          <span>ประชากรจำลอง</span>
        </div>
        <Stepper label="คน" value={settings.people} min={0} max={12} onChange={(people) => setSettings((s) => ({ ...s, people }))} />
        <Stepper label="สัตว์เลี้ยง" value={settings.pets} min={0} max={6} onChange={(pets) => setSettings((s) => ({ ...s, pets }))} />
        <div className="field-block">
          <span className="field-label">โอกาสล้ม</span>
          <div className="segmented-control">
            {FALLS_PER_HOUR_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                className={`toolbar-btn${settings.fallsPerHour === opt.value ? ' active' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, fallsPerHour: opt.value }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button className="toolbar-btn sim-tab-primary" onClick={randomize}>
          สุ่มใหม่
        </button>
      </div>

      <div className="panel-section">
        <button className="toolbar-btn sim-tab-primary" onClick={simulateFallNow} disabled={doc.agents.every((a) => a.kind !== 'person')}>
          จำลองคนล้ม
        </button>
      </div>

      <div className="panel-section">
        <div className="panel-section-header">
          <span>พื้นที่ (Zones)</span>
        </div>
        {doc.zones.length === 0 ? (
          <p className="empty-hint">ยังไม่มีพื้นที่</p>
        ) : (
          <ul className="entity-outline">
            {doc.zones.map((z) => (
              <li key={z.id} className={selection === z.id ? 'active' : ''}>
                <button onClick={() => setSelection(z.id)}>
                  {z.name}
                  <span className="level-meta">
                    {' '}
                    · {doc.levels.find((l) => l.id === z.levelId)?.name ?? '—'} · {APPLIES_TO_LABEL[z.appliesTo]}
                  </span>
                </button>
                <input
                  type="checkbox"
                  checked={z.enabled}
                  title="เปิดใช้งาน"
                  onChange={(e) => apply((d) => updateZone(d, z.id, { enabled: e.target.checked }))}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="empty-hint">กด Z เพื่อวาดพื้นที่ / ติ๊กห้องใน Inspector</p>
      </div>
    </div>
  );
}
