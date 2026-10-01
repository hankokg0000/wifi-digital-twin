import { Siren, TriangleAlert, Check, Play, Undo2, Redo2, Eye, Pencil } from 'lucide-react';
import { useSceneStore } from '../store';
import { useMonitorModel } from '../sim/useMonitorModel';
import { startDemo } from '../demo';
import { Segmented } from '../components/Segmented';
import { Tooltip } from '../components/Tooltip';
import { BrandMark } from './BrandMark';
import { FileMenu } from './FileMenu';
import { SignalControl } from './SignalControl';
import './topbar.css';

function StatusPills() {
  const { criticalCount, warningCount } = useMonitorModel();
  const allClear = criticalCount === 0 && warningCount === 0;
  return (
    <div className="pills" role="status" aria-live="polite">
      {criticalCount > 0 && (
        <span className="pill pill-critical">
          <Siren size={16} strokeWidth={1.5} />
          <span className="pill-label">วิกฤต</span>
          <b className="mono">{criticalCount}</b>
        </span>
      )}
      {warningCount > 0 && (
        <span className="pill pill-warning">
          <TriangleAlert size={16} strokeWidth={1.5} />
          <span className="pill-label">เตือน</span>
          <b className="mono">{warningCount}</b>
        </span>
      )}
      {allClear && (
        <span className="pill pill-ok">
          <Check size={16} strokeWidth={1.5} />
          ปกติ
        </span>
      )}
    </div>
  );
}

export function TopBar() {
  const mode = useSceneStore((s) => s.mode);
  const setMode = useSceneStore((s) => s.setMode);
  const viewMode = useSceneStore((s) => s.viewMode);
  const setViewMode = useSceneStore((s) => s.setViewMode);
  const levels = useSceneStore((s) => s.doc.levels);
  const activeLevelId = useSceneStore((s) => s.activeLevelId);
  const setActiveLevelId = useSceneStore((s) => s.setActiveLevelId);
  const pastLen = useSceneStore((s) => s.past.length);
  const futureLen = useSceneStore((s) => s.future.length);
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <BrandMark />
        <span className="brand-name">WiFi Digital Twin</span>
        <span className="brand-house">บ้านตัวอย่าง 2 ชั้น</span>
      </div>

      <Segmented
        label="โหมด"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'monitor', label: <><Eye size={16} strokeWidth={1.5} />Monitor</>, ariaLabel: 'Monitor' },
          { value: 'edit', label: <><Pencil size={16} strokeWidth={1.5} />Edit</>, ariaLabel: 'Edit' },
        ]}
      />

      <div className="topbar-right">
        {mode === 'monitor' && <StatusPills />}

        {mode === 'edit' && (
          <div className="topbar-undo">
            <Tooltip label="Undo" shortcut="⌘Z">
              <button className="icon-btn" aria-label="Undo" onClick={undo} disabled={pastLen === 0}>
                <Undo2 size={16} strokeWidth={1.5} />
              </button>
            </Tooltip>
            <Tooltip label="Redo" shortcut="⇧⌘Z">
              <button className="icon-btn" aria-label="Redo" onClick={redo} disabled={futureLen === 0}>
                <Redo2 size={16} strokeWidth={1.5} />
              </button>
            </Tooltip>
          </div>
        )}

        <Segmented
          label="ชั้น"
          value={activeLevelId}
          onChange={setActiveLevelId}
          options={levels.map((l) => ({ value: l.id, label: l.name }))}
        />
        <Segmented
          label="มุมมอง"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'plan', label: 'Plan' },
            { value: '3d', label: '3D' },
          ]}
        />
        <SignalControl />

        <Tooltip label="โหลดบ้านตัวอย่าง เล่นเดโมที่ ×20">
          <button className="btn btn-primary demo-btn" onClick={startDemo} aria-label="เริ่มเดโม">
            <Play size={16} strokeWidth={1.5} fill="currentColor" />
            <span className="demo-label">เริ่มเดโม</span>
          </button>
        </Tooltip>
        <FileMenu />
      </div>
    </header>
  );
}
