import { useState } from 'react';
import { addLevel, removeLevel, updateLevel, updateMaterial, updateZone, addIncident, populate, type Band, type PopulationSettings } from '../../core';
import { useSceneStore } from '../store';
import { KIND_LABEL } from '../entityLookup';

type Tab = 'sim' | 'levels' | 'materials';

export function LeftPanel() {
  // "จำลอง" (Sim) opens by default — this is the tab the demo is built around (design brief §3).
  const [tab, setTab] = useState<Tab>('sim');

  return (
    <div className="left-panel">
      <div className="tabs">
        <button className={`tab-btn${tab === 'sim' ? ' active' : ''}`} onClick={() => setTab('sim')}>
          จำลอง
        </button>
        <button className={`tab-btn${tab === 'levels' ? ' active' : ''}`} onClick={() => setTab('levels')}>
          Levels
        </button>
        <button className={`tab-btn${tab === 'materials' ? ' active' : ''}`} onClick={() => setTab('materials')}>
          Materials
        </button>
      </div>
      {tab === 'sim' ? <SimTab /> : tab === 'levels' ? <LevelsTab /> : <MaterialsTab />}
    </div>
  );
}

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

function SimTab() {
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

function LevelsTab() {
  const doc = useSceneStore((s) => s.doc);
  const activeLevelId = useSceneStore((s) => s.activeLevelId);
  const setActiveLevelId = useSceneStore((s) => s.setActiveLevelId);
  const apply = useSceneStore((s) => s.apply);
  const applyOp = useSceneStore((s) => s.applyOp);
  const selection = useSceneStore((s) => s.selection);
  const setSelection = useSceneStore((s) => s.setSelection);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const activeEntities = collectLevelEntities(doc, activeLevelId);

  return (
    <div className="panel-body">
      <div className="panel-section">
        <div className="panel-section-header">
          <span>Levels</span>
          <button className="small-btn" onClick={() => applyOp((d) => addLevel(d))} title="Add level">
            +
          </button>
        </div>
        <ul className="level-list">
          {doc.levels.map((level) => (
            <li key={level.id} className={level.id === activeLevelId ? 'active' : ''}>
              {renamingId === level.id ? (
                <input
                  autoFocus
                  defaultValue={level.name}
                  onBlur={(e) => {
                    apply((d) => updateLevel(d, level.id, { name: e.target.value || level.name }));
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <button className="level-name" onClick={() => setActiveLevelId(level.id)} onDoubleClick={() => setRenamingId(level.id)}>
                  {level.name}
                  <span className="level-meta">
                    {' '}
                    (el {level.elevation.toFixed(1)}m, h {level.height.toFixed(1)}m)
                  </span>
                </button>
              )}
              <button
                className="small-btn danger"
                title="Remove level"
                onClick={() => apply((d) => removeLevel(d, level.id))}
                disabled={doc.levels.length <= 1}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel-section">
        <div className="panel-section-header">
          <span>Entities on active level</span>
        </div>
        {activeEntities.length === 0 ? (
          <p className="empty-hint">Nothing here yet.</p>
        ) : (
          <ul className="entity-outline">
            {activeEntities.map(({ id, kind, label }) => (
              <li key={id} className={selection === id ? 'active' : ''}>
                <button onClick={() => setSelection(id)}>
                  <span className="entity-kind">{KIND_LABEL[kind]}</span> {label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function collectLevelEntities(doc: ReturnType<typeof useSceneStore.getState>['doc'], levelId: string) {
  const wallIds = new Set(doc.walls.filter((w) => w.levelId === levelId).map((w) => w.id));
  const out: { id: string; kind: 'wall' | 'opening' | 'room' | 'object' | 'agent' | 'radio' | 'stair'; label: string }[] = [];
  for (const w of doc.walls.filter((w) => w.levelId === levelId)) {
    out.push({ id: w.id, kind: 'wall', label: w.id.slice(-8) });
  }
  for (const o of doc.openings.filter((o) => wallIds.has(o.wallId))) {
    out.push({ id: o.id, kind: 'opening', label: `${o.kind} · ${o.open ? 'open' : 'closed'}` });
  }
  for (const r of doc.rooms.filter((r) => r.levelId === levelId)) {
    out.push({ id: r.id, kind: 'room', label: r.name });
  }
  for (const o of doc.objects.filter((o) => o.levelId === levelId)) {
    out.push({ id: o.id, kind: 'object', label: o.name });
  }
  // An agent "lives" on the level it spawns on; agents just passing through (waypoints/wander
  // room on other levels) are listed there instead.
  for (const a of doc.agents.filter((a) => a.start.levelId === levelId)) {
    out.push({ id: a.id, kind: 'agent', label: a.name });
  }
  for (const r of doc.radios.filter((r) => r.levelId === levelId)) {
    out.push({ id: r.id, kind: 'radio', label: r.name });
  }
  for (const s of doc.stairs.filter((s) => s.fromLevelId === levelId || s.toLevelId === levelId)) {
    out.push({ id: s.id, kind: 'stair', label: 'Stair' });
  }
  return out;
}

const BANDS: Band[] = ['2.4', '5'];

function MaterialsTab() {
  const materials = useSceneStore((s) => s.doc.materials);
  const apply = useSceneStore((s) => s.apply);

  return (
    <div className="panel-body">
      <table className="materials-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>2.4 GHz (dB)</th>
            <th>5 GHz (dB)</th>
            <th>Color</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              {BANDS.map((band) => (
                <td key={band}>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={m.lossDb[band]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      apply((d) => updateMaterial(d, m.id, { lossDb: { ...m.lossDb, [band]: v } }));
                    }}
                  />
                </td>
              ))}
              <td>
                <span className="color-swatch" style={{ background: m.color }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
