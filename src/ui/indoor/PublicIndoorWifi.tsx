import { Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { demoArea } from '../../core/camera/site-demo';
import { parsePublicWifiSnapshot, PUBLIC_WIFI_PATH, type PublicWifiSnapshot } from '../../core/sensing/public-wifi';
import { SensingChart } from '../sensing/SensingChart';

export const publicIndoorWifi = import.meta.env.VITE_INDOOR_WIFI_PUBLIC === '1';
const emptyChart = { readings: [], verdicts: [] };

export function usePublicIndoorWifi(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<PublicWifiSnapshot>();
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    let next: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(PUBLIC_WIFI_PATH, {
          cache: 'no-store',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(3_500)]),
        });
        const now = Date.parse(response.headers.get('date') ?? '');
        const data = response.ok ? parsePublicWifiSnapshot(await response.json(), Number.isFinite(now) ? now : Date.now()) : undefined;
        if (!abort.signal.aborted) setSnapshot(data);
      } catch {
        if (!abort.signal.aborted) setSnapshot(undefined);
      }
      if (!abort.signal.aborted) next = setTimeout(poll, 1_250);
    }
    void poll();
    return () => { abort.abort(); clearTimeout(next); };
  }, [enabled]);
  return snapshot;
}

export function PublicIndoorWifi({ snapshot, roomId }: { snapshot?: PublicWifiSnapshot; roomId: string }) {
  const last = snapshot?.readings.at(-1)?.rssi;
  const connected = last !== undefined;
  const room = demoArea(snapshot?.roomId ?? null);
  const state = snapshot?.state;
  const stateText = state === 'motion' ? 'พบการเคลื่อนไหว'
    : state === 'idle' ? 'ไม่มีการเคลื่อนไหว' : 'รอ Baseline';
  return (
    <aside className="indoor-csi" aria-label="Wi-Fi สดแบบดูอย่างเดียว">
      <div className="indoor-csi-head">
        <h2><Wifi size={16} aria-hidden="true" /> ตรวจจับ Wi‑Fi</h2>
        <span className="sensing-badge">ของจริง · ดูอย่างเดียว</span>
      </div>
      <div className="sensing-conn">
        <span className={`sensing-dot ${connected ? 'live' : 'offline'}`} aria-hidden="true" />
        <span className="mono sensing-conn-text">
          {connected ? `RSSI สด · ${String(Math.round(last)).replace('-', '−')} dBm` : 'รอสัญญาณจาก Mac ที่รันระบบ'}
        </span>
      </div>
      <SensingChart fitAvailable data={snapshot ?? emptyChart} label="กราฟสัญญาณ Wi-Fi RSSI สด" />
      {connected && <p role="status">
        {room ? room.id === roomId ? stateText : `กำลังเฝ้า ${room.name} · ${stateText}` : 'ยังไม่ได้ผูกสัญญาณกับห้อง'}
      </p>}
    </aside>
  );
}
