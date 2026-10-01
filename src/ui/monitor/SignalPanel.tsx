import { useMemo } from 'react';
import { useSceneStore } from '../store';
import { Section } from '../components/Section';
import { Switch } from '../components/Switch';
import { useHeatmap } from '../rf/useHeatmap';
import { QUALITY_COLOR, QUALITY_ICON, QUALITY_TH, fmtDbm, polygonCentroid } from '../rf/quality';

/** Left rail "คุณภาพสัญญาณ": rooms of the active floor, weakest first. */
export function SignalPanel() {
  const doc = useSceneStore((s) => s.doc);
  const activeLevelId = useSceneStore((s) => s.activeLevelId);
  const selection = useSceneStore((s) => s.selection);
  const { enabled, band } = useSceneStore((s) => s.heatmap);
  const setHeatmap = useSceneStore((s) => s.setHeatmap);
  const setSelection = useSceneStore((s) => s.setSelection);
  const requestFocus = useSceneStore((s) => s.requestFocus);
  const { coverage, pending } = useHeatmap();

  const rows = useMemo(() => {
    const roomById = new Map(doc.rooms.map((r) => [r.id, r]));
    return [...coverage]
      .sort((a, b) => a.meanDbm - b.meanDbm)
      .flatMap((c) => {
        const room = roomById.get(c.roomId);
        return room ? [{ c, room }] : [];
      });
  }, [coverage, doc.rooms]);
  const roomCount = doc.rooms.filter((r) => r.levelId === activeLevelId).length;

  return (
    <Section
      title="คุณภาพสัญญาณ"
      collapsible
      aside={<span className="mono">{band} GHz</span>}
    >
      <div className="signal-toggle">
        <span>แสดงบนแผนผัง</span>
        <Switch checked={enabled} label="แสดงสัญญาณ WiFi บนแผนผัง" onChange={(v) => setHeatmap({ enabled: v })} />
      </div>
      {pending && roomCount > 0 ? (
        <ul className="signal-list" aria-busy="true" aria-label="กำลังคำนวณ">
          {Array.from({ length: Math.min(roomCount, 5) }, (_, i) => (
            <li key={i} className="signal-row signal-skeleton">
              <span className="signal-bar-sk" />
              <span className="signal-sk-text">{i === 0 ? 'กำลังคำนวณ…' : ''}</span>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="empty-hint">ชั้นนี้ยังไม่มีห้อง — วาดห้องในโหมด Edit</p>
      ) : (
        <ul className="signal-list">
          {rows.map(({ c, room }) => {
            const Icon = QUALITY_ICON[c.quality];
            return (
              <li key={c.roomId}>
                <button
                  type="button"
                  className={`signal-row${selection === c.roomId ? ' selected' : ''}`}
                  aria-pressed={selection === c.roomId}
                  onClick={() => {
                    setSelection(c.roomId);
                    const [x, z] = polygonCentroid(room.polygon);
                    requestFocus(x, z);
                  }}
                >
                  <Icon size={16} strokeWidth={1.5} style={{ color: QUALITY_COLOR[c.quality] }} aria-hidden="true" />
                  <span className="signal-name">{room.name}</span>
                  <span className="signal-q">{QUALITY_TH[c.quality]}</span>
                  <span className="signal-dbm mono">{fmtDbm(c.meanDbm)} dBm</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
