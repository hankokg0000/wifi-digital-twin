import { useEffect, useRef } from 'react';
import type { Reading, Verdict } from '../../core/sensing/types';

const WINDOW_S = 60;
const HEIGHT = 120;
const RSSI_H = 80;
const GAP = 6;
const SCORE_H = HEIGHT - RSSI_H - GAP;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/**
 * Last 60 s of RSSI (top) and motion score with its ON threshold (bottom), motion periods shaded.
 * Reads the mutable buffers straight from the store module on every animation frame; it only runs
 * while mounted and never touches React state.
 */
export function SensingChart({ data, label = 'กราฟสัญญาณ WiFi 60 วินาทีล่าสุด', windowSeconds = WINDOW_S, fitAvailable = false }: {
  data: { readings: Reading[]; verdicts: Verdict[] };
  label?: string;
  windowSeconds?: number;
  fitAvailable?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const current = useRef(data);
  current.current = data;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c = {
      ink: cssVar('--ink'),
      ink3: cssVar('--ink-3'),
      line: cssVar('--line'),
      accent: cssVar('--accent'),
      accentWeak: cssVar('--accent-weak'),
      mono: cssVar('--font-mono'),
    };
    let w = 0;
    let dpr = 1;
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.round(HEIGHT * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, HEIGHT);
      const { readings, verdicts } = current.current;
      const last = readings[readings.length - 1];
      const tEnd = last ? last.t : 0;
      const elapsed = tEnd - (readings[0]?.t ?? tEnd);
      const duration = fitAvailable ? Math.min(windowSeconds, Math.max(5, elapsed)) : windowSeconds;
      const tStart = tEnd - duration;
      const x = (t: number) => ((t - tStart) / duration) * w;

      // panels
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, w, RSSI_H);
      ctx.fillRect(0, RSSI_H + GAP, w, SCORE_H);

      // motion shading across both panels
      ctx.fillStyle = c.accent;
      let runStart: number | null = null;
      const flush = (end: number) => {
        if (runStart === null) return;
        const x0 = Math.max(0, x(runStart));
        const x1 = Math.min(w, x(end));
        if (x1 > x0) {
          ctx.globalAlpha = 0.28;
          ctx.fillRect(x0, 0, x1 - x0, RSSI_H);
          ctx.fillRect(x0, RSSI_H + GAP, x1 - x0, SCORE_H);
          ctx.globalAlpha = 1;
          ctx.fillRect(x0, RSSI_H - 3, x1 - x0, 3); // thin solid bar along the bottom of the RSSI plot
        }
        runStart = null;
      };
      for (const v of verdicts) {
        if (v.t < tStart - 1) continue;
        if (v.motion && runStart === null) runStart = v.t - 0.5;
        if (!v.motion) flush(v.t - 0.5);
      }
      flush(tEnd);

      if (!last) {
        ctx.fillStyle = c.ink3;
        ctx.font = `11px ${c.mono}`;
        ctx.textAlign = 'center';
        ctx.fillText('รอข้อมูล…', w / 2, RSSI_H / 2 + 4);
        return;
      }

      // RSSI line
      const pts = readings.filter((r) => r.t >= tStart);
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of pts) {
        lo = Math.min(lo, r.rssi);
        hi = Math.max(hi, r.rssi);
      }
      const mid = (lo + hi) / 2;
      const span = Math.max(8, hi - lo + 4);
      const yMin = mid - span / 2;
      const yr = (v: number) => RSSI_H - 4 - ((v - yMin) / span) * (RSSI_H - 8);
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 1.25;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((r, i) => (i === 0 ? ctx.moveTo(x(r.t), yr(r.rssi)) : ctx.lineTo(x(r.t), yr(r.rssi))));
      ctx.stroke();
      if (fitAvailable && pts.length === 1) {
        ctx.fillStyle = c.ink;
        ctx.fillRect(w - 4, yr(last.rssi) - 1, 3, 3);
      }
      ctx.fillStyle = c.ink3;
      ctx.font = `10px ${c.mono}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(yMin + span)}`, 4, 11);
      ctx.fillText(`${Math.round(yMin)}`, 4, RSSI_H - 4);

      // score strip + ON threshold
      const vs = verdicts.filter((v) => v.t >= tStart);
      if (vs.length > 0) {
        const on = vs[vs.length - 1]!.onThreshold;
        const top = Math.max(on * 1.8, ...vs.map((v) => v.score), 1);
        const ys = (v: number) => RSSI_H + GAP + SCORE_H - 2 - (Math.min(v, top) / top) * (SCORE_H - 4);
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        vs.forEach((v, i) => (i === 0 ? ctx.moveTo(x(v.t), ys(v.score)) : ctx.lineTo(x(v.t), ys(v.score))));
        ctx.stroke();
        ctx.strokeStyle = c.ink3;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, ys(on));
        ctx.lineTo(w, ys(on));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [fitAvailable, windowSeconds]);

  return <canvas ref={ref} className="sensing-chart" style={{ height: HEIGHT }} aria-label={label} role="img" />;
}
