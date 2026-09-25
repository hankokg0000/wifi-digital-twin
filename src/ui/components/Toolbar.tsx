import { useRef, useState } from 'react';
import type { Tool, ViewMode } from '../store';
import { useSceneStore } from '../store';
import { serialize } from '../../core';

const TOOLS: { tool: Tool; label: string; shortcut: string }[] = [
  { tool: 'select', label: 'Select', shortcut: 'V' },
  { tool: 'wall', label: 'Wall', shortcut: 'W' },
  { tool: 'door', label: 'Door', shortcut: 'D' },
  { tool: 'window', label: 'Window', shortcut: 'N' },
  { tool: 'room', label: 'Room', shortcut: 'R' },
  { tool: 'object', label: 'Object', shortcut: 'O' },
  { tool: 'ap', label: 'AP', shortcut: 'A' },
  { tool: 'zone', label: 'Zone', shortcut: 'Z' },
];

export function Toolbar() {
  const tool = useSceneStore((s) => s.tool);
  const setTool = useSceneStore((s) => s.setTool);
  const viewMode = useSceneStore((s) => s.viewMode);
  const setViewMode = useSceneStore((s) => s.setViewMode);
  const pastLen = useSceneStore((s) => s.past.length);
  const futureLen = useSceneStore((s) => s.future.length);
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);
  const doc = useSceneStore((s) => s.doc);
  const newDoc = useSceneStore((s) => s.newDoc);
  const loadSample = useSceneStore((s) => s.loadSample);
  const openJsonText = useSceneStore((s) => s.openJsonText);

  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [openIssues, setOpenIssues] = useState<{ path: string; message: string }[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    const text = serialize(doc);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene.json';
    a.click();
    URL.revokeObjectURL(url);
    setFileMenuOpen(false);
  }

  async function handleOpenFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setFileMenuOpen(false);
    if (!file) return;

    const result = openJsonText(await file.text());
    setOpenIssues(result.ok ? null : result.issues);
  }

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <div className="file-menu">
          <button className="toolbar-btn" onClick={() => setFileMenuOpen((v) => !v)}>
            File ▾
          </button>
          {fileMenuOpen && (
            <div className="file-menu-dropdown" onMouseLeave={() => setFileMenuOpen(false)}>
              <button
                onClick={() => {
                  newDoc();
                  setFileMenuOpen(false);
                }}
              >
                New
              </button>
              <button
                onClick={() => {
                  loadSample();
                  setFileMenuOpen(false);
                }}
              >
                Load sample
              </button>
              <button onClick={() => fileInputRef.current?.click()}>Open JSON…</button>
              <button onClick={handleSave}>Save JSON</button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleOpenFile}
          />
        </div>
      </div>

      <div className="toolbar-group">
        {TOOLS.map(({ tool: t, label, shortcut }) => (
          <button
            key={t}
            className={`toolbar-btn tool-btn${tool === t ? ' active' : ''}`}
            title={`${label} (${shortcut})`}
            onClick={() => setTool(t)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={undo} disabled={pastLen === 0} title="Undo (Cmd/Ctrl+Z)">
          ↶ Undo
        </button>
        <button className="toolbar-btn" onClick={redo} disabled={futureLen === 0} title="Redo (Shift+Cmd/Ctrl+Z)">
          ↷ Redo
        </button>
      </div>

      <div className="toolbar-group toolbar-group-right">
        <button
          className={`toolbar-btn${viewMode === 'plan' ? ' active' : ''}`}
          onClick={() => setViewMode('plan')}
        >
          Plan
        </button>
        <button className={`toolbar-btn${viewMode === '3d' ? ' active' : ''}`} onClick={() => setViewMode('3d')}>
          3D
        </button>
      </div>

      {openIssues && (
        <div className="modal-backdrop" onClick={() => setOpenIssues(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Could not open file</h3>
            <ul className="issue-list">
              {openIssues.map((issue, i) => (
                <li key={i}>
                  <code>{issue.path}</code>: {issue.message}
                </li>
              ))}
            </ul>
            <button className="toolbar-btn" onClick={() => setOpenIssues(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
