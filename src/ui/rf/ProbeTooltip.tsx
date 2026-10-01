import { useProbeStore } from './probeStore';
import { QUALITY_COLOR, QUALITY_ICON, QUALITY_TH, fmtDbm } from './quality';

const W = 264; // px, tooltip width (keep in step with .probe in rf.css)
const OFFSET = 16;

/** Hover probe: per-AP RSSI at the cursor plus what the strongest link passes through. */
export function ProbeTooltip() {
  const at = useProbeStore((s) => s.at);
  const data = useProbeStore((s) => s.data);
  if (!at || !data) return null;

  const flipX = at.x + OFFSET + W > at.w;
  const flipY = at.y > at.h - 190;
  const style = {
    left: flipX ? at.x - OFFSET - W : at.x + OFFSET,
    top: flipY ? undefined : at.y + OFFSET,
    bottom: flipY ? at.h - at.y + OFFSET : undefined,
  };

  return (
    <div className="probe" style={style} role="status" aria-live="off">
      {data.roomName && <div className="probe-room">{data.roomName}</div>}
      {data.rows.length === 0 ? (
        <p className="probe-empty">ไม่มี AP บนย่านนี้</p>
      ) : (
        <ul className="probe-rows">
          {data.rows.map((r) => {
            const Icon = QUALITY_ICON[r.quality];
            return (
              <li key={r.radioId} className="probe-row">
                <Icon size={14} strokeWidth={1.5} style={{ color: QUALITY_COLOR[r.quality] }} aria-hidden="true" />
                <span className="probe-name">{r.name}</span>
                <span className="probe-dbm mono">{fmtDbm(r.dbm)} dBm</span>
                <span className="probe-q">{QUALITY_TH[r.quality]}</span>
              </li>
            );
          })}
        </ul>
      )}
      {data.rows.length > 0 && (
        <div className="probe-path">
          <div className="probe-path-head">
            ถึง {data.linkName} · <span className="mono">{data.distance.toFixed(1)}</span> ม.
          </div>
          {data.obstructions.length === 0 ? (
            <div className="probe-clear">เห็นกันตรงๆ ไม่มีสิ่งกีดขวาง</div>
          ) : (
            <ul className="probe-obs">
              {data.obstructions.map((o) => (
                <li key={o.name}>
                  <span>
                    {o.name}
                    {o.count > 1 && <span className="mono"> ×{o.count}</span>}
                  </span>
                  <span className="mono">−{o.lossDb} dB</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
