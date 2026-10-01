import { useSceneStore } from '../store';
import { COLORMAP_MAX_DBM, COLORMAP_MIN_DBM, COLORMAP_STOPS, dbmToCss } from './colormap';

const SPAN = COLORMAP_MAX_DBM - COLORMAP_MIN_DBM;
const pct = (dbm: number) => ((dbm - COLORMAP_MIN_DBM) / SPAN) * 100;

// Words sit centred between the tick values they describe.
const WORDS = [
  { label: 'อ่อน', from: -90, to: -75 },
  { label: 'พอใช้', from: -75, to: -67 },
  { label: 'ดี', from: -67, to: -55 },
  { label: 'ดีมาก', from: -55, to: -30 },
];

const GRADIENT = `linear-gradient(90deg, ${Array.from({ length: 21 }, (_, i) => {
  const dbm = COLORMAP_MIN_DBM + (SPAN * i) / 20;
  return `${dbmToCss(dbm)} ${(i * 5).toFixed(0)}%`;
}).join(', ')})`;

/** Canvas key for the signal layer: colour ramp, dBm ticks and what the zones mean. */
export function HeatmapLegend() {
  const enabled = useSceneStore((s) => s.heatmap.enabled);
  const band = useSceneStore((s) => s.heatmap.band);
  if (!enabled) return null;
  return (
    <div className="heat-legend" aria-label="คำอธิบายสีความแรงสัญญาณ">
      <div className="heat-legend-head">
        <span>ความแรงสัญญาณ (dBm)</span>
        <span className="mono">{band} GHz</span>
      </div>
      <div className="heat-scale">
        <div className="heat-bar" style={{ background: GRADIENT }} />
        <div className="heat-ticks mono" aria-hidden="true">
          {COLORMAP_STOPS.map((s) => (
            <span key={s.dbm} style={{ left: `${pct(s.dbm)}%` }}>
              {s.dbm.toString().replace('-', '−')}
            </span>
          ))}
        </div>
        <div className="heat-words" aria-hidden="true">
          {WORDS.map((w) => (
            <span key={w.label} style={{ left: `${pct(w.from)}%`, width: `${pct(w.to) - pct(w.from)}%` }}>
              {w.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
