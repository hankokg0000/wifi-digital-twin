import { useState } from 'react';
import { CircleDot, FolderOpen, Footprints, Radio, Square, Undo2 } from 'lucide-react';
import { useSceneStore } from '../store';
import { Section } from '../components/Section';
import { SensingChart } from './SensingChart';
import { MotionPreview } from './MotionPreview';
import { LiveSetup } from '../live/LiveSetup';
import {
  BASELINE_SECONDS,
  SENSING_ORIGIN_LABEL,
  backToLive,
  cancelBaseline,
  parseRecording,
  resolveMonitoredRoom,
  selectCurrentVerdict,
  selectSensingOrigin,
  setMonitoredRoomId,
  startBaseline,
  startRecording,
  startReplay,
  stopRecording,
  useSensingStore,
} from './sensingStore';
import './sensing.css';

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ConnectionLine() {
  const connection = useSensingStore((s) => s.connection);
  const rssi = useSensingStore((s) => s.rssi);
  const channel = useSensingStore((s) => s.channel);
  const source = useSensingStore((s) => s.source);
  let text: string;
  if (source === 'replay') text = `ย้อนหลัง · ${rssi ?? '–'} dBm`.replace('-', '−');
  else if (connection === 'live') text = `เชื่อมต่อแล้ว · ${rssi === null ? '–' : String(rssi).replace('-', '−')} dBm${channel ? ` · ช่อง ${channel}` : ''}`;
  else if (connection === 'fake') text = 'โหมดจำลอง (ไม่มีอุปกรณ์จริง)';
  else if (connection === 'connecting') text = 'กำลังเชื่อมต่อ…';
  else text = 'ไม่ได้เชื่อมต่อ';
  const tone = source === 'replay' ? 'replay' : connection;
  return (
    <div className="sensing-conn">
      <span className={`sensing-dot ${tone}`} aria-hidden="true" />
      <span className="mono sensing-conn-text">{text}</span>
    </div>
  );
}

function StatusLine() {
  const verdict = useSensingStore(selectCurrentVerdict);
  const baseline = useSensingStore((s) => s.baseline);
  const progress = useSensingStore((s) => s.baselineProgress);
  const origin = useSensingStore(selectSensingOrigin);
  const replayEnded = useSensingStore((s) => s.source === 'replay' && s.replayProgress >= 1);
  const motion = verdict?.motion === true;
  let text: string;
  if (replayEnded) text = 'เล่นย้อนหลังจบแล้ว';
  else if (progress !== null) text = 'กำลังอัด Baseline…';
  else if (origin === null) text = 'รอสัญญาณ WiFi';
  else if (origin !== 'replay' && !baseline) text = 'ยังไม่มี Baseline — กดอัดตอนห้องไม่มีคนเดิน';
  else if (!verdict) text = 'กำลังวิเคราะห์…';
  else text = motion ? 'มีการเคลื่อนไหว' : 'ไม่มีการเคลื่อนไหว';

  return (
    <div className="sensing-status-row">
      <p className={`sensing-status ${motion ? 'motion' : 'idle'}${verdict ? '' : ' sensing-status-hint'}`} role="status">
        {text}
      </p>
      <MotionPreview active={motion} />
    </div>
  );
}

