import { useState } from 'react';
import { Crosshair, Plus } from 'lucide-react';
import { ROOM_MAX_M, ROOM_MIN_M } from '../../core';
import { activateSite, canWrite, cancelPlacement, createQuickRoom, READ_ONLY_HINT, startPlacement, useLiveStore } from './liveStore';

function NewRoomForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [w, setW] = useState('4');
  const [l, setL] = useState('5');
  const [busy, setBusy] = useState(false);
  const wn = Number(w);
  const ln = Number(l);
  const ok = (n: number) => Number.isFinite(n) && n >= ROOM_MIN_M && n <= ROOM_MAX_M;
  const valid = name.trim().length >= 1 && name.trim().length <= 40 && ok(wn) && ok(ln);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    await createQuickRoom(name, wn, ln);
    setBusy(false);
    onDone();
  }

  return (
    <form
      className="sensing-field"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="sensing-field">
        <span className="field-label">ชื่อห้อง</span>
        <input className="sensing-select" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="sensing-field">
        <span className="field-label">กว้าง (m)</span>
        <input className="sensing-select mono" type="number" min={ROOM_MIN_M} max={ROOM_MAX_M} step={0.1} value={w} onChange={(e) => setW(e.target.value)} />
      </label>
      <label className="sensing-field">
        <span className="field-label">ยาว (m)</span>
        <input className="sensing-select mono" type="number" min={ROOM_MIN_M} max={ROOM_MAX_M} step={0.1} value={l} onChange={(e) => setL(e.target.value)} />
      </label>
      <div className="sensing-actions">
        <button type="submit" className="btn btn-primary btn-block" disabled={!valid || busy}>
          สร้าง
        </button>
        <button type="button" className="btn btn-block" onClick={onDone}>
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

/** Real-mode setup: pick the Site or create a Quick Room. Writing is for the demo machine only. */
export function LiveSetup() {
  const sites = useLiveStore((s) => s.sites);
  const saveError = useLiveStore((s) => s.saveError);
  const placing = useLiveStore((s) => s.placing);
  const [creating, setCreating] = useState(false);
  const writable = canWrite();
  const hint = writable ? undefined : READ_ONLY_HINT;

  return (
    <div className="sensing-actions">
      <label className="sensing-field">
        <span className="field-label">สถานที่</span>
        <select
          className="sensing-select"
          value={sites?.activeSiteId ?? ''}
          onChange={(e) => void activateSite(e.target.value)}
          disabled={!writable || !sites || sites.sites.length === 0}
          title={hint}
          aria-label="สถานที่"
        >
          {(!sites || sites.sites.length === 0) && <option value="">ยังไม่มีห้อง</option>}
          {sites?.sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {creating ? (
        <NewRoomForm onDone={() => setCreating(false)} />
      ) : (
        <button type="button" className="btn btn-block" onClick={() => setCreating(true)} disabled={!writable} title={hint}>
          <Plus size={16} strokeWidth={1.5} />
          ห้องใหม่
        </button>
      )}
      {placing ? (
        <>
          <p className="sensing-hint" role="status">
            {placing === 'tx' ? 'คลิกตำแหน่ง hotspot (Transmitter)' : 'คลิกตำแหน่ง Mac (Receiver)'}
          </p>
          <button type="button" className="btn btn-block" onClick={cancelPlacement}>
            ยกเลิก
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-block"
          onClick={startPlacement}
          disabled={!writable || !sites?.activeSiteId}
          title={hint}
        >
          <Crosshair size={16} strokeWidth={1.5} />
          วางตำแหน่งอุปกรณ์
        </button>
      )}
      {saveError && <p className="sensing-error" role="alert">{saveError}</p>}
    </div>
  );
}
