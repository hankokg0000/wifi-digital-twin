import { Radio, Wifi } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CSI_BASELINE_MS, INDOOR_WIFI_API, type IndoorWifiSnapshot } from '../../core/camera/csi-monitor';
import { RSSI_BASELINE_MS } from '../../core/sensing/live-rssi';
import { demoArea } from '../../core/camera/site-demo';
import { requireCameraJson } from '../camera/useOfficeEditor';
import { SensingChart } from '../sensing/SensingChart';
import '../sensing/sensing.css';
import { useIndoorRssi } from './useIndoorRssi';
import { publicIndoorWifi, usePublicIndoorWifi } from './PublicIndoorWifi';

export const indoorOperator = import.meta.env.VITE_INDOOR_DEMO_ONLY !== '1' &&
  ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

function useIndoorCsi(enabled: boolean) {
  const [status, setStatus] = useState<IndoorWifiSnapshot>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const version = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const started = version.current;
      try {
        const response = await fetch(INDOOR_WIFI_API + 'status', {
          cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(4_000)]),
        });
        const next = await requireCameraJson<IndoorWifiSnapshot>(response);
        if (!abort.signal.aborted && version.current === started) setStatus(next);
      } catch {
        if (!abort.signal.aborted && version.current === started) setStatus(undefined);
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 550);
    }
    void poll();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [enabled]);

  async function control(action: 'assign' | 'baseline' | 'release', room: string) {
    setPending(true);
    setNotice('');
    version.current++;
    try {
      const response = await fetch(INDOOR_WIFI_API + action + '?room=' + encodeURIComponent(room), {
        method: 'POST', signal: AbortSignal.timeout(5_000),
      });
      const next = await requireCameraJson<IndoorWifiSnapshot>(response);
      version.current++;
      setStatus(next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'สั่งงานตัวรับ CSI ไม่สำเร็จ');
    } finally {
      setPending(false);
    }
  }

  return { status, pending, notice, control };
}

type WifiSource = 'rssi' | 'csi';
const WIFI_SOURCE_KEY = 'wdt.indoor.wifi-source.v1';

function savedWifiSource(): WifiSource {
  try {
    return indoorOperator && localStorage.getItem(WIFI_SOURCE_KEY) === 'csi' ? 'csi' : 'rssi';
  } catch {
    return 'rssi';
  }
}

export function useIndoorWifi() {
  const [source, selectSource] = useState(savedWifiSource);
  function setSource(next: WifiSource) {
    selectSource(next);
    try { localStorage.setItem(WIFI_SOURCE_KEY, next); } catch { /* The current view still works. */ }
  }
  const rssi = useIndoorRssi(indoorOperator);
  const csi = useIndoorCsi(indoorOperator);
  const viewingPublic = publicIndoorWifi && !indoorOperator;
  const publicSnapshot = usePublicIndoorWifi(viewingPublic);
  const active = source === 'rssi' ? rssi : csi;
  const observed = viewingPublic ? publicSnapshot : active.status;
  const observedRoom = observed?.state === 'motion' ? observed.roomId ?? undefined : undefined;
  return { source, setSource, rssi, ...active, viewingPublic, publicSnapshot, observedRoom };
}

const emptyChart = { readings: [], verdicts: [] };
const rssiConnectionText = {
  connecting: 'กำลังเชื่อมต่อ…',
  live: 'รอค่า RSSI จาก Wi‑Fi ของ Mac',
  unavailable: 'ตัวอ่าน RSSI จริงยังไม่พร้อม',
  offline: 'เชื่อมต่อแหล่ง RSSI ไม่สำเร็จ',
};

const states = {
  disconnected: 'รอข้อมูลจากตัวรับ Wi‑Fi CSI',
  calibrating: 'กำลังบันทึก Baseline',
  'baseline-needed': 'รับข้อมูลแล้ว · รอบันทึก Baseline',
  motion: 'พบการเคลื่อนไหว',
  idle: 'ไม่มีการเคลื่อนไหว',
};

