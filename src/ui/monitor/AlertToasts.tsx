import { useEffect, useRef, useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import type { Alert } from '../../core';
import { useSceneStore } from '../store';
import { useAlerts } from '../useAlerts';

interface ToastItem {
  id: string;
  alert: Alert;
}

const COALESCE_WINDOW_MS = 1000;
const COALESCE_THRESHOLD = 3; // more than this many in the window fold into a summary
const AUTO_DISMISS_MS = 3000;

/**
 * Bottom-right transient toasts for WARNINGS the sim clock crosses while playing. Criticals do
 * not toast — they get the pinned banner and the feed. Fires for each alert whose time falls in
 * (prevT, t]; bursts collapse into one summary.
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

    const crossed = alerts.filter((a) => a.severity === 'warning' && a.t > prevT && a.t <= simT);
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
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), AUTO_DISMISS_MS);
    }
  }, [simT, playing, alerts]);

  useEffect(() => {
    if (coalescedCount === 0) return;
    const t = setTimeout(() => setCoalescedCount(0), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [coalescedCount]);

  if (toasts.length === 0 && coalescedCount === 0) return null;

  return (
    <div className="warn-toasts" role="status">
      {toasts.map(({ id, alert }) => (
        <div key={id} className="warn-toast">
          <TriangleAlert size={16} strokeWidth={1.5} />
          <span>{alert.message}</span>
          <button className="icon-btn" aria-label="ปิด" onClick={() => setToasts((p) => p.filter((t) => t.id !== id))}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      ))}
      {coalescedCount > 0 && (
        <div className="warn-toast">
          <TriangleAlert size={16} strokeWidth={1.5} />
          <span>+{coalescedCount} แจ้งเตือนเพิ่มเติม</span>
          <button className="icon-btn" aria-label="ปิด" onClick={() => setCoalescedCount(0)}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
