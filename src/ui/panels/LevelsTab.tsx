import { useState } from 'react';
import { addLevel, removeLevel, updateLevel } from '../../core';
import { useSceneStore } from '../store';
import { KIND_LABEL } from '../entityLookup';

export function LevelsTab() {
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
