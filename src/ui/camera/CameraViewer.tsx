import { Check, CircleDot, Focus, Pause, Play, RadioTower, RotateCcw, Upload, Video } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CAMERA_GENERATE_SCENE_PATH, CAMERA_OPERATOR_PATH, CAMERA_PUBLISH_PATH, CAMERA_REANALYZE_PATH, CAMERA_SNAPSHOT_PATH, CAMERA_STEP_MS, CAMERA_STREAM_PATH,
  CAMERA_UPLOAD_PATH, CAMERA_VIDEO_FPS, replaySnapshot, type CameraDraft, type CameraOperator, type CameraSnapshot,
} from '../../core/camera/feed';
import { OFFICE_DEMO_PATH } from '../../core/camera/office';
import { ROOM_SCAN_PAGE } from '../../core/camera/room-scan';
import { BrandMark } from '../shell/BrandMark';
import { GeneratedSceneView } from './GeneratedSceneView';
import { CameraVideo } from './CameraVideo';
import { OfficeCalibrationMap } from './OfficeCalibrationMap';
import { OfficeEditor } from './OfficeEditor';
import { OfficeScene } from './OfficeScene';
import { SceneBoundary } from './SceneBoundary';
import { requireCameraJson, useOfficeEditor } from './useOfficeEditor';

const firstSnapshot: CameraSnapshot = {
  source: 'replay', state: 'waiting', track: null, area: null, elapsedMs: null, durationMs: null, media: null,
};
const OWNER_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function useCameraFeed(enabled: boolean) {
  const [current, setCurrent] = useState(firstSnapshot);
  useEffect(() => {
    if (!enabled) return;
    const offline = () => setCurrent((previous) => ({
      ...previous, state: 'offline', track: null, imageDetection: null, elapsedMs: null, durationMs: null,
    }));
    if (location.hostname.endsWith('.trycloudflare.com')) {
      const abort = new AbortController();
      let timer: ReturnType<typeof setTimeout>;
      const poll = async () => {
        try {
          const response = await fetch(CAMERA_SNAPSHOT_PATH, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(4_000)]), cache: 'no-store' });
          setCurrent(await requireCameraJson<CameraSnapshot>(response));
        } catch {
          if (!abort.signal.aborted) offline();
        }
        if (!abort.signal.aborted) timer = setTimeout(poll, 150);
      };
      void poll();
      return () => { abort.abort(); clearTimeout(timer); };
    }
    const events = new EventSource(CAMERA_STREAM_PATH);
    events.onmessage = ({ data }) => setCurrent(JSON.parse(data) as CameraSnapshot);
    events.onerror = offline;
    return () => events.close();
  }, [enabled]);
  return current;
}

