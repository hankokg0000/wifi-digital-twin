import { Cctv, Download, Focus, Pause, Play, Radio, RotateCcw, Upload, Video } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAMERA_STEP_MS } from '../../core/camera/feed';
import type { UsdRoomModel } from '../../core/camera/plan-import';
import {
  ROOM_MONITOR_API, ROOM_SETUP_PAGE, simulateDemoFrames, wifiHighlightsRoom,
  type BoardPlacement, type MonitorDemo, type MonitorRoom, type MonitorStatus,
} from '../../core/camera/room-monitor';
import type { FloorPoint } from '../../core/camera/tracking';
import { BrandMark } from '../shell/BrandMark';
import { CameraVideo, TrackedBoxes } from './CameraVideo';
import { CameraViewer } from './CameraViewer';
import { FloorPlanCanvas } from './GeneratedSceneView';
import { requireCameraJson } from './useOfficeEditor';

async function monitorRequest<T>(route: string, options?: RequestInit) {
  return requireCameraJson<T>(await fetch(ROOM_MONITOR_API + route, options));
}

export function CameraHome() {
  const [room, setRoom] = useState<MonitorRoom | null>();
  useEffect(() => {
    if (new URLSearchParams(location.search).has('legacy') ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
      setRoom(null);
      return;
    }
    const controller = new AbortController();
    void monitorRequest<MonitorRoom | null>('room', { signal: controller.signal }).then((active) => {
      if (!controller.signal.aborted) setRoom(active);
    }).catch(() => {
      if (!controller.signal.aborted) setRoom(null);
    });
    return () => controller.abort();
  }, []);
  if (room === undefined) return <main className="camera-main" role="status">กำลังเปิด Camera Twin…</main>;
  return room ? <RoomMonitor room={room} /> : <CameraViewer />;
}

function BoardMap({ room, placement }: { room: MonitorRoom; placement: BoardPlacement }) {
  const [left, front, right, back] = room.plan.bounds;
  const span = Math.max(right - left, back - front);
  const padding = span * 0.055;
  const size = span * 0.033;
  const pointList = (points: readonly FloorPoint[]) => points.map((point) => point.join(',')).join(' ');
  const [ax, az] = placement.points[0];
  const [bx, bz] = placement.points[1];
  const [cx, cz] = placement.points[2];
  const [dx, dz] = placement.points[3];
  const center = [(ax + bx + cx + dx) / 4, (az + bz + cz + dz) / 4] as const;
  return (
    <svg className="monitor-board-map" role="img" aria-label="ตำแหน่งแผ่นบนแปลนมุมบน"
      viewBox={`${left - padding} ${front - padding} ${right - left + 2 * padding} ${back - front + 2 * padding}`}>
      <polygon points={pointList(room.plan.visibleFloor)} fill="#414c62" stroke="#8390a9" strokeWidth={size * 0.18} />
      <polygon points={pointList(placement.outline)} fill="#f4bb73" stroke="#fff0da" strokeWidth={size * 0.18} />
      {placement.points.map(([x, z], i) => (
        <text key={i} x={x + (x - center[0]) * 0.63} y={z + (z - center[1]) * 0.63} fill="#fff0da"
          fontSize={size * 0.5} textAnchor="middle" dominantBaseline="middle">{'ABCD'[i]}</text>
      ))}
    </svg>
  );
}

const wifiText = {
  idle: 'ไม่มีการเคลื่อนไหว',
  motion: 'พบการเคลื่อนไหว',
  disconnected: 'ยังไม่ได้รับข้อมูล CSI จาก ESP32',
  'baseline-needed': 'เชื่อมต่อแล้ว · รอบันทึกช่วงห้องนิ่ง',
  calibrating: 'กำลังบันทึกช่วงห้องนิ่ง 15 วินาที',
};

