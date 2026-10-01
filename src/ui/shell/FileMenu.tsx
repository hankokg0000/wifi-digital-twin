import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, FilePlus2, FolderOpen, Download, House } from 'lucide-react';
import { serialize } from '../../core';
import { useSceneStore } from '../store';
import { Tooltip } from '../components/Tooltip';
import './file-menu.css';

/** Icon-button file menu. The popover and the "could not open" dialog are portaled to <body>
 * with fixed positioning, so no rail/top-bar overflow can clip them. */
export function FileMenu() {
  const doc = useSceneStore((s) => s.doc);
  const newDoc = useSceneStore((s) => s.newDoc);
  const loadSample = useSceneStore((s) => s.loadSample);
  const openJsonText = useSceneStore((s) => s.openJsonText);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ right: number; top: number }>({ right: 0, top: 0 });
  const [issues, setIssues] = useState<{ path: string; message: string }[] | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ right: window.innerWidth - r.right, top: r.bottom + 6 });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleSave() {
    const blob = new Blob([serialize(doc)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene.json';
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  async function handleOpenFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    setOpen(false);
    if (!file) return;
    const result = openJsonText(await file.text());
    setIssues(result.ok ? null : result.issues);
  }

  return (
    <>
      <Tooltip label="เมนูไฟล์" side="bottom">
        <button
          ref={btnRef}
          type="button"
          className={`icon-btn${open ? ' active' : ''}`}
          aria-label="เมนูไฟล์"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
        >
          <Menu size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={handleOpenFile} />

      {open &&
        createPortal(
          <div ref={menuRef} className="popover" role="menu" aria-label="เมนูไฟล์" style={{ right: pos.right, top: pos.top }}>
            <button
              role="menuitem"
              onClick={() => {
                newDoc();
                setOpen(false);
              }}
            >
              <FilePlus2 size={16} strokeWidth={1.5} />
              New
            </button>
            <button
              role="menuitem"
              onClick={() => {
                loadSample();
                setOpen(false);
              }}
            >
              <House size={16} strokeWidth={1.5} />
              Load sample
            </button>
            <button role="menuitem" onClick={() => fileInputRef.current?.click()}>
              <FolderOpen size={16} strokeWidth={1.5} />
              Open JSON…
            </button>
            <button role="menuitem" onClick={handleSave}>
              <Download size={16} strokeWidth={1.5} />
              Save JSON
            </button>
          </div>,
          document.body,
        )}

      {issues &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setIssues(null)}>
            <div className="modal" role="dialog" aria-label="Could not open file" onClick={(e) => e.stopPropagation()}>
              <h3>Could not open file</h3>
              <ul className="issue-list">
                {issues.map((issue, i) => (
                  <li key={i}>
                    <code>{issue.path}</code>: {issue.message}
                  </li>
                ))}
              </ul>
              <button className="btn" onClick={() => setIssues(null)}>
                Close
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