export function CameraViewer({ preferOfficeDemo = false }: { preferOfficeDemo?: boolean }) {
  const current = useCameraFeed(!preferOfficeDemo);
  const [officeDemo, setOfficeDemo] = useState<Pick<CameraDraft, 'media' | 'replay'> | null>();
  const [demoTime, setDemoTime] = useState(0);
  const [demoPaused, setDemoPaused] = useState(false);
  const [held, setHeld] = useState<CameraSnapshot | null>(null);
  const [operator, setOperator] = useState<CameraOperator | null>(null);
  const [mode, setMode] = useState<'viewer' | 'operator'>('viewer');
  const [uploadDuration, setUploadDuration] = useState(0);
  const [localTime, setLocalTime] = useState(0);
  const [localPaused, setLocalPaused] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [uploadAngle, setUploadAngle] = useState<'auto' | 'preset' | 'new'>('auto');
  const [upload, setUpload] = useState<{ url: string; title: string } | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [generatingScene, setGeneratingScene] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'error' | 'ok' } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const displayedFrame = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    void fetch(`${OFFICE_DEMO_PATH}/replay.json`, { signal: abort.signal })
      .then(requireCameraJson<Pick<CameraDraft, 'media' | 'replay'>>)
      .then((sample) => {
        if (!abort.signal.aborted) {
          setOfficeDemo(sample?.replay?.frames.length && sample.replay.sceneFrames?.length ? sample : null);
        }
      }).catch(() => { if (!abort.signal.aborted) setOfficeDemo(null); });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (!OWNER_HOSTS.includes(location.hostname)) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const readOperator = async () => {
      const response = await fetch(CAMERA_OPERATOR_PATH, { signal: abort.signal });
      const settings = await requireCameraJson<CameraOperator>(response);
      if (abort.signal.aborted) return;
      setOperator(settings);
      if (settings.processing) timer = setTimeout(() => { void readOperator().catch(() => {}); }, 800);
    };
    void readOperator().catch(() => {});
    return () => { abort.abort(); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!upload) return;
    return () => URL.revokeObjectURL(upload.url);
  }, [upload]);

  const draft = operator?.draft;
  const editor = useOfficeEditor(draft, (next) => {
    setOperator((previous) => previous && ({ ...previous, draft: next }));
  });
  const localReplay = editor.preview?.replay ?? draft?.replay;
  const isOperator = mode === 'operator' && Boolean(operator) && current.source !== 'camera';
  const canOperate = Boolean(operator) && current.source !== 'camera';
  const sample = !isOperator && (preferOfficeDemo || current.source === 'replay' && !current.media) ? officeDemo : null;
  const draftDuration = (draft?.replay.frames.length ?? 0) * (draft?.replay.stepMs ?? CAMERA_STEP_MS);
  const demoDuration = (sample?.replay.frames.length ?? 0) * CAMERA_STEP_MS;
  const shown = isOperator
    ? (draft && localReplay && !upload ? {
        ...replaySnapshot(localReplay, 0, Math.min(localTime, Math.max(0, draftDuration - 1))),
        media: draft.media,
        scene: draft.scene,
        layout: editor.preview || draft.layout || editor.accepted.length
          ? { ...editor.layout, chairs: editor.accepted } : undefined,
      } : firstSnapshot)
    : sample
      ? { ...replaySnapshot(sample.replay, 0, Math.min(demoTime, demoDuration - 1)), media: sample.media }
      : held ?? current;
  const track = shown.track;
  const paused = isOperator ? localPaused : sample ? demoPaused : held !== null || shown.state === 'offline';
  const replay = shown.source === 'replay';
  const elapsed = isOperator && upload ? localTime : shown.elapsedMs ?? 0;
  const duration = isOperator && upload ? uploadDuration : shown.durationMs ?? 0;
  const videoUrl = isOperator && upload ? upload.url : shown.media?.url ?? null;
  const updateLocalTime = useCallback((time: number) => {
    setLocalTime(Math.max(0, Math.floor(time / CAMERA_STEP_MS) * CAMERA_STEP_MS));
  }, []);
  const updateDemoTime = useCallback((time: number) => {
    setDemoTime(Math.max(0, Math.floor(time / CAMERA_STEP_MS) * CAMERA_STEP_MS));
  }, []);

  function pauseDraft() {
    video.current?.pause();
    setLocalPaused(true);
  }

  function detectCurrentFrame() {
    const element = video.current;
    if (!element || element.seeking || element.readyState < 2 || !element.paused) {
      setNotice({ text: 'รอให้วิดีโอหยุดที่เฟรมที่เลือกก่อนค้นหา', type: 'error' });
      return;
    }
    setNotice(null);
    const frameDuration = 1 / CAMERA_VIDEO_FPS;
    const position = Math.min(element.currentTime, Math.max(0, element.duration - frameDuration));
    const shownFrame = displayedFrame.current;
    const seconds = shownFrame !== null && shownFrame <= position + 0.002 && position - shownFrame < frameDuration
      ? shownFrame : Math.floor(position * CAMERA_VIDEO_FPS + 1e-6) * frameDuration;
    void editor.detect(seconds * 1000);
  }

  async function uploadFile(file: File) {
    setNotice(null);
    setConfirmPublish(false);
    setMode('operator');
    setLocalPaused(false);
    setLocalTime(0);
    setUploadDuration(0);
    setUpload({ url: URL.createObjectURL(file), title: file.name });
    try {
      const response = await fetch(CAMERA_UPLOAD_PATH, {
        method: 'POST', headers: { 'X-Camera-File': encodeURIComponent(file.name), 'X-Camera-Angle': uploadAngle }, body: file,
      });
      const prepared = await requireCameraJson<CameraDraft>(response);
      editor.reset();
      setOperator((previous) => previous && ({ ...previous, draft: prepared, processing: false }));
      setLocalTime(0);
      if (prepared.needsCalibration) {
        setLocalPaused(true);
        editor.startCalibration();
      }
      setNotice({ text: prepared.scene ? 'สร้างแปลนจากคลิปแล้ว'
        : prepared.needsCalibration ? 'คลิปพร้อมแล้ว จับคู่จุดบนพื้นเพื่อปรับเทียบมุมใหม่'
        : 'วิเคราะห์เสร็จแล้ว ตรวจผลก่อนเผยแพร่ได้เลย', type: 'ok' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'อัปโหลดคลิปไม่สำเร็จ', type: 'error' });
    } finally {
      setUpload(null);
    }
  }

  async function generateDraftScene() {
    if (!draft) return;
    pauseDraft();
    setGeneratingScene(true);
    setNotice(null);
    try {
      const response = await fetch(CAMERA_GENERATE_SCENE_PATH, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.media.id, revision: draft.revision ?? 0 }),
      });
      const prepared = await requireCameraJson<CameraDraft>(response);
      setOperator((previous) => previous && ({ ...previous, draft: prepared }));
      editor.reset();
      setNotice({ text: 'สร้างแปลนจากคลิปแล้ว', type: 'ok' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'สร้างแปลนจากคลิปไม่สำเร็จ', type: 'error' });
    } finally {
      setGeneratingScene(false);
    }
  }

  async function reanalyze() {
    if (!draft) return;
    pauseDraft();
    setReanalyzing(true);
    setNotice(null);
    try {
      const response = await fetch(CAMERA_REANALYZE_PATH, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.media.id, revision: draft.revision ?? 0 }),
      });
      const prepared = await requireCameraJson<CameraDraft>(response);
      setOperator((previous) => previous && ({ ...previous, draft: prepared }));
      setNotice({ text: 'อัปเดตผลติดตามในร่างแล้ว ลองเลื่อนไปที่ช่วงที่ขาถูกบัง', type: 'ok' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'วิเคราะห์การติดตามใหม่ไม่สำเร็จ', type: 'error' });
    } finally {
      setReanalyzing(false);
    }
  }

  async function publish() {
    if (!draft) return;
    setPublishing(true);
    setNotice(null);
    try {
      const response = await fetch(`${CAMERA_PUBLISH_PATH}?id=${draft.media.id}&revision=${draft.revision ?? 0}`, { method: 'POST' });
      const result = await requireCameraJson<Pick<CameraOperator, 'publishedId' | 'publishedRevision'>>(response);
      setOperator((previous) => previous && ({ ...previous, ...result }));
      setNotice({ text: 'เผยแพร่คลิปแล้ว ผู้ชมที่เปิดลิงก์จะเห็นคลิปนี้', type: 'ok' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'เผยแพร่คลิปไม่สำเร็จ', type: 'error' });
    } finally {
      setConfirmPublish(false);
      setPublishing(false);
    }
  }

  const sourceLabel = replay ? 'วิดีโอทดสอบ · ย้อนหลัง' : 'ของจริง · กล้องสด';
  const clipLabel = (isOperator ? upload?.title : null) ?? shown.media?.title;
  const imageDetection = shown.imageDetection;
  const hasLastPosition = track?.visibility === 'occluded';
  const hasFloorPlan = shown.scene?.kind === 'floor-plan';
  const sceneObservations = sample || hasFloorPlan ? shown.sceneObservations ?? [] :
    (shown.sceneObservations ?? []).map(({ id, box }) => ({ id, box, ground: undefined }));
  const hasScenePosition = Boolean((sample || hasFloorPlan) && shown.sceneObservations?.some(({ position }) => position));
  const creatingScene = isOperator && (generatingScene || Boolean(upload && uploadAngle === 'auto'));
  const generatedMode = Boolean(shown.scene || creatingScene);
  const status = creatingScene ? 'กำลังสร้างแปลนจากคลิป'
    : reanalyzing && isOperator ? 'กำลังวิเคราะห์การติดตามใหม่'
    : (upload || operator?.processing) && isOperator ? 'กำลังวิเคราะห์คลิป'
    : sample ? (hasScenePosition ? 'กำลังติดตามตำแหน่งจากคลิป' : 'ยังไม่พบคนในเฟรมนี้')
    : preferOfficeDemo && !isOperator ? (officeDemo === undefined ? 'กำลังเปิดคลิปเดโม' : 'คลิปเดโมยังไม่ได้เตรียมไว้')
    : shown.scene && !hasFloorPlan ? 'รอสร้างแปลน 3D'
    : shown.scene && hasScenePosition ? 'กำลังติดตามตำแหน่งจากคลิป'
    : shown.scene && sceneObservations.length ? 'ตรวจพบในภาพ · ยังระบุตำแหน่งบนผังไม่ได้'
    : isOperator && editor.needsCalibration ? 'รอปรับเทียบมุมกล้อง'
    : hasLastPosition && imageDetection ? 'ตรวจพบในภาพ · ผังแสดงตำแหน่งล่าสุด'
    : hasLastPosition ? 'ผังแสดงตำแหน่งล่าสุด'
    : imageDetection ? 'ตรวจพบในภาพ · ยังระบุตำแหน่งบนผังไม่ได้'
    : track ? 'กำลังติดตามในเขตที่เลือก'
    : shown.state === 'ready' ? 'ยังไม่พบคนในพื้นที่ติดตาม'
    : shown.state === 'offline' ? (replay ? 'สัญญาณขาดหาย' : 'กล้องออฟไลน์')
    : 'กำลังรอคลิป';
  const isPlaying = !paused && (shown.state === 'ready' || Boolean(upload && isOperator));
  const publishedDraft = Boolean(draft && draft.media.id === operator?.publishedId &&
    (draft.revision ?? 0) === operator.publishedRevision);
  const editing = isOperator && Boolean(editor.edit);
  const calibrating = isOperator && editor.edit?.type === 'calibration';
  const hideRegion = Boolean(sample) || generatedMode || isOperator && (editor.needsCalibration || calibrating);
  const { image: imagePoints, floor: floorPoints } = editor.calibrationPoints;
  const selectFloor = calibrating && imagePoints.length > floorPoints.length;
  const layoutDisabled = Boolean(editor.busy || operator?.processing || publishing || confirmPublish || reanalyzing || generatingScene);

  return (
    <div className="camera-shell">
      <header className="topbar camera-topbar">
        <div className="topbar-left">
          <BrandMark />
          <span className="brand-name">Camera Twin</span>
          <span className="brand-house">{generatedMode ? 'แปลนจากวิดีโอ' : 'ออฟฟิศตัวอย่าง'}</span>
        </div>
        {canOperate && (
          <nav className="seg camera-mode" aria-label="โหมดการดู">
            <button type="button" className={isOperator ? 'seg-btn' : 'seg-btn active'} aria-pressed={!isOperator} disabled={Boolean(upload || editor.busy || publishing || reanalyzing || generatingScene)}
              onClick={() => { setMode('viewer'); setHeld(null); }}>มุมผู้ชม</button>
            <button type="button" className={isOperator ? 'seg-btn active' : 'seg-btn'} aria-pressed={isOperator} disabled={Boolean(upload || editor.busy || publishing || reanalyzing || generatingScene)}
              onClick={() => { if (!isOperator) { setMode('operator'); setLocalTime(0); } }}>ควบคุมคลิป</button>
          </nav>
        )}
        <div className="topbar-right">
          <span className="pill camera-source"><Video size={15} aria-hidden="true" />{sourceLabel}</span>
        </div>
      </header>

      <main className="camera-main">
        <div className="camera-overview">
          <div className="camera-heading">
            <h1>{generatedMode ? 'แปลน 3D จากวิดีโอ' : 'ผังออฟฟิศ 3D'}</h1>
            <p title={clipLabel}>{clipLabel || 'เทียบตำแหน่งในวิดีโอกับผังออฟฟิศ'}</p>
          </div>
          <div role="status" data-testid="tracking-status" className="camera-tracking">
            <CircleDot size={15} aria-hidden="true" className={track?.visibility === 'visible' || hasScenePosition ? 'active' : (hasLastPosition || imageDetection || sceneObservations.length) ? 'partial' : undefined} />
            <span>{status}</span>
          </div>
        </div>

        <div className="camera-comparison">
          <section className="camera-panel" aria-label="วิดีโอต้นฉบับ">
            <div className="camera-panel-head">
              <h2><Video size={17} aria-hidden="true" /> วิดีโอต้นฉบับ</h2>
              {clipLabel && <span className="mono camera-time">{formatTime(elapsed)}</span>}
            </div>
            <CameraVideo key={`${isOperator ? 'draft' : 'viewer'}:${videoUrl ?? 'empty'}`} url={videoUrl} video={video} track={track} paused={paused}
              imageDetection={imageDetection} sceneObservations={sample || shown.scene ? sceneObservations : undefined}
              simulatedPositions={Boolean(sample)} elapsedMs={elapsed} followsServer={!isOperator && !sample} showOverlay={Boolean(shown.media && replay)}
              showRegion={!hideRegion} calibrationPoints={calibrating ? imagePoints : undefined}
              empty={!replay ? 'ดูตำแหน่งจากกล้องได้บนผัง 3D'
                : isOperator ? 'อัปโหลดคลิปเพื่อพรีวิว'
                : preferOfficeDemo ? (officeDemo === undefined ? 'กำลังเปิดคลิปเดโม' : 'คลิปเดโมยังไม่ได้เตรียมไว้')
                : 'วิดีโอจะขึ้นเมื่อผู้ดูแลเผยแพร่คลิป'}
              layout={shown.layout} suggestions={isOperator && !upload ? editor.suggestions : undefined}
              showChairBoxes={isOperator && paused && editor.suggestionTime !== null && Math.abs(elapsed - editor.suggestionTime) < CAMERA_STEP_MS}
              drawing={isOperator && editor.edit?.type === 'region' ? editor.points : undefined}
              displayedFrame={isOperator ? displayedFrame : undefined}
              onFrameClick={editing && !layoutDisabled && !selectFloor && (!calibrating || imagePoints.length < 4) ? editor.click : undefined}
              onTime={isOperator ? updateLocalTime : sample ? updateDemoTime : undefined}
              onDuration={isOperator && upload ? setUploadDuration : undefined} />
            <div className="camera-panel-foot"><i className="video-key" aria-hidden="true" /> {
              calibrating ? (imagePoints.length === 4 && !selectFloor ? 'เลือกครบ 4 จุดในวิดีโอแล้ว'
                : selectFloor ? 'เลือกจุดเดียวกันบนผังมุมบน' : `เลือกจุดที่ ${imagePoints.length + 1} บนพื้นในวิดีโอ`)
              : sample ? 'กรอบเขียวฟ้าแสดงคนที่ตรวจพบในเฟรมนี้'
              : editing ? (editor.edit?.type === 'region' ? 'แตะวางจุดรอบเขตในภาพ' : 'แตะจุดที่ขาเก้าอี้สัมผัสพื้น')
                : shown.scene ? 'สีม่วงแสดงตำแหน่งบนแปลน · สีเหลืองแสดงผลตรวจจับในภาพ'
                : shown.scene ? 'สีม่วงแสดงตำแหน่งบนแปลน · สีเหลืองแสดงผลตรวจจับในภาพ'
                : imageDetection ? 'กรอบเหลืองแสดงคนที่ตรวจพบในภาพ' : 'วงแสดงตำแหน่งบนผังเมื่อเทียบกลับมาที่ภาพ'}</div>
          </section>

          <section className="camera-panel" aria-label={calibrating ? 'ผังมุมบน' : 'มุมมอง 3D'}
            data-position-source={sample ? 'simulated' : undefined}>
            <div className="camera-panel-head">
              <h2><Focus size={17} aria-hidden="true" /> {calibrating ? 'ผังมุมบน' : 'มุมมอง 3D'}</h2>
              {sample && <span className="monitor-badge monitor-simulated-position">ตำแหน่งจำลองจากคลิป</span>}
              {!calibrating && <button type="button" className="btn btn-sm" onClick={() => setResetKey((key) => key + 1)}>
                <RotateCcw size={14} aria-hidden="true" /> คืนมุมมอง
              </button>}
            </div>
            <div className="office-viewport viewport" data-testid="office-scene">
              {shown.scene ? (
                <SceneBoundary><GeneratedSceneView scene={shown.scene} observations={sceneObservations} resetKey={resetKey} /></SceneBoundary>
              ) : creatingScene ? (
                <p className="canvas-fallback">กำลังสร้างแปลนจากวิดีโอ…</p>
              ) : calibrating ? (
                <OfficeCalibrationMap points={floorPoints} onPoint={selectFloor && !layoutDisabled ? editor.clickFloor : undefined} />
              ) : (
                <>
                  {hasLastPosition && <span className="camera-last-position">ตำแหน่งล่าสุด</span>}
                  <SceneBoundary><OfficeScene track={track} area={shown.area} paused={paused} resetKey={resetKey}
                    demoObservations={sample ? sceneObservations : undefined}
                    layout={shown.layout} showRegion={!hideRegion} suggestions={isOperator && !upload ? editor.suggestions : undefined} /></SceneBoundary>
                </>
              )}
            </div>
            <div className="camera-panel-foot">
              {sample ? 'ตัวคนสีเขียวฟ้าขยับตามตำแหน่งโดยประมาณจากภาพ'
                : shown.scene ? 'เส้นประแสดงแนวที่ประมาณ · ลากเพื่อหมุน'
                : calibrating ? 'จับคู่ตำแหน่งบนพื้นตามเลขในวิดีโอ' : 'ลากเพื่อหมุน · เลื่อนเพื่อซูม'}
              {!hideRegion && <span><i className="walkway-key" aria-hidden="true" /> พื้นที่ติดตาม</span>}
            </div>
          </section>
        </div>

        <section className="camera-transport" aria-label="ควบคุมการเล่น">
          <button type="button" className="btn btn-primary" disabled={editing || Boolean(isOperator && (editor.busy || reanalyzing || generatingScene)) || (shown.state !== 'ready' && !(isOperator && upload))}
            onClick={() => isOperator ? setLocalPaused((value) => !value)
              : sample ? setDemoPaused((value) => !value) : setHeld(held ? null : current)}>
            {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {isPlaying ? 'หยุดชั่วคราว' : 'เล่นต่อ'}
          </button>
          {replay && (
            <>
              {sample || isOperator && draft && !upload ? (
                <input className="camera-scrub" type="range" min={0} max={duration} step={CAMERA_STEP_MS}
                  value={elapsed} disabled={editing || Boolean(editor.busy) || reanalyzing || generatingScene} aria-label="เลื่อนไปยังเวลาในวิดีโอ" onChange={(event) => {
                    const time = Math.max(0, Math.min(Number(event.target.value), duration - 1));
                    if (video.current) video.current.currentTime = time / 1000;
                    if (sample) setDemoTime(time);
                    else setLocalTime(time);
                  }} />
              ) : <progress value={elapsed} max={duration || 1} aria-label="ความคืบหน้าของคลิป" />}
              <span className="mono camera-playhead" data-testid="playhead" data-elapsed={shown.elapsedMs ?? ''}>
                {formatTime(elapsed)} / {formatTime(duration)}
              </span>
            </>
          )}
          <span className="camera-transport-note">{paused ? 'หยุดเฉพาะหน้าของคุณ' : 'ตำแหน่งบนผังเป็นค่าประมาณ'}</span>
        </section>

        {isOperator && draft && !draft.scene && !upload && (
          <OfficeEditor editor={editor} paused={paused} pause={pauseDraft} onDetect={detectCurrentFrame} disabled={layoutDisabled} />
        )}
        {isOperator && (
          <section className="camera-operator" aria-label="จัดการคลิป">
            <div className="camera-operator-summary">
              <h2>จัดการคลิป</h2>
              <p>{upload ? 'กำลังวิเคราะห์วิดีโอ วิดีโอต้นฉบับเปิดดูได้ระหว่างรอ'
                : operator?.processing ? 'กำลังประมวลผลร่างคลิป'
                : draft ? (editor.needsCalibration ? 'คลิปมุมใหม่รอปรับเทียบกับผัง'
                  : editor.dirty ? 'บันทึกผังในร่างก่อนเผยแพร่'
                  : publishedDraft ? 'คลิปนี้เผยแพร่แล้ว' : 'ร่างพร้อมตรวจ · ผู้ชมจะเห็นคลิปเมื่อกดเผยแพร่')
                : 'อัปโหลดคลิปจากออฟฟิศและมุมกล้องเดิม · ไม่เกิน 200 MB และยาวไม่เกิน 3 นาที'}</p>
              {notice && <p role={notice.type === 'error' ? 'alert' : 'status'} className={`camera-notice ${notice.type}`}>{notice.text}</p>}
            </div>
            <div className="camera-operator-actions">
              <input ref={fileInput} type="file" accept=".mp4,.mov,.webm,.mkv" hidden
                aria-label="ไฟล์วิดีโอ" onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void uploadFile(file);
                }} />
              <a className="btn" href={ROOM_SCAN_PAGE}><Video size={16} aria-hidden="true" /> สแกนห้องด้วยกล้อง</a>
              <select className="camera-angle-select" value={uploadAngle} aria-label="วิธีสร้างแปลนสำหรับคลิปที่จะอัปโหลด"
                disabled={Boolean(upload) || layoutDisabled || editor.dirty}
                onChange={(event) => {
                  const mode = event.target.value;
                  setUploadAngle(mode === 'new' || mode === 'preset' ? mode : 'auto');
                }}>
                <option value="auto">สร้างแปลนจากวิดีโอ</option>
                <option value="preset">มุมกล้องตัวอย่าง</option>
                <option value="new">มุมใหม่ของห้องเดิม</option>
              </select>
              <button type="button" className="btn" disabled={Boolean(upload) || layoutDisabled || editor.dirty}
                onClick={() => fileInput.current?.click()}><Upload size={16} aria-hidden="true" /> อัปโหลดคลิป</button>
              {draft && draft.scene?.kind !== 'floor-plan' && (
                <button type="button" className="btn" disabled={Boolean(upload) || layoutDisabled || editor.dirty}
                  onClick={() => void generateDraftScene()}>{generatingScene ? 'กำลังสร้างแปลน…' : 'สร้างแปลน 3D จากคลิปนี้'}</button>
              )}
              {draft && !draft.scene && !draft.replay.imageFrames && (
                <button type="button" className="btn" disabled={Boolean(upload) || layoutDisabled || editor.dirty}
                  onClick={() => void reanalyze()}>
                  {reanalyzing ? 'กำลังวิเคราะห์การติดตามใหม่…' : 'วิเคราะห์การติดตามใหม่'}
                </button>
              )}
              {confirmPublish ? (
                <div role="group" aria-label="ยืนยันการเผยแพร่" className="camera-publish-confirm">
                  <p>ผู้ที่เปิดลิงก์จะเห็นวิดีโอนี้</p>
                  <button type="button" className="btn" disabled={publishing} onClick={() => setConfirmPublish(false)}>ยกเลิก</button>
                  <button type="button" className="btn btn-primary" disabled={publishing} onClick={() => void publish()}>ยืนยันเผยแพร่</button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary" disabled={!draft || Boolean(upload) || publishedDraft || draft.needsCalibration || Boolean(draft.scene && draft.scene.kind !== 'floor-plan') || editor.dirty || layoutDisabled}
                  onClick={() => setConfirmPublish(true)}>
                  {publishedDraft ? <Check size={16} aria-hidden="true" /> : <RadioTower size={16} aria-hidden="true" />}
                  {publishedDraft ? 'เผยแพร่แล้ว' : 'เผยแพร่'}
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
