import { useEffect, useRef, useState } from 'react';
import type { Alert } from '../../core';
import { useSceneStore } from '../store';
import { useAlerts } from '../useAlerts';

interface ToastItem {
  id: string;
  alert: Alert;
}

const COALESCE_WINDOW_MS = 1000;
const COALESCE_THRESHOLD = 3; // more than this many in the window get folded into a summary
const AUTO_DISMISS_MS = 4000; // warnings auto-dismiss; critical toasts stay until closed

/**
 * Bottom-right transient toasts for alerts the sim clock crosses WHILE PLAYING (not while
 * scrubbing/jumping — AlertsPanel already offers a deliberate jump). Watches the store's
 * (throttled ~10 Hz) sim.t and fires for every alert whose time falls in (prevT, t]. More than
 * `COALESCE_THRESHOLD` firing within `COALESCE_WINDOW_MS` collapse into one summary toast so a
 * burst of falls/zone-entries doesn't carpet the screen.
 */
export function AlertToasts() {
  const simT = useSceneStore((s) => s.sim.t);
  const playing = useSceneStore((s) => s.sim.playing);
  const alerts = useAlerts();
  const lastTRef = useRef(0);
  const recentFireTimesRef = useRef<number[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [coalescedCount, setCoalescedCount] = useState(0);

  useEffect(() => {
    const prevT = lastTRef.current;
    lastTRef.current = simT;
    if (!playing || simT <= prevT) return;

    const crossed = alerts.filter((a) => a.t > prevT && a.t <= simT);
    if (crossed.length === 0) return;

    const now = Date.now();
    for (const alert of crossed) {
      recentFireTimesRef.current = recentFireTimesRef.current.filter((t) => now - t < COALESCE_WINDOW_MS);
      recentFireTimesRef.current.push(now);
      if (recentFireTimesRef.current.length > COALESCE_THRESHOLD) {
        setCoalescedCount((c) => c + 1);
        continue;
      }
      const id = `${alert.id}:${now}`;
      setToasts((prev) => [...prev, { id, alert }]);
      if (alert.severity !== 'critical') {
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), AUTO_DISMISS_MS);
      }
    }
  }, [simT, playing, alerts]);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  if (toasts.length === 0 && coalescedCount === 0) return null;

  return (
    <div className="alert-toasts">
      {toasts.map(({ id, alert }) => (
        <div key={id} className={`alert-toast alert-toast-${alert.severity}`}>
          <span className="alert-icon">{alert.severity === 'critical' ? '🚨' : '⚠️'}</span>
          <span>{alert.message}</span>
          <button className="alert-toast-close" onClick={() => dismiss(id)} aria-label="dismiss">
            &times;
          </button>
        </div>
      ))}
      {coalescedCount > 0 && (
        <div className="alert-toast alert-toast-warning">
          <span>+{coalescedCount} แจ้งเตือนเพิ่มเติม</span>
          <button className="alert-toast-close" onClick={() => setCoalescedCount(0)} aria-label="dismiss">
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
