import { ArrowLeft, Box, Camera, ChevronDown, Maximize2, Minimize2, RotateCcw, Settings2, Square, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { replaySnapshot, type CameraDraft } from '../../core/camera/feed';
import { OFFICE_DEMO_PATH } from '../../core/camera/office';
import { defaultOfficeLayout, readOfficeLayout, type OfficeChair } from '../../core/camera/office-layout';
import { ROOM_SETUP_PAGE } from '../../core/camera/room-monitor';
import { OFFICE_FLOOR } from '../../core/camera/site-city';
import { SITE_MEDIA_PATH, type DemoArea } from '../../core/camera/site-demo';
import { CameraVideo, TrackedBoxes } from '../camera/CameraVideo';
import { FloorPlanCanvas, GeneratedSceneView } from '../camera/GeneratedSceneView';
import { OfficeScene, type OfficeView } from '../camera/OfficeScene';
import { SceneBoundary } from '../camera/SceneBoundary';
import { requireCameraJson } from '../camera/useOfficeEditor';
import { BrandMark } from '../shell/BrandMark';
import { useLiveRoom } from './useLiveRoom';
import { useIndoorUpload } from './useIndoorUpload';
import { IndoorWifiPanel, indoorOperator, type useIndoorWifi } from './IndoorWifi';
import { PublicIndoorWifi } from './PublicIndoorWifi';

type OfficeDemo = Pick<CameraDraft, 'media' | 'replay'>;
type IndoorSource = 'demo' | 'upload' | 'live';
const presentationOnly = import.meta.env.VITE_INDOOR_DEMO_ONLY === '1';
const demoAssets = presentationOnly ? '/indoor-twin/office-demo' : OFFICE_DEMO_PATH;
const storageKey = (id: string) => `wdt.indoor.office-chairs.${id}`;

function preferredVideo(): IndoorSource {
  return !presentationOnly && new URLSearchParams(location.search).get('source') === 'upload' ? 'upload' : 'demo';
}

function rememberVideo(value: IndoorSource) {
  const url = new URL(location.href);
  if (value === 'upload') url.searchParams.set('source', 'upload');
  else url.searchParams.delete('source');
  history.replaceState(null, '', url);
}

function storedChairs(id: string): OfficeChair[] {
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? readOfficeLayout({ ...defaultOfficeLayout(), chairs: JSON.parse(raw) })?.chairs ?? [] : [];
  } catch {
    return [];
  }
}

