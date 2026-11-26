import { useCallback, useEffect, useRef, useState } from 'react';
import type { IndoorWifiSnapshot } from '../../core/camera/csi-monitor';
import { demoArea } from '../../core/camera/site-demo';
import { INDOOR_RSSI_STREAM, observedRssi, parseSavedRssiLink, RSSI_BASELINE_MS, type SavedRssiLink } from '../../core/sensing/live-rssi';
import { INDOOR_RSSI_SHARE_PATH } from '../../core/sensing/public-wifi';
import { createSignalTracker } from '../../core/sensing/signal-tracker';
import { DEFAULT_DETECTOR_CONFIG } from '../../core/sensing/types';

type Connection = 'connecting' | 'live' | 'unavailable' | 'offline';
const RSSI_LINK_KEY = 'wdt.indoor.rssi-link.v1';

function loadLink() {
  try {
    const value = parseSavedRssiLink(JSON.parse(localStorage.getItem(RSSI_LINK_KEY) ?? 'null'));
    return value && demoArea(value.roomId) ? value : null;
  } catch {
    return null;
  }
}

function saveLink(link: SavedRssiLink | null) {
  try {
    if (link) localStorage.setItem(RSSI_LINK_KEY, JSON.stringify(link));
    else localStorage.removeItem(RSSI_LINK_KEY);
    return true;
  } catch {
    return false;
  }
}

export function useIndoorRssi(enabled: boolean) {
  const tracker = useRef<ReturnType<typeof createSignalTracker> | null>(null);
  tracker.current ??= createSignalTracker({ baselineMs: RSSI_BASELINE_MS, config: DEFAULT_DETECTOR_CONFIG, traceLimit: 640 });

  const link = useRef<SavedRssiLink | null>(null);
  const sync = useRef<Promise<void>>(Promise.resolve());
  const [status, setStatus] = useState<IndoorWifiSnapshot>();
  const [channel, setChannel] = useState(0);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [notice, setNotice] = useState('');

  const syncPublicLink = useCallback((value: SavedRssiLink | null) => {
    if (import.meta.env.VITE_INDOOR_WIFI_PUBLIC !== '1') return;
    sync.current = sync.current.then(async () => {
      try {
        const response = await fetch(INDOOR_RSSI_SHARE_PATH, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
          keepalive: true, signal: AbortSignal.timeout(4_000),
        });
        if (!response.ok) throw new Error('publication unavailable');
      } catch { setNotice('ส่งการตั้งค่า Wi‑Fi ไปยังหน้าดูสดไม่สำเร็จ'); }
    });
  }, []);


  useEffect(() => {
    if (!enabled || !tracker.current) return;
    const signal = tracker.current;
    link.current = loadLink();
    if (link.current) syncPublicLink(link.current);
    const events = new EventSource(INDOOR_RSSI_STREAM);
    let mode = '';
    let lastChannel: number | null = null;
    events.addEventListener('status', ({ data }: MessageEvent) => {
      try { mode = JSON.parse(data).mode; } catch { mode = ''; }
      signal.reset();
      setStatus(undefined);
      lastChannel = null;
      setChannel(0);
      setConnection(mode === 'live' ? 'live' : mode === 'fake' ? 'unavailable' : 'offline');
    });
    events.onmessage = ({ data }) => {
      try {
        const reading = observedRssi(mode, JSON.parse(data));
        if (!reading) return;
        if (reading.channel !== lastChannel) {
          signal.reset();
          lastChannel = reading.channel;
          setChannel(reading.channel);
        }
        const completed = signal.acceptSample(reading, Date.now());
        const current = link.current;
        if (!current) return;
        if (completed) {
          link.current = { roomId: current.roomId, baseline: { channel: reading.channel, value: completed } };
          if (!saveLink(link.current)) setNotice('เบราว์เซอร์บันทึก Baseline สำหรับเปิดครั้งถัดไปไม่ได้');
          syncPublicLink(link.current);
        } else if (current.baseline?.channel === reading.channel) {
          signal.restoreBaseline(reading.key, current.baseline.value);
        }
      } catch { /* Ignore an invalid Reading. */ }
    };
    events.onerror = () => {
      mode = '';
      signal.reset();
      setStatus(undefined);
      setConnection('offline');
    };
    const syncLink = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== null && event.key !== RSSI_LINK_KEY)) return;
      link.current = loadLink();
      signal.reset();
    };
    window.addEventListener('storage', syncLink);
    const timer = setInterval(() => setStatus({ ...signal.status(Date.now()), roomId: link.current?.roomId ?? null }), 450);
    return () => {
      events.close();
      window.removeEventListener('storage', syncLink);
      clearInterval(timer);
    };
  }, [enabled, syncPublicLink]);

  function control(action: 'assign' | 'baseline' | 'release', room: string) {
    const signal = tracker.current;
    if (!signal) return;
    setNotice('');
    if (action === 'assign') {
      if (link.current?.roomId !== room) {
        signal.reset();
        link.current = { roomId: room };
        if (!saveLink(link.current)) setNotice('เบราว์เซอร์บันทึกห้องสำหรับเปิดครั้งถัดไปไม่ได้');
        syncPublicLink(link.current);
      }
    } else if (link.current?.roomId === room) {
      if (action === 'release') {
        link.current = null;
        signal.reset();
        if (!saveLink(null)) setNotice('เบราว์เซอร์ลบห้องที่บันทึกไว้ไม่ได้');
        syncPublicLink(null);
      } else if (signal.baseline(Date.now())) {
        syncPublicLink({ roomId: room });
      } else {
        setNotice('รอให้กราฟรับค่า RSSI ก่อนบันทึก Baseline');
      }
    }
    setStatus({ ...signal.status(Date.now()), roomId: link.current?.roomId ?? null });
  }

  return { status, connection, channel, pending: false, notice, control };
}