export function IndoorWifiPanel({ roomId, wifi }: {
  roomId: string; wifi: ReturnType<typeof useIndoorWifi>;
}) {
  const { status, pending, notice, control, source, setSource, rssi } = wifi;
  const isRssi = source === 'rssi';
  const name = isRssi ? 'RSSI' : 'CSI';
  const unit = isRssi ? 'dBm' : 'dB สัมพันธ์';
  const baselineMs = isRssi ? RSSI_BASELINE_MS : CSI_BASELINE_MS;
  const linked = status?.roomId === roomId;
  const current = linked ? status : undefined;
  const canBaseline = Boolean(current && current.state !== 'disconnected' && current.state !== 'calibrating');
  const chart = isRssi ? status : current;
  const last = chart?.readings.at(-1)?.rssi;
  const connected = last !== undefined;
  const connectionText = connected ? `เชื่อมต่อแล้ว · ${String(last.toFixed(isRssi ? 0 : 1)).replace('-', '−')} ${unit}${isRssi && rssi.channel ? ` · ช่อง ${rssi.channel}` : ''}`
    : isRssi ? rssiConnectionText[rssi.connection] : states.disconnected;
  const linkText = linked
    ? current && current.state !== 'disconnected' ? states[current.state] : 'รอสัญญาณของห้องนี้'
    : status?.roomId ? `กำลังเฝ้า ${demoArea(status.roomId)?.name ?? 'ห้องอื่น'}` : 'ผูกสัญญาณกับห้องเพื่อเปิดการตรวจจับ';
  return (
    <aside className="indoor-csi" aria-label="Wi-Fi ของจริง">
      <div className="indoor-csi-head">
        <h2><Wifi size={16} aria-hidden="true" /> ตรวจจับ Wi‑Fi</h2>
        <span className="sensing-badge">ของจริง</span>
      </div>
      <div className="indoor-signal-source" role="group" aria-label="ชนิดสัญญาณ Wi-Fi">
        <button type="button" className="indoor-button" aria-pressed={isRssi} onClick={() => setSource('rssi')}>RSSI</button>
        <button type="button" className="indoor-button" aria-pressed={!isRssi} onClick={() => setSource('csi')}>CSI</button>
      </div>
      <div className="sensing-conn">
        <span className={`sensing-dot ${connected ? 'live' : 'offline'}`} aria-hidden="true" />
        <span className="mono sensing-conn-text">{connectionText}</span>
      </div>
      <SensingChart fitAvailable data={chart ?? emptyChart} windowSeconds={isRssi ? 60 : 24}
        label={`กราฟสัญญาณ Wi-Fi ${name}`} />
      <p role="status">{linkText}</p>
      {current?.state === 'calibrating' && <progress aria-label="กำลังบันทึก Baseline" max={baselineMs} value={baselineMs - current.remainingMs} />}
      {current?.baseline && <p>
        Baseline {current.baseline.meanRssi.toFixed(1)} {unit} · ความผันผวน {current.score?.toFixed(2) ?? '–'} / {current.threshold?.toFixed(2)} dB
      </p>}
      {(notice || current?.feedback) && <p role="alert">{notice || current?.feedback}</p>}
      <div className="indoor-csi-actions">
        {linked ? <>
          {current?.state === 'disconnected' && current.feedback && !isRssi && <button type="button" className="indoor-button"
            disabled={pending} onClick={() => void control('assign', roomId)}>ลองเชื่อมต่อใหม่</button>}
          <button type="button" className="indoor-button" disabled={!canBaseline || pending}
            onClick={() => void control('baseline', roomId)}>บันทึก Baseline</button>
          <button type="button" className="indoor-button" disabled={pending}
            onClick={() => void control('release', roomId)}>ยกเลิกผูก</button>
        </> : (
          <button type="button" className="indoor-button" disabled={pending}
            onClick={() => void control('assign', roomId)}><Radio size={14} aria-hidden="true" /> ผูก {name} กับห้องนี้</button>
        )}
      </div>
      {!connected && <small>{isRssi ? 'เชื่อมต่อ Mac กับเครือข่าย Wi‑Fi ที่ต้องการวัด' : 'รองรับตัวรับ Nexmon BCM43455c0'}</small>}
      {current && connected && <small>ให้พื้นที่อยู่ในสภาพนิ่ง {baselineMs / 1000} วินาทีเมื่อบันทึก Baseline</small>}
    </aside>
  );
}