function RoomMonitor({ room }: { room: MonitorRoom }) {
  const [status, setStatus] = useState<MonitorStatus>();
  const [model, setModel] = useState<UsdRoomModel | null>();
  const [demo, setDemo] = useState<{ id: string; data: MonitorDemo } | null>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [transparent, setTransparent] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const demoId = status?.demo?.id ?? null;
  const live = status?.camera === 'live';

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await monitorRequest<MonitorStatus>('status', { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (result.roomId !== room.id) {
          location.reload();
          return;
        }
        setStatus(result);
      } catch {
        if (!controller.signal.aborted) setStatus(undefined);
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 130);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [room.id]);

  useEffect(() => {
    if (!room.modelUrl) return;
    const controller = new AbortController();
    void fetch(room.modelUrl, { signal: controller.signal }).then(requireCameraJson<UsdRoomModel>).then((data) => {
      if (!controller.signal.aborted) setModel(data);
    }).catch(() => {
      if (!controller.signal.aborted) setModel(null);
    });
    return () => controller.abort();
  }, [room.modelUrl]);

  useEffect(() => {
    if (!demoId) return;
    const controller = new AbortController();
    void monitorRequest<MonitorDemo>(`observations/${demoId}`, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setDemo({ id: demoId, data });
    }).catch(() => {
      if (!controller.signal.aborted) setError('เปิดผลติดตามจากคลิปเดโมไม่ได้');
    });
    return () => controller.abort();
  }, [demoId]);

  async function change(route: string, file?: File) {
    setPending(true);
    setError('');
    try {
      const result = await monitorRequest<MonitorStatus>(route, {
        method: 'POST', body: file,
        headers: file ? { 'X-Camera-File': encodeURIComponent(file.name) } : undefined,
      });
      setStatus(result);
      if (file) {
        setElapsed(0);
        setDuration(0);
        setPaused(false);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'ตั้งค่า Camera Twin ไม่สำเร็จ');
    } finally {
      setPending(false);
    }
  }

  const updateTime = useCallback((time: number) => setElapsed(Math.max(0, time)), []);
  const demoFrames = useMemo(() => demo?.id === demoId ? simulateDemoFrames(demo.data.frames, room.plan) : [], [demo, demoId, room.plan]);
  const simulating = !live && Boolean(status?.demo);
  const observations = live ? status?.frame?.observations ?? []
    : demoFrames[Math.min(demoFrames.length - 1, Math.max(0, Math.floor(elapsed / CAMERA_STEP_MS)))] ?? [];
  const cameraEvidence = live ? observations : [];
  const highlight = Boolean(status && wifiHighlightsRoom(status.wifi.state, cameraEvidence));
  const placement = live ? status?.placement : null;
  const waitingForPosition = status?.calibration !== 'ready';
  const cameraFeedback = live
    ? status?.liveState === 'ready' ? (observations.length ? 'กล้องตรวจพบคนในภาพ' : 'กล้องยังไม่พบคนในภาพ')
      : status?.liveState === 'connecting' ? 'กำลังเชื่อมต่อกล้อง' : 'กล้องยังไม่ส่งภาพ'
    : status?.demo ? (observations.length ? 'พบคนในคลิปเดโม' : 'ยังไม่พบคนในเฟรมนี้') : 'เลือกคลิปมุมคงที่เพื่อเริ่มเดโม';

  return (
    <div className="camera-shell room-monitor">
      <header className="topbar camera-topbar">
        <div className="topbar-left"><BrandMark /><span className="brand-name">Camera Twin</span></div>
        <div className="topbar-right monitor-view-actions">
          <a className="btn btn-sm" href={ROOM_SETUP_PAGE}>นำเข้าห้อง</a>
          <a className="btn btn-sm" href="/camera-twin/?legacy=1">คลิปเดิม</a>
        </div>
      </header>
      <main className="camera-main">
        <div className="camera-overview">
          <div className="camera-heading"><h1 title={room.title}>{room.title.replace(/\.[^.]+$/, '')}</h1></div>
          <form className="monitor-view-actions" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="monitor-camera">แหล่งภาพ</label>
            <select id="monitor-camera" className="camera-angle-select" value={status?.camera ?? 'demo'} disabled={!status || pending}
              onChange={(event) => void change('camera/' + event.target.value)}>
              <option value="demo">คลิปเดโม</option>
              <option value="live" disabled={!status?.liveAvailable}>กล้องสด</option>
            </select>
            <input type="file" ref={uploadInput} hidden accept="video/*,.mp4,.mov,.webm,.mkv" aria-label="ไฟล์คลิปเดโม"
              onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void change('upload', file); }} />
            <button type="button" className="btn" disabled={!status || pending || status.uploading} onClick={() => uploadInput.current?.click()}>
              <Upload size={15} aria-hidden="true" /> {status?.uploading ? 'กำลังวิเคราะห์คลิป…' : 'อัปโหลดคลิปเดโม'}
            </button>
          </form>
        </div>
        {error && <p className="monitor-error" role="alert">{error}</p>}
        <div className="camera-comparison">
          <section className="camera-panel" aria-label="ภาพจากกล้อง">
            <div className="camera-panel-head">
              <h2><Video size={17} aria-hidden="true" /> {live ? 'ภาพสด' : 'คลิปเดโม'}</h2>
              <span className="monitor-badge">{live ? 'ของจริง' : 'เล่นย้อนหลัง'}</span>
            </div>
            {live ? (
              <div className="camera-video viewport monitor-camera-frame">
                {status?.frame ? <>
                  <img alt="ภาพสดจากกล้อง" src={`data:image/jpeg;base64,${status.frame.jpeg}`} />
                  <svg className="camera-overlay" viewBox="0 0 960 540" aria-hidden="true"><TrackedBoxes observations={observations} /></svg>
                </> : <div className="camera-empty"><Cctv size={24} aria-hidden="true" />{cameraFeedback}</div>}
              </div>
            ) : (
              <CameraVideo key={demoId} url={status?.demo?.url ?? null} video={video} track={null}
                paused={paused} elapsedMs={elapsed} followsServer={false} showOverlay showRegion={false}
                onTime={updateTime} onDuration={setDuration} sceneObservations={observations} simulatedPositions={simulating}
                empty={status?.uploading ? 'กำลังเตรียมคลิปเดโม' : 'เลือกคลิปมุมคงที่เพื่อเริ่มเดโม'} />
            )}
            {status?.demo && !live && (
              <div className="camera-transport monitor-player">
                <button className="btn btn-sm" onClick={() => setPaused((value) => !value)}>
                  {paused ? <Play aria-hidden="true" size={14} /> : <Pause aria-hidden="true" size={14} />}{paused ? 'เล่น' : 'หยุด'}
                </button>
                <input className="camera-scrub" aria-label="ตำแหน่งในคลิป" type="range" min={0} max={Math.max(1, duration)}
                  step={40} value={Math.min(elapsed, Math.max(1, duration))} onChange={(event) => {
                    const seconds = Number(event.target.value);
                    if (video.current) video.current.currentTime = seconds / 1000;
                    setElapsed(seconds);
                  }} />
              </div>
            )}
            <div className="camera-panel-foot monitor-footer">
              {cameraFeedback}{!status?.liveAvailable && !live && <span>กล้องสดรอการตั้งค่าบน Mac</span>}
            </div>
          </section>

          <section className="camera-panel" aria-label="มุมมอง 3D ของห้องที่เลือก" data-wifi-motion={highlight}
            data-position-source={simulating ? 'simulated' : live && !waitingForPosition ? 'camera' : undefined}>
            <div className="camera-panel-head">
              <h2><Focus size={17} aria-hidden="true" /> มุมมอง 3D</h2>
              <div className="monitor-view-actions">
                {simulating && <span className="monitor-badge monitor-simulated-position">ตำแหน่งจำลองจากคลิป</span>}
                {model && <button className="btn btn-sm" aria-pressed={transparent} onClick={() => setTransparent((value) => !value)}>ผนังโปร่ง</button>}
                <button className="btn btn-sm" onClick={() => setResetKey((key) => key + 1)}><RotateCcw size={14} aria-hidden="true" /> คืนมุมมอง</button>
              </div>
            </div>
            <div className="viewport">
              {room.modelUrl && !model ? (
                <div className="camera-empty"><span>{model === null ? 'เปิดโมเดล USDZ ไม่ได้' : 'กำลังเปิดโมเดล…'}</span></div>
              ) : <FloorPlanCanvas plan={room.plan} outlineOnly usdModel={model ?? undefined} transparentWalls={transparent}
                observations={observations} simulatedPositions={simulating} highlightMotion={highlight} resetKey={`${room.id}:${resetKey}`} />}
            </div>
            <div className="camera-panel-foot monitor-footer">
              {highlight ? 'Wi‑Fi พบการเคลื่อนไหว · กล้องยังไม่ยืนยัน' : !live
                ? simulating ? 'ตัวคนสีเขียวฟ้าขยับตามตำแหน่งโดยประมาณจากภาพ' : 'เลือกคลิปเดโมเพื่อแสดงตำแหน่งจำลอง'
                : waitingForPosition ? 'รอปรับเทียบก่อนแสดงตำแหน่งจากกล้อง' : 'ตำแหน่งจากกล้องที่ปรับเทียบแล้ว'}
              {highlight && <span className="monitor-badge">{status?.wifi.source === 'simulated' ? 'จำลอง' : 'ของจริง'}</span>}
            </div>
          </section>
        </div>

        <section className="camera-operator" aria-label="ตรวจจับ Wi-Fi">
          <div className="camera-operator-summary">
            <h2><Radio size={16} aria-hidden="true" /> ตรวจจับ Wi‑Fi <span className="monitor-badge">{status?.wifi.source === 'esp32' ? 'ของจริง' : 'จำลอง'}</span></h2>
            <p>{status ? wifiText[status.wifi.state] : 'กำลังเชื่อมต่อระบบ'}{status?.wifi.feedback ? ' · ' + status.wifi.feedback : ''}</p>
          </div>
          <div className="monitor-view-actions">
            <select className="camera-angle-select" aria-label="แหล่งข้อมูล Wi-Fi" disabled={!status || pending}
              value={status?.wifi.source ?? 'simulated'} onChange={(event) => void change('wifi/' + event.target.value)}>
              <option value="simulated">จำลอง</option><option value="esp32">ESP32 ผ่าน USB</option>
            </select>
            {status?.wifi.source === 'simulated' && <button className="btn" disabled={pending} onClick={() => void change('wifi/test')}>จำลองการเคลื่อนไหว</button>}
            {status?.wifi.source === 'esp32' && <button className="btn" disabled={pending || status.wifi.state === 'disconnected' || status.wifi.state === 'calibrating'}
              onClick={() => void change('wifi/baseline')}>บันทึกช่วงห้องนิ่ง</button>}
          </div>
        </section>

        {live && <section className="camera-operator monitor-calibration" aria-label="ปรับเทียบกล้องอัตโนมัติ">
          <div className="camera-operator-summary">
            <h2>ปรับเทียบกล้องกับห้อง</h2>
            {status?.calibration === 'ready' ? <p>บันทึกตำแหน่งกล้องแล้ว ตั้งใหม่เมื่อย้ายกล้องหรือเปลี่ยนมุม</p> :
              !placement ? <p>ต้องมีขนาดเป็นเมตรและมุมที่วางแผ่นได้ เปิดหน้าสแกนเพื่อเทียบสเกลด้วย Sketch PDF</p> :
              <p>{status?.calibration === 'looking' ? 'กำลังอ่านแผ่น ให้เห็น QR ครบทั้งสี่ช่องในภาพสด'
                : 'พิมพ์แนวนอนขนาดจริง 100% ตัดตามกรอบ แล้ววาง A–B ชิดผนังตามแปลน'}</p>}
            <div className="monitor-view-actions">
              {placement && <a className="btn" href="/camera-twin/floor-board.svg" target="_blank" rel="noreferrer"><Download size={15} aria-hidden="true" /> แผ่นอ้างอิง A4</a>}
              {Boolean(status && status.placements > 1 && waitingForPosition) && <button className="btn" disabled={pending} onClick={() => void change('board/next')}>ลองมุมถัดไป</button>}
              {placement && <button className="btn btn-primary" disabled={pending || status?.liveState !== 'ready'}
                onClick={() => void change('board/align')}>{status?.calibration === 'ready' ? 'ตั้งกล้องใหม่' : 'เริ่มอ่านแผ่น'}</button>}
            </div>
          </div>
          {placement && <BoardMap room={room} placement={placement} />}
        </section>}
      </main>
    </div>
  );
}
