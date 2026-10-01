import { Siren, Eye, Check } from 'lucide-react';
import { useSceneStore } from '../store';
import { useMonitorModel } from '../sim/useMonitorModel';
import { formatDuration } from '../sim/format';
import { jumpToAlert, focusAgent } from './actions';

/** Pinned to the top of the canvas (never modal, never over the rails) while an unacknowledged
 * critical alert's person is still down. */
export function CriticalBanner() {
  const { banner, occupants, attention } = useMonitorModel();
  const acknowledge = useSceneStore((s) => s.acknowledge);
  const top = banner[0];
  if (!top) return null;

  const { alert } = top;
  const occupant = occupants.find((o) => o.id === alert.agentId);
  const extra = new Set(banner.map((b) => b.alert.agentId)).size - 1;

  function ack() {
    acknowledge(attention.filter((i) => i.alert.severity === 'critical').map((i) => i.alert.id));
  }

  return (
    <div className="banner" role="alert">
      <Siren size={24} strokeWidth={1.5} className="banner-icon" />
      <div className="banner-text">
        <strong>{alert.message}</strong>
        {extra > 0 && <span className="banner-extra">และอีก {extra} เหตุการณ์</span>}
      </div>
      {occupant?.fallenFor != null && (
        <div className="banner-timer mono" aria-label="ระยะเวลาที่ล้ม">
          ล้มมา {formatDuration(occupant.fallenFor)}
        </div>
      )}
      <button
        className="btn banner-btn"
        onClick={() =>
          occupant ? focusAgent(occupant.id, occupant.levelId, occupant.position[0], occupant.position[2]) : jumpToAlert(alert)
        }
      >
        <Eye size={16} strokeWidth={1.5} />
        ดูตำแหน่ง
      </button>
      <button className="btn banner-btn banner-btn-solid" onClick={ack}>
        <Check size={16} strokeWidth={1.5} />
        รับทราบ
      </button>
    </div>
  );
}