export function SensingPanel() {
  const doc = useSceneStore((s) => s.doc);
  const real = useSceneStore((s) => s.reality === 'real');
  const connection = useSensingStore((s) => s.connection);
  const source = useSensingStore((s) => s.source);
  const origin = useSensingStore(selectSensingOrigin);
  const baseline = useSensingStore((s) => s.baseline);
  const progress = useSensingStore((s) => s.baselineProgress);
  const recording = useSensingStore((s) => s.recording);
  const roomId = useSensingStore((s) => s.monitoredRoomId);
  const replayProgress = useSensingStore((s) => s.replayProgress);
  const fakeMotion = useSensingStore((s) => s.fakeMotion);
  const [error, setError] = useState<string | null>(null);

  const replaying = source === 'replay';
  const connected = connection === 'live' || connection === 'fake';
  const room = resolveMonitoredRoom(doc, roomId);
  const levelName = (id: string) => doc.levels.find((l) => l.id === id)?.name ?? '';

  function toggleFake() {
    // The server echoes the new state back on the stream, which updates the button.
    fetch('/api/rssi/fake-motion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: !fakeMotion }) }).catch(() => setError('สลับโหมดจำลองไม่ได้'));
  }

  function finishRecording() {
    const file = stopRecording();
    if (file) download(`wifi-recording-${stamp(new Date())}.json`, file);
  }

  // A throwaway <input>, not one in the DOM: keeps the app's single file input (File menu) unique.
  function pickFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => void onFile(input.files?.[0]);
    input.click();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const res = parseRecording(JSON.parse(await file.text()));
      if (res.ok) startReplay(res.rec);
      else setError(res.message);
    } catch {
      setError('อ่านไฟล์ไม่ได้');
    }
  }

  return (
    <Section title="ตรวจจับ WiFi" aside={origin && <span className="sensing-badge">{SENSING_ORIGIN_LABEL[origin]}</span>}>
      <div className="sensing">
        {real && <LiveSetup />}
        <ConnectionLine />
        <StatusLine />
        <SensingChart />

        <label className="sensing-field">
          <span className="field-label">ห้องที่เฝ้า</span>
          <select className="sensing-select" value={doc.rooms.some((r) => r.id === roomId) ? roomId! : ''} onChange={(e) => setMonitoredRoomId(e.target.value || null)} aria-label="ห้องที่เฝ้า">
            <option value="">อัตโนมัติ (ห้องที่เส้นผ่านยาวสุด)</option>
            {doc.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {levelName(r.levelId)}
              </option>
            ))}
          </select>
        </label>

        {progress !== null && (
          <div className="sensing-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="sensing-progress-bar" style={{ width: `${progress * 100}%` }} />
            <span className="mono">เหลืออีก {Math.ceil(BASELINE_SECONDS * (1 - progress))} วิ — อย่าเดินผ่าน</span>
          </div>
        )}
        {replaying && replayProgress < 1 && (
          <div className="sensing-progress" role="progressbar" aria-label="กำลังเล่นย้อนหลัง" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(replayProgress * 100)}>
            <div className="sensing-progress-bar" style={{ width: `${replayProgress * 100}%` }} />
            <span className="mono">กำลังเล่นย้อนหลัง</span>
          </div>
        )}

        <div className="sensing-actions">
          {replaying ? (
            <button type="button" className="btn btn-primary btn-block" onClick={backToLive}>
              <Undo2 size={16} strokeWidth={1.5} />
              กลับไปดูสด
            </button>
          ) : (
            <>
              {progress === null ? (
                <button type="button" className="btn btn-block" onClick={startBaseline} disabled={!connected}>
                  <Radio size={16} strokeWidth={1.5} />
                  {baseline ? 'อัด Baseline ใหม่ (30 วิ)' : 'อัด Baseline (30 วิ)'}
                </button>
              ) : (
                <button type="button" className="btn btn-block" onClick={cancelBaseline}>
                  ยกเลิกการอัด Baseline
                </button>
              )}
              {recording ? (
                <button type="button" className="btn btn-block" onClick={finishRecording}>
                  <Square size={16} strokeWidth={1.5} />
                  หยุดและบันทึก
                  <span className="mono sensing-count">{recording.count}</span>
                </button>
              ) : (
                <button type="button" className="btn btn-block" onClick={startRecording} disabled={!connected}>
                  <CircleDot size={16} strokeWidth={1.5} />
                  เริ่มอัด Recording
                </button>
              )}
            </>
          )}
          {!replaying && (
            <button type="button" className="btn btn-block" onClick={pickFile}>
              <FolderOpen size={16} strokeWidth={1.5} />
              เปิด Recording
            </button>
          )}
          {connection === 'fake' && !replaying && (
            <button type="button" className={`btn btn-block${fakeMotion ? ' btn-primary' : ''}`} aria-pressed={fakeMotion} onClick={toggleFake}>
              <Footprints size={16} strokeWidth={1.5} />
              จำลองคนเดิน
            </button>
          )}
        </div>
        {error && <p className="sensing-error" role="alert">{error}</p>}
      </div>
    </Section>
  );
}
