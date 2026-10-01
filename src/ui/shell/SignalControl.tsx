import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Wifi } from 'lucide-react';
import { useSceneStore } from '../store';
import { Segmented } from '../components/Segmented';
import { Tooltip } from '../components/Tooltip';

/**
 * Top-bar toggle for the WiFi signal layer. When on, a chevron opens a small popover with the
 * band and the source (strongest AP, or one specific AP).
 */
export function SignalControl() {
  const { enabled, band, source } = useSceneStore((s) => s.heatmap);
  const setHeatmap = useSceneStore((s) => s.setHeatmap);
  const radios = useSceneStore((s) => s.doc.radios);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const aps = radios.filter((r) => r.role === 'ap');
  const sourceValue = aps.some((r) => r.id === source) ? source : 'best';

  return (
    <div className="rf-ctl" ref={ref}>
      <div className="seg" role="group" aria-label="สัญญาณ WiFi">
        <Tooltip label="แสดงความแรงสัญญาณ WiFi บนแผนผัง">
          <button
            type="button"
            className={`seg-btn${enabled ? ' active' : ''}`}
            aria-pressed={enabled}
            aria-label="สัญญาณ WiFi"
            onClick={() => {
              setHeatmap({ enabled: !enabled });
              setOpen(!enabled);
            }}
          >
            <Wifi size={16} strokeWidth={1.5} />
            <span className="rf-label">สัญญาณ WiFi</span>
          </button>
        </Tooltip>
        {enabled && (
          <Tooltip label="ตั้งค่าสัญญาณ">
            <button
              type="button"
              className={`seg-btn seg-btn-icon${open ? ' active' : ''}`}
              aria-label="ตั้งค่าสัญญาณ"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <ChevronDown size={16} strokeWidth={1.5} />
            </button>
          </Tooltip>
        )}
      </div>

      {enabled && open && (
        <div className="rf-pop" role="dialog" aria-label="ตั้งค่าสัญญาณ WiFi">
          <div className="rf-pop-group">
            <span className="rf-pop-label">ย่านความถี่</span>
            <Segmented
              label="ย่านความถี่"
              fill
              value={band}
              onChange={(b) => setHeatmap({ band: b })}
              options={[
                { value: '2.4', label: '2.4 GHz' },
                { value: '5', label: '5 GHz' },
              ]}
            />
          </div>
          <div className="rf-pop-group">
            <span className="rf-pop-label">แหล่งสัญญาณ</span>
            <Segmented
              label="แหล่งสัญญาณ"
              fill
              value={sourceValue}
              onChange={(v) => setHeatmap({ source: v })}
              options={[{ value: 'best', label: 'ดีที่สุด' }, ...aps.map((r) => ({ value: r.id, label: r.name }))]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