export function IndoorArea({ area, onBack, wifi }: {
  area: DemoArea; onBack: () => void; wifi: ReturnType<typeof useIndoorWifi>;
}) {
  const office = area.id === 'office';
  const canManage = indoorOperator;
  const assetPath = office ? demoAssets : `${SITE_MEDIA_PATH}/${area.id}`;
  const [selectedSource, setSelectedSource] = useState(preferredVideo);
  const [sample, setSample] = useState<OfficeDemo | null>();
  const [view, setView] = useState<OfficeView>('perspective');
  const [viewVersion, setViewVersion] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [chairs, setChairs] = useState<OfficeChair[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { clip, uploading, error: uploadError, upload } = useIndoorUpload(canManage, area.id);
  const source = selectedSource === 'upload' && !clip ? 'demo' : selectedSource;
  const live = source === 'live';
  const camera = useLiveRoom(live, canManage && office);
  const observed = wifi.observedRoom === area.id;
  const { room, model, status } = camera;

  useEffect(() => {
    const abort = new AbortController();
    void fetch(`${assetPath}/replay.json`, { signal: abort.signal, cache: 'no-cache' })
      .then(requireCameraJson<OfficeDemo>)
      .then((demo) => {
        if (abort.signal.aborted) return;
        if (!demo?.replay?.sceneFrames?.length) {
          setSample(null);
          return;
        }
        if (office) setChairs(storedChairs(demo.media.id));
        setSample(demo);
      }).catch(() => { if (!abort.signal.aborted) setSample(null); });
    return () => abort.abort();
  }, [assetPath, office]);

  const activeClip = source === 'upload' ? clip : sample;
  const generated = source === 'upload' ? clip?.scene : undefined;
  const duration = activeClip ? activeClip.replay.frames.length * activeClip.replay.stepMs : 0;
  const demoFrame = activeClip ? replaySnapshot(activeClip.replay, 0, Math.min(elapsed, duration - 1)) : null;
  const observations = demoFrame?.sceneObservations ?? [];
  const layout = { ...defaultOfficeLayout(), chairs };
  const updateTime = useCallback((ms: number) => {
    setElapsed(Math.max(0, Math.round(ms)));
  }, []);

  function changeView(next: OfficeView) {
    setView(next);
    setViewVersion((value) => value + 1);
  }

  function changeSource(value: IndoorSource) {
    if (value === selectedSource) return;
    setElapsed(0);
    setSelectedSource(value);
    rememberVideo(value);
  }

  async function changeVideo(file: File) {
    if (!await upload(file)) return;
    rememberVideo('upload');
    setElapsed(0);
    changeView('perspective');
    setSelectedSource('upload');
  }

  const positionNote = live ? status?.calibration === 'ready' ? 'ตำแหน่งจากกล้อง · ของจริง' : 'ปรับเทียบก่อนแสดงตำแหน่ง'
    : source === 'demo' && area.seats ? 'ตำแหน่งที่นั่งจำลอง · จับคู่ตามสีในวิดีโอ'
      : generated ? 'ผังและตำแหน่งประมาณจากวิดีโอ' : 'ตำแหน่งประมาณจากวิดีโอ';
  const liveFrame = status?.frame;
  const liveError = camera.error || (status?.liveState === 'offline' ? 'ยังไม่ได้รับภาพจากกล้อง' : '');
  const cameraPage = room ? '/camera-twin/' : ROOM_SETUP_PAGE;

  return (
    <div className="indoor-shell">
      <header className="indoor-header">
        <div className="indoor-brand">
          <button type="button" className="indoor-button indoor-back" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" /><span>ภาพรวมไซต์</span>
          </button>
          <BrandMark />
          <strong>Indoor Twin</strong>
          <a href="/">WiFi Digital Twin</a>
        </div>
        {!canManage ? (
          <span className="indoor-select"><Camera size={16} aria-hidden="true" />วิดีโอ</span>
        ) : <div className="indoor-source">
          <input type="file" ref={fileInput} hidden accept="video/*,.mp4,.mov,.webm,.mkv" aria-label="ไฟล์วิดีโอ"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void changeVideo(file);
            }} />
          <button type="button" className="indoor-button" disabled={uploading}
            onClick={() => fileInput.current?.click()}><Upload size={16} aria-hidden="true" /> ใช้วิดีโอใหม่</button>
          <label className="indoor-select">
            <Camera size={16} aria-hidden="true" />
            <select aria-label="แหล่งภาพ" value={source} disabled={uploading}
              onChange={(event) => changeSource(event.target.value as IndoorSource)}>
              <option value="demo">วิดีโอประจำห้อง</option>
              {clip && <option value="upload">วิดีโอที่อัปโหลด</option>}
              {office && <option value="live">กล้องสด</option>}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          {office && <a className="indoor-button" href={cameraPage} aria-label="ตั้งค่ากล้อง">
            <Settings2 size={16} aria-hidden="true" /><span>ตั้งค่ากล้อง</span>
          </a>}
        </div>}
      </header>

      <main className="indoor-stage">
        <div className="indoor-info">
          <p className="indoor-floor-context">ชั้น {OFFICE_FLOOR}</p>
          <h1>{live ? room?.title.replace(/\.[^.]+$/, '') ?? 'มุมมองกล้องสด'
            : generated ? clip?.media.title.replace(/\.[^.]+$/, '') : area.name}</h1>
          <p className="indoor-position" data-live={live}>{positionNote}</p>
          {uploading && <p className="indoor-upload-note" role="status">กำลังวิเคราะห์วิดีโอและสร้างผัง 3D…</p>}
          {uploadError && !uploading && <p className="indoor-upload-note" role="alert">{uploadError}</p>}
        </div>

        <section className="indoor-scene" aria-label="มุมมอง 3D" data-motion={observed}
          data-motion-source={observed ? 'observed' : undefined}>
          <SceneBoundary key={source}>
            {generated ? (
              <GeneratedSceneView scene={generated} observations={observations} resetKey={viewVersion}
                simulatedPositions topView={view === 'plan'} highlightMotion={observed} wifiPlacement motionObserved={observed} />
            ) : !office ? (
              <FloorPlanCanvas plan={area.plan} tone={area.tone} observations={observations}
                resetKey={String(viewVersion)} topView={view === 'plan'} highlightMotion={observed}
                wifiPlacement motionObserved={observed} simulatedPositions />
            ) : !live ? (
              <OfficeScene track={null} area={null} paused={false} resetKey={viewVersion} view={view}
                demoObservations={observations} showRegion={false} layout={layout}
                highlightMotion={observed} wifiPlan={area.plan} motionObserved={observed} />
            ) : room ? (
              <FloorPlanCanvas plan={room.plan} usdModel={model} outlineOnly
                observations={status?.calibration === 'ready' ? liveFrame?.observations : undefined}
                resetKey={`${room.id}:${viewVersion}`} topView={view === 'plan'} highlightMotion={observed}
                wifiPlacement motionObserved={observed} />
            ) : (
              <div className="indoor-no-room">
                <Box size={27} aria-hidden="true" />
                {camera.error ? <a className="indoor-button" href={cameraPage}>ตั้งค่าห้องและกล้อง</a> : <p>กำลังเปิดห้อง</p>}
              </div>
            )}
          </SceneBoundary>
        </section>

        <div className="indoor-tools">
          <button type="button" aria-label="มุมเฉียง 3D" title="มุมเฉียง 3D" aria-pressed={view === 'perspective'}
            className="indoor-button" onClick={() => changeView('perspective')}><Box size={18} /></button>
          <button type="button" aria-label="มุมบน" title="มุมบน" aria-pressed={view === 'plan'}
            className="indoor-button" onClick={() => changeView('plan')}><Square size={17} /></button>
          <button type="button" aria-label="คืนมุมเปิดเดโม" title="คืนมุมเปิดเดโม"
            className="indoor-button" onClick={() => changeView('perspective')}><RotateCcw size={17} /></button>
          {observed && <output className="indoor-observed">พบการเคลื่อนไหว · ของจริง</output>}
        </div>

        {canManage && <IndoorWifiPanel roomId={area.id} wifi={wifi} />}
        {wifi.viewingPublic && <PublicIndoorWifi snapshot={wifi.publicSnapshot} roomId={area.id} />}
        <aside className={`indoor-camera${expanded ? ' expanded' : ''}`} aria-label="พรีวิวภาพ">
          <div className="indoor-camera-head">
            <span><Camera size={15} aria-hidden="true" />{live ? 'กล้องสด' : 'วิดีโอ'}</span>
            <button type="button" className="indoor-button" aria-label={expanded ? 'ย่อภาพ' : 'ขยายภาพ'}
              onClick={() => setExpanded((value) => !value)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          </div>
          {live ? (
            <div className="camera-video viewport">
              {liveFrame ? <>
                <img className="indoor-live-image" alt="ภาพสดจากกล้อง" src={`data:image/jpeg;base64,${liveFrame.jpeg}`} />
                <svg className="camera-overlay" viewBox="0 0 960 540" aria-hidden="true">
                  <TrackedBoxes observations={liveFrame.observations} />
                </svg>
              </> : <div className="camera-empty" role="status">{liveError || 'กำลังเชื่อมต่อกล้อง'}</div>}
            </div>
          ) : (
            <>
              <CameraVideo key={activeClip?.media.id} url={activeClip?.media.url ?? null} video={video} track={null} paused={false}
                elapsedMs={elapsed} followsServer={false} showOverlay showRegion={false} simulatedPositions
                sceneObservations={observations} onTime={updateTime}
                empty={sample === null ? 'ยังไม่มีวิดีโอของพื้นที่นี้' : 'กำลังเปิดวิดีโอ'} />
              {observations.some(person => !person.position) &&
                <p className="indoor-camera-note">แสดงกรอบในวิดีโอเมื่อภาพยังระบุตำแหน่งในผังไม่ได้</p>}
              {source === 'demo' && area.credit && <a className="indoor-credit" href={area.credit.url} target="_blank" rel="noreferrer">
                วิดีโอโดย {area.credit.author} · Pexels
              </a>}
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
