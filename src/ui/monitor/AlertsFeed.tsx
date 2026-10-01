import { Siren, TriangleAlert, ShieldCheck, Check } from 'lucide-react';
import { useSceneStore } from '../store';
import { useMonitorModel } from '../sim/useMonitorModel';
import { clockAt, relativeThai } from '../sim/format';
import type { AlertItem } from '../sim/model';
import { jumpToAlert } from './actions';

function Item({ item, simT, onAck }: { item: AlertItem; simT: number; onAck?: () => void }) {
  const { alert } = item;
  const critical = alert.severity === 'critical';
  const Icon = critical ? Siren : TriangleAlert;
  return (
    <li className={`feed-item${critical && !item.acknowledged ? ' feed-item-critical' : ''}`}>
      <button type="button" className="feed-main" onClick={() => jumpToAlert(alert)}>
        <span className={`feed-icon ${critical ? 'feed-icon-critical' : 'feed-icon-warning'}`}>
          <Icon size={16} strokeWidth={1.5} />
        </span>
        <span className="feed-body">
          <span className="feed-message">{alert.message}</span>
          <span className="feed-meta">
            <span className="mono">{clockAt(alert.t)}</span>
            <span>{relativeThai(simT, alert.t)}</span>
            <span>{item.room}</span>
            {critical && !item.active && <span className="feed-resolved">ลุกขึ้นแล้ว</span>}
          </span>
        </span>
      </button>
      {onAck && (
        <button type="button" className="btn btn-sm feed-ack" onClick={onAck}>
          <Check size={14} strokeWidth={1.5} />
          รับทราบ
        </button>
      )}
    </li>
  );
}

/** Right rail "การแจ้งเตือน": unacknowledged first, then history. Acknowledging is UI state only. */
export function AlertsFeed() {
  const { attention, history } = useMonitorModel();
  const simT = useSceneStore((s) => s.sim.t);
  const acknowledge = useSceneStore((s) => s.acknowledge);

  function ackAgent(item: AlertItem) {
    const ids = attention.filter((i) => i.alert.severity === 'critical' && i.alert.agentId === item.alert.agentId).map((i) => i.alert.id);
    acknowledge(ids);
  }

  const empty = attention.length === 0 && history.length === 0;

  return (
    <div className="feed">
      <header className="feed-head">
        <h2 className="section-title">การแจ้งเตือน</h2>
        <span className="mono feed-count">{attention.length + history.length}</span>
      </header>
      {empty ? (
        <div className="feed-empty">
          <ShieldCheck size={32} strokeWidth={1.5} />
          <p>ยังไม่มีเหตุการณ์ — กด ▶ เพื่อเริ่มจำลอง</p>
        </div>
      ) : (
        <div className="feed-scroll">
          {attention.length > 0 && (
            <>
              <h3 className="feed-group">
                ยังไม่รับทราบ <span className="mono">{attention.length}</span>
              </h3>
              <ul className="feed-list">
                {attention.map((item) => (
                  <Item
                    key={item.alert.id}
                    item={item}
                    simT={simT}
                    onAck={item.alert.severity === 'critical' ? () => ackAgent(item) : undefined}
                  />
                ))}
              </ul>
            </>
          )}
          {history.length > 0 && (
            <>
              <h3 className="feed-group">
                ประวัติ <span className="mono">{history.length}</span>
              </h3>
              <ul className="feed-list">
                {history.map((item) => (
                  <Item key={item.alert.id} item={item} simT={simT} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
