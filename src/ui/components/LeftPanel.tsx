import { useState } from 'react';
import { addLevel, removeLevel, updateLevel, updateMaterial, type Band } from '../../core';
import { useSceneStore } from '../store';
import { KIND_LABEL } from '../entityLookup';

type Tab = 'levels' | 'materials';

export function LeftPanel() {
  const [tab, setTab] = useState<Tab>('levels');

  return (
    <div className="left-panel">
      <div className="tabs">
        <button className={`tab-btn${tab === 'levels' ? ' active' : ''}`} onClick={() => setTab('levels')}>
          Levels
        </button>
        <button className={`tab-btn${tab === 'materials' ? ' active' : ''}`} onClick={() => setTab('materials')}>
          Materials
        </button>
      </div>
      {tab === 'levels' ? <LevelsTab /> : <MaterialsTab />}
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
  const out: { id: string; kind: 'wall' | 'opening' | 'room' | 'object' | 'agent' | 'radio'; label: string }[] = [];
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
  for (const a of doc.agents.filter((a) => a.levelId === levelId)) {
    out.push({ id: a.id, kind: 'agent', label: a.kind });
  }
  for (const r of doc.radios.filter((r) => r.levelId === levelId)) {
    out.push({ id: r.id, kind: 'radio', label: r.name });
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
