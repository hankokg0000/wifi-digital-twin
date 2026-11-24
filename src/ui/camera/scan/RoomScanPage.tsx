import { ArrowLeft, Camera, FileText, Link2, RotateCcw, ScanLine, Square, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { doorScale, PLAN_IMPORT_MAX_BYTES, ROOM_SCAN_API, SCAN_MAX_BYTES, type ScanDraft, type ScanIssue } from '../../../core/camera/room-scan';
import type { UsdRoomModel } from '../../../core/camera/plan-import';
import { BrandMark } from '../../shell/BrandMark';
import { FloorPlanCanvas } from '../GeneratedSceneView';
import { requireCameraJson } from '../useOfficeEditor';
import { useRoomRecording } from './useRoomRecording';

type ScanAccess = { owner: boolean; canInvite: boolean; busy: boolean; draft: ScanDraft | null };
const issueText: Record<ScanIssue, string> = {
  'camera-path': 'เดินเปลี่ยนตำแหน่งให้เห็นมุมห้องจากหลายจุด ลองถอยห่างแล้วเดินไปตามแนวผนังอีกครั้ง',
  floor: 'เอียงกล้องลงให้เห็นพื้นชนผนังและทางเดินหลายช่วง เพื่อให้ระบบหาแนวพื้นได้',
  overlap: 'เดินช้าลงและให้เฟรมติดกันเห็นเฟอร์นิเจอร์หรือมุมผนังซ้ำ เพื่อเชื่อมภาพเข้าด้วยกัน',
  walls: 'เก็บด้านที่เป็นเส้นประเพิ่ม โดยถ่ายให้เห็นช่วงที่พื้นชนผนังตั้งแต่มุมหนึ่งไปอีกมุม',
};

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function RoomScanPage() {
  const [access, setAccess] = useState<ScanAccess | null>(null);
  const [draft, setDraft] = useState<ScanDraft | null>(null);
  const [error, setError] = useState('');
  const [clip, setClip] = useState<string | null>(null);
  const [pending, setPending] = useState<'video' | 'document' | 'reference' | null>(null);
  const busy = pending !== null;
  const [resetKey, setResetKey] = useState(0);
  const [transparentWalls, setTransparentWalls] = useState(true);
  const [modelAsset, setModelAsset] = useState<{ id: string; model: UsdRoomModel | null }>();
  const [aspect, setAspect] = useState(16 / 9);
  const [selectedDoor, setSelectedDoor] = useState('');
  const [width, setWidth] = useState('');
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [invite, setInvite] = useState('');
  const [copied, setCopied] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const planInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const draftId = draft?.id;
  const imported = draft?.document;
  const isUsd = imported?.type === 'usdz';
  const usdModel = modelAsset?.id === draft?.id ? modelAsset?.model : undefined;
  const previewRevision = imported?.preview;
  const [remotePreview, setRemotePreview] = useState<{ revision: string; url: string } | null>(null);
  const token = /^[a-f0-9]{64}$/.test(location.hash.slice(6)) && location.hash.startsWith('#scan=')
    ? location.hash.slice(6) : '';
  const makeRequest = useCallback(async <T,>(path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return await requireCameraJson<T>(await fetch(ROOM_SCAN_API + path, { ...options, headers }));
  }, [token]);

  function useDraft(next: ScanDraft | null) {
    setDraft(next);
    setSelectedDoor(next?.scale?.doorId ?? '');
    setWidth(next?.scale ? String(next.scale.widthMeters) : '');
  }

  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const current = await makeRequest<ScanAccess>('access', { signal: abort.signal });
        if (abort.signal.aborted) return;
        setAccess(current);
        useDraft(current.draft);
        if (current.busy) timer = setTimeout(() => { void refresh(); }, 1300);
      } catch (failure) {
        if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'เปิดหน้าสแกนไม่ได้');
      }
    }
    void refresh();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [makeRequest]);

  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip); }, [clip]);

  useEffect(() => {
    if (!draftId || !isUsd) return;
    const abort = new AbortController();
    void makeRequest<UsdRoomModel>(`${draftId}/model`, { signal: abort.signal }).then((model) => {
      if (model.version !== 1 || !model.surfaces?.length) throw new Error('เปิดรูปทรงจาก USDZ ไม่ได้');
      if (!abort.signal.aborted) setModelAsset({ id: draftId, model });
    }).catch(() => {
      if (!abort.signal.aborted) setModelAsset({ id: draftId, model: null });
    });
    return () => abort.abort();
  }, [draftId, isUsd, makeRequest]);

  useEffect(() => {
    if (!draftId || imported || !token || access?.owner || busy) return;
    const abort = new AbortController();
    void fetch(`${ROOM_SCAN_API}${draftId}/video`, {
      headers: { Authorization: `Bearer ${token}` }, signal: abort.signal,
    }).then(async (result) => {
      if (!result.ok) throw new Error('เปิดภาพอ้างอิงของประตูไม่ได้');
      return await result.blob();
    }).then((blob) => {
      if (!abort.signal.aborted) setClip(URL.createObjectURL(blob));
    }).catch(() => {
      if (!abort.signal.aborted) setError('โหลดคลิปสำหรับดูตำแหน่งประตูไม่ได้');
    });
    return () => abort.abort();
  }, [access?.owner, busy, draftId, imported, token]);

  useEffect(() => {
    if (!draftId || !previewRevision || !token || access?.owner) return;
    const abort = new AbortController();
    let url: string | undefined;
    void fetch(`${ROOM_SCAN_API}${draftId}/preview`, {
      headers: { Authorization: `Bearer ${token}` }, signal: abort.signal,
    }).then(async (result) => {
      if (!result.ok) throw new Error('เปิดภาพแปลน PDF ไม่ได้');
      return await result.blob();
    }).then((blob) => {
      if (abort.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setRemotePreview({ revision: previewRevision, url });
    }).catch(() => {
      if (!abort.signal.aborted) setError('เปิดภาพแปลน PDF ไม่ได้');
    });
    return () => {
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [access?.owner, draftId, previewRevision, token]);

  async function upload(file: File) {
    setError('');
    if (file.size > SCAN_MAX_BYTES) {
      setError('คลิปต้องมีขนาดไม่เกิน 180 MB');
      return;
    }
    setPending('video');
    setSelectedDoor('');
    setClip(URL.createObjectURL(file));
    try {
      const fresh = await makeRequest<ScanDraft>('upload', { method: 'POST', body: file });
      useDraft(fresh);
      setClip(null);
      setResetKey((key) => key + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'สร้างแปลนจากคลิปไม่ได้');
      setClip(null);
      setSelectedDoor(draft?.scale?.doorId ?? '');
    } finally {
      setPending(null);
    }
  }

  async function uploadPlan(file: File, reference = false) {
    const type = file.name.split('.').at(-1)?.toLowerCase();
    if ((type !== 'pdf' && type !== 'usdz') || (reference && type !== 'pdf')) {
      setError(reference ? 'เลือกไฟล์ Sketch PDF ของห้องเดียวกัน' : 'เลือกไฟล์ USDZ หรือ PDF');
      return;
    }
    if (file.size > PLAN_IMPORT_MAX_BYTES) {
      setError('ไฟล์แปลนต้องมีขนาดไม่เกิน 25 MB');
      return;
    }
    setError('');
    setPending(reference ? 'reference' : 'document');
    try {
      const fresh = await makeRequest<ScanDraft>(reference ? `${draftId}/reference` : `import/${type}`, {
        method: 'POST', body: file, headers: { 'X-Plan-Name': encodeURIComponent(file.name) },
      });
      useDraft(fresh);
      setClip(null);
      setResetKey((key) => key + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'นำเข้าไฟล์แปลนไม่ได้');
    } finally {
      setPending(null);
    }
  }

  const recording = useRoomRecording((file) => { void upload(file); }, setError);
  const locked = busy || Boolean(access?.busy) || recording.recording || recording.requesting;
  const door = draft?.doors.find(({ id }) => id === selectedDoor);
  const scale = imported?.metersPerUnit ?? (draft && doorScale(draft.doors, draft.scale));
  const source = clip ?? (draft && !imported && access?.owner ? `${ROOM_SCAN_API}${draft.id}/video` : null);
  const showDocument = !recording.recording && pending !== 'video' ? imported : undefined;
  const planPreview = previewRevision && draftId && (access?.owner
    ? `${ROOM_SCAN_API}${draftId}/preview?v=${previewRevision}`
    : remotePreview?.revision === previewRevision ? remotePreview.url : null);

  useEffect(() => {
    const player = video.current;
    if (door && player && player.readyState >= 1) {
      player.pause();
      player.currentTime = door.frameSeconds;
    }
  }, [door, source]);

  async function saveScale(event: FormEvent) {
    event.preventDefault();
    if (!draft || !door) return;
    const value = Number(width.replace(',', '.'));
    if (doorScale(draft.doors, { doorId: door.id, widthMeters: value }) === null) {
      setError('ใส่ความกว้างประตูระหว่าง 0.20 ถึง 5 เมตร');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const next = await makeRequest<ScanDraft>(`${draft.id}/scale`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doorId: door.id, widthMeters: value }),
      });
      useDraft(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'ปรับระยะจริงไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function useRoom() {
    if (!draftId || !access?.owner) return;
    setActivating(true);
    setError('');
    try {
      await makeRequest(`${draftId}/activate`, { method: 'POST' });
      location.assign('/camera-twin/');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'ใช้ห้องนี้ใน Camera Twin ไม่ได้');
    } finally {
      setActivating(false);
    }
  }

  async function share() {
    try {
      setError('');
      const result = await makeRequest<{ url: string }>('access', { method: 'POST' });
      setInvite(result.url);
      try {
        await navigator.clipboard.writeText(result.url);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'สร้างลิงก์สแกนไม่ได้');
    }
  }

  return (
    <div className="camera-shell scan-shell">
      <header className="topbar camera-topbar scan-topbar">
        <div className="topbar-left"><BrandMark /><span className="brand-name">Camera Twin</span></div>
        <div className="topbar-right"><a className="btn btn-sm" href="/camera-twin/"><ArrowLeft size={15} aria-hidden="true" /> กลับ Camera Twin</a></div>
      </header>
      <main className="camera-main">
        <div className="camera-overview">
          <div className="camera-heading">
            <h1>สแกนห้องและนำเข้าแปลน</h1>
            <p>ถ่ายคลิปเดินรอบห้อง หรือใช้ไฟล์ USDZ และ Sketch PDF จาก magicplan</p>
          </div>
          {access?.canInvite && (
            <button className="btn" onClick={() => void share()}><Link2 size={16} aria-hidden="true" /> สร้างลิงก์สแกนบนมือถือ</button>
          )}
        </div>
        {invite && <div className="camera-operator scan-invite">
          <label htmlFor="scan-link">{copied ? 'คัดลอกลิงก์แล้ว · ใช้ได้ 1 ชั่วโมง' : 'ลิงก์สำหรับเปิดบนมือถือ · ใช้ได้ 1 ชั่วโมง'}</label>
          <input id="scan-link" className="txt" value={invite} readOnly onFocus={(event) => event.target.select()} />
        </div>}
        {error && <p className="scan-error" role="alert">{error}</p>}
        {access && (
          <>
            <div className="camera-comparison">
              <section className="camera-panel" aria-label="ไฟล์ต้นฉบับและการถ่ายคลิป">
                <div className="camera-panel-head">
                  <h2>{showDocument ? <FileText size={17} aria-hidden="true" /> : <Camera size={17} aria-hidden="true" />} {showDocument ? 'ไฟล์ต้นฉบับ' : recording.recording ? 'กำลังถ่ายห้อง' : 'วิดีโอจากกล้อง'}</h2>
                  {!recording.recording && !showDocument && source && <span className="camera-status">ของจริง</span>}
                  {recording.recording && <span className="scan-clock mono">{formatTime(recording.seconds)}</span>}
                </div>
                <div hidden={Boolean(showDocument)} className="scan-image" style={source && !recording.recording ? { aspectRatio: aspect, width: `min(100%, ${aspect * 58}vh)` } : undefined}>
                  <video ref={recording.liveVideo} muted playsInline autoPlay hidden={!recording.recording} />
                  {source && !recording.recording && (
                    <video ref={video} src={source} playsInline muted controls={!door}
                      onLoadedMetadata={event => {
                        const element = event.currentTarget;
                        if (element.videoWidth && element.videoHeight) setAspect(element.videoWidth / element.videoHeight);
                        if (door) element.currentTime = door.frameSeconds;
                      }} />
                  )}
                  {door && source && !recording.recording && (
                    <svg className="scan-door-box" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <rect x={door.imageBox[0] * 100} y={door.imageBox[1] * 100}
                        width={(door.imageBox[2] - door.imageBox[0]) * 100} height={(door.imageBox[3] - door.imageBox[1]) * 100} />
                    </svg>
                  )}
                  {!source && !recording.recording && (
                    <div className="camera-empty">
                      <ScanLine size={28} aria-hidden="true" />
                      <span>ถือมือถือแนวนอน เริ่มจากมุมห้อง แล้วเดินช้า ๆ ให้เห็นผนังต่อเนื่อง</span>
                    </div>
                  )}
                </div>
                {showDocument && (
                  <div className="scan-document">
                    <span>{showDocument.name}</span>
                    {showDocument.referenceName && <span>PDF อ้างอิง {showDocument.referenceName}</span>}
                    {planPreview && <img src={planPreview} alt={showDocument.referenceName ? 'หน้าแรกของ PDF อ้างอิง' : 'หน้าแรกของแปลน PDF'} />}
                  </div>
                )}
                <div className="scan-actions">
                  <input ref={planInput} type="file" hidden accept=".usdz,.pdf,model/vnd.usdz+zip,application/pdf" aria-label="ไฟล์แปลน USDZ หรือ PDF"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void uploadPlan(file);
                    }} />
                  <input ref={referenceInput} type="file" hidden accept=".pdf,application/pdf" aria-label="PDF อ้างอิงสเกล"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void uploadPlan(file, true);
                    }} />
                  <input ref={fileInput} type="file" hidden accept="video/*,.mov,.mp4,.webm,.mkv" aria-label="คลิปเดินถ่ายห้อง"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void upload(file);
                    }} />
                  {recording.recording ? (
                    <button className="btn btn-primary" onClick={recording.stop}><Square size={15} aria-hidden="true" /> จบการถ่าย</button>
                  ) : (
                    <button className="btn btn-primary" disabled={locked} onClick={() => { setError(''); void recording.start(); }}>
                      <Camera size={16} aria-hidden="true" /> {recording.requesting ? 'กำลังเปิดกล้อง…' : draft ? 'ถ่ายคลิปใหม่' : 'เริ่มถ่ายรอบห้อง'}
                    </button>
                  )}
                  <button className="btn" disabled={locked} onClick={() => fileInput.current?.click()}><Upload size={15} aria-hidden="true" /> เลือกคลิปที่ถ่ายไว้</button>
                  <button className="btn" disabled={locked} onClick={() => planInput.current?.click()}><FileText size={15} aria-hidden="true" /> นำเข้า USDZ หรือ PDF</button>
                  {showDocument?.type === 'usdz' && <button className="btn" disabled={locked} onClick={() => referenceInput.current?.click()}>เทียบสเกลด้วย PDF</button>}
                </div>
              </section>

              <section className="camera-panel" aria-label="แปลนห้องสามมิติ">
                <div className="camera-panel-head">
                  <h2><ScanLine size={17} aria-hidden="true" /> {isUsd ? 'โมเดล 3D จาก USDZ' : 'แปลนจำลอง 3D'}</h2>
                  <div className="scan-view-actions">
                    {access.owner && imported && draft?.plan && (!isUsd || usdModel) && <button className="btn btn-primary btn-sm" disabled={locked || activating} onClick={() => void useRoom()}>
                      {activating ? 'กำลังเปิดห้อง…' : 'ใช้ห้องนี้'}
                    </button>}
                    {usdModel && <button className="btn btn-sm" aria-pressed={transparentWalls} onClick={() => setTransparentWalls((value) => !value)}>
                      ผนังโปร่ง
                    </button>}
                    {draft?.plan && (!isUsd || usdModel) && <button className="btn btn-sm" onClick={() => setResetKey((key) => key + 1)}>
                      <RotateCcw size={14} aria-hidden="true" /> คืนมุมมอง
                    </button>}
                  </div>
                </div>
                <div className="viewport">
                  {busy || access.busy ? (
                    <div className="camera-empty" role="status"><span>{pending === 'reference' ? 'กำลังเทียบสเกลกับ PDF…'
                      : pending === 'document' ? 'กำลังอ่านไฟล์แปลน…' : 'กำลังสร้างแปลน…'}</span></div>
                  ) : isUsd && !usdModel ? (
                    <div className="camera-empty" role={usdModel === null ? 'alert' : 'status'}>
                      <span>{usdModel === null ? 'เปิดรูปทรงจาก USDZ ไม่ได้ ลองรีเฟรชหรือนำเข้าอีกครั้ง' : 'กำลังเปิดรูปทรงจาก USDZ…'}</span>
                    </div>
                  ) : draft?.plan ? (
                    <FloorPlanCanvas plan={draft.plan} doors={draft.doors} outlineOnly={Boolean(imported)} resetKey={`${draft.id}:${resetKey}`}
                      usdModel={usdModel ?? undefined} transparentWalls={transparentWalls} />
                  ) : <div className="camera-empty"><span>{imported ? 'แสดง PDF ต้นฉบับด้านข้าง ใช้ Sketch PDF ของหนึ่งห้องจาก magicplan เพื่อสร้างแปลน 3D'
                    : draft ? 'คลิปนี้ยังมีข้อมูลไม่พอสร้างแปลน' : 'เลือกคลิปหรือไฟล์แปลนเพื่อดูในมุม 3D'}</span></div>}
                </div>
                {draft?.plan && !busy && (
                  <div className="camera-panel-foot">
                    <span className="scan-measurement">{scale ? `ขนาดประมาณ ${((draft.plan.bounds[2] - draft.plan.bounds[0]) * scale).toFixed(2)} × ${((draft.plan.bounds[3] - draft.plan.bounds[1]) * scale).toFixed(2)} ม.`
                      : imported ? 'สัดส่วนจากโมเดล · ใช้ PDF ของห้องเดียวกันเพื่อเทียบขนาด' : 'แสดงสัดส่วนโดยประมาณ'}</span>
                    {imported?.areaMeters != null && <span>พื้นที่ตาม PDF {imported.areaMeters.toFixed(2)} ตร.ม.</span>}
                    {draft.issues.includes('walls') && <span>เส้นประคือแนวที่ควรถ่ายเพิ่ม</span>}
                  </div>
                )}
              </section>
            </div>

            {draft?.issues.length && !busy ? (
              <section className="camera-operator scan-issues" aria-label="ส่วนที่ควรถ่ายเพิ่ม">
                <div className="camera-operator-summary">
                  <h2>ส่วนที่ควรถ่ายเพิ่ม</h2>
                  <ul>{draft.issues.map((issue) => <li key={issue}>{issueText[issue]}</li>)}</ul>
                </div>
              </section>
            ) : null}

            {draft?.plan && !imported && !busy && (
              <section className="camera-operator scan-scale" aria-label="ขนาดห้องเป็นเมตร">
                <div className="camera-operator-summary">
                  <h2>ขนาดห้องเป็นเมตร</h2>
                  <p>{draft.doors.length ? 'เลือกประตูที่เห็นขอบครบทั้งสองด้าน แล้วใส่ความกว้างจริงที่วัดไว้' : 'แปลนนี้ใช้สัดส่วนจากภาพ ถ้าต้องการขนาดเป็นเมตร ให้ถ่ายให้เห็นขอบประตูทั้งสองด้าน'}</p>
                </div>
                {draft.doors.length > 0 && (
                  <form className="scan-actions" onSubmit={(event) => void saveScale(event)}>
                    <select className="camera-angle-select" aria-label="ประตูอ้างอิง" value={selectedDoor}
                      onChange={(event) => setSelectedDoor(event.target.value)}>
                      <option value="">เลือกประตู</option>
                      {draft.doors.map((item, index) => <option key={item.id} value={item.id}>ประตู {index + 1} · {formatTime(item.frameSeconds)}</option>)}
                    </select>
                    <input className="txt scan-width" inputMode="decimal" value={width} aria-label="ความกว้างประตูเป็นเมตร"
                      placeholder="เมตร เช่น 0.90" onChange={(event) => setWidth(event.target.value)} />
                    <button className="btn btn-primary" disabled={!door || !width.trim() || saving || locked}>
                      {saving ? 'กำลังบันทึก…' : 'ปรับเป็นเมตร'}
                    </button>
                  </form>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
