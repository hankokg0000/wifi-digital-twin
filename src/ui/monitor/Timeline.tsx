import { useMemo, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import { sampleWorld } from '../../core';
import { useSceneStore, type SimSpeed } from '../store';
import { useSimPlans } from '../useSimPlans';
import { useAlerts } from '../useAlerts';
import { SIM_HORIZON_SECONDS } from '../simClock';
import { clockAt } from '../sim/format';
import { Segmented } from '../components/Segmented';
import { Tooltip } from '../components/Tooltip';
import { jumpToAlert } from './actions';
import './timeline.css';

const SPEEDS: SimSpeed[] = [1, 5, 20, 60];
const BUCKETS = 240;
const TICK_MINUTES = [0, 15, 30, 45, 60];

/** Number of agents moving in each of `BUCKETS` equal slices of the horizon — computed once per
 * doc from the plans (never per tick). */
function useActivity(): { counts: number[]; max: number } {
  const doc = useSceneStore((s) => s.doc);
  const plans = useSimPlans();
  return useMemo(() => {
    const counts: number[] = [];
    for (let i = 0; i < BUCKETS; i++) {
      const t = ((i + 0.5) / BUCKETS) * SIM_HORIZON_SECONDS;
      counts.push(sampleWorld(doc, plans, t).filter((s) => s.moving).length);
    }
    return { counts, max: Math.max(1, doc.agents.length) };
  }, [doc, plans]);
}

/** Bottom bar: transport, speed, scrubber (activity strip + alert markers + playhead), clock. */
export function Timeline() {
  const t = useSceneStore((s) => s.sim.t);
  const playing = useSceneStore((s) => s.sim.playing);
  const speed = useSceneStore((s) => s.sim.speed);
  const toggle = useSceneStore((s) => s.toggle);
  const pause = useSceneStore((s) => s.pause);
  const setSpeed = useSceneStore((s) => s.setSpeed);
  const setTime = useSceneStore((s) => s.setTime);
  const alerts = useAlerts();
  const { counts, max } = useActivity();
  const scrubRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pct = (t / SIM_HORIZON_SECONDS) * 100;

  function seek(clientX: number) {
    const el = scrubRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
    setTime(Math.round(f * SIM_HORIZON_SECONDS));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 30 : 5;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setTime(t + step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setTime(t - step);
    else if (e.key === 'Home') setTime(0);
    else if (e.key === 'End') setTime(SIM_HORIZON_SECONDS);
    else return;
    e.preventDefault();
    pause();
  }

  return (
    <div className="timeline">
      <div className="timeline-transport">
        <Tooltip label={playing ? 'หยุดชั่วคราว' : 'เล่น'} shortcut="⇧Space" side="top">
          <button className="icon-btn icon-btn-lg play-btn" onClick={toggle} aria-label={playing ? 'หยุดชั่วคราว' : 'เล่น'}>
            {playing ? <Pause size={20} strokeWidth={1.5} fill="currentColor" /> : <Play size={20} strokeWidth={1.5} fill="currentColor" />}
          </button>
        </Tooltip>
        <Segmented
          label="ความเร็ว"
          value={speed}
          onChange={setSpeed}
          options={SPEEDS.map((s) => ({ value: s, label: <span className="mono">×{s}</span>, ariaLabel: `ความเร็ว ×${s}` }))}
        />
      </div>

      <div className="scrub">
        <div className="scrub-activity" aria-hidden="true">
          {counts.map((c, i) => (
            <span key={i} className="scrub-bar" style={{ height: `${Math.max(1, (c / max) * 100)}%`, opacity: c === 0 ? 0.35 : 1 }} />
          ))}
        </div>

        <div
          ref={scrubRef}
          className="scrub-track"
          role="slider"
          tabIndex={0}
          aria-label="เวลาจำลอง"
          aria-valuemin={0}
          aria-valuemax={SIM_HORIZON_SECONDS}
          aria-valuenow={Math.round(t)}
          aria-valuetext={clockAt(t)}
          onKeyDown={onKeyDown}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = true;
            pause();
            seek(e.clientX);
          }}
          onPointerMove={(e) => dragging.current && seek(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <div className="scrub-rail" />
          <div className="scrub-fill" style={{ width: `${pct}%` }} />
          <div className="scrub-head" style={{ left: `${pct}%` }} />
        </div>
        <div className="scrub-line" style={{ left: `${pct}%` }} aria-hidden="true" />

        <div className="scrub-markers">
          {alerts.map((a) => (
            <Tooltip key={a.id} label={`${clockAt(a.t)}  ${a.message}`} side="top">
              <button
                type="button"
                className={`marker marker-${a.severity}`}
                style={{ left: `${(a.t / SIM_HORIZON_SECONDS) * 100}%` }}
                aria-label={a.message}
                onClick={() => jumpToAlert(a)}
              />
            </Tooltip>
          ))}
        </div>

        <div className="scrub-ticks mono" aria-hidden="true">
          {TICK_MINUTES.map((m) => (
            <span key={m} style={{ left: `${(m * 60 * 100) / SIM_HORIZON_SECONDS}%` }}>
              {clockAt(m * 60).slice(0, 5)}
            </span>
          ))}
        </div>
      </div>

      <div className="timeline-clock">
        <time className="clock mono">{clockAt(t)}</time>
        <span className="clock-sub">สิ้นสุด {clockAt(SIM_HORIZON_SECONDS).slice(0, 5)}</span>
      </div>
    </div>
  );
}
