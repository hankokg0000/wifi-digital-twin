import { useState } from 'react';
import { Siren, TriangleAlert, ShieldCheck, Check } from 'lucide-react';
import { useSceneStore } from '../store';
import { useMonitorModel } from '../sim/useMonitorModel';
import { clockAt, relativeThai } from '../sim/format';
import type { AlertItem } from '../sim/model';
import { Segmented } from '../components/Segmented';
import { useSensingStore, type ObservedAlert } from '../sensing/sensingStore';
import { jumpToAlert, jumpToRoomLevel } from './actions';

type SourceFilter = 'all' | 'simulated' | 'observed';

function SourceBadge({ source, replay }: { source: 'simulated' | 'observed'; replay?: boolean }) {
  if (source === 'simulated') return <span className="src-badge src-badge-sim">จำลอง</span>;
  return <span className="src-badge src-badge-obs">{replay ? 'ของจริง · ย้อนหลัง' : 'ของจริง'}</span>;
}

const realClock = (tSec: number) => new Date(tSec * 1000).toLocaleTimeString('th-TH', { hour12: false });

function ObservedItem({ alert, roomName, active }: { alert: ObservedAlert; roomName: string; active: boolean }) {
  return (
    <li className="feed-item">
      <button type="button" className="feed-main" onClick={() => jumpToRoomLevel(alert.levelId, alert.position[0], alert.position[2])}>
        <span className="feed-icon feed-icon-warning">
          <TriangleAlert size={16} strokeWidth={1.5} />
        </span>
        <span className="feed-body">
          <span className="feed-message">{alert.message}</span>
          <span className="feed-meta">
            <span className="mono">{realClock(alert.t)}</span>
            <span>{roomName}</span>
            <SourceBadge source="observed" replay={alert.replay} />
            {active && <span className="feed-live">กำลังเคลื่อนไหว</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

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
            <SourceBadge source="simulated" />
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
export function AlertsFeed({ forcedFilter }: { forcedFilter?: SourceFilter } = {}) {
  const { attention, history } = useMonitorModel();
  const simT = useSceneStore((s) => s.sim.t);
  const acknowledge = useSceneStore((s) => s.acknowledge);

  function ackAgent(item: AlertItem) {
    const ids = attention.filter((i) => i.alert.severity === 'critical' && i.alert.agentId === item.alert.agentId).map((i) => i.alert.id);
    acknowledge(ids);
  }

  const doc = useSceneStore((s) => s.doc);
  const observed = useSensingStore((s) => s.observedAlerts);
  const activeId = useSensingStore((s) => s.observedActiveId);
  const [pickedFilter, setFilter] = useState<SourceFilter>('all');
  const filter = forcedFilter ?? pickedFilter;
  const showSim = filter !== 'observed';
  const showObs = filter !== 'simulated';
  const simAttention = showSim ? attention : [];
  const simHistory = showSim ? history : [];
  const obsItems = showObs ? [...observed].reverse() : [];
  const roomName = (a: ObservedAlert) => doc.rooms.find((r) => r.levelId === a.levelId && a.zoneId && doc.zones.find((z) => z.id === a.zoneId)?.roomId === r.id)?.name ?? '—';
  const empty = simAttention.length === 0 && simHistory.length === 0 && obsItems.length === 0;

  return (
    <div className="feed">
      <header className="feed-head">
        <h2 className="section-title">การแจ้งเตือน</h2>
        <span className="mono feed-count">{simAttention.length + simHistory.length + obsItems.length}</span>
      </header>
      {!forcedFilter && <div className="feed-filter">
        <Segmented
          fill
          label="กรองตามแหล่งที่มา"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'ทั้งหมด' },
            { value: 'simulated', label: 'จำลอง' },
            { value: 'observed', label: 'ของจริง' },
          ]}
        />
      </div>}
      {empty ? (
        <div className="feed-empty">
          <ShieldCheck size={32} strokeWidth={1.5} />
          <p>{filter === 'observed' ? 'ยังไม่พบการเคลื่อนไหวจาก WiFi' : 'ยังไม่มีเหตุการณ์ — กด ▶ เพื่อเริ่มจำลอง'}</p>
        </div>
      ) : (
        <div className="feed-scroll">
          {obsItems.length > 0 && (
            <>
              <h3 className="feed-group">
                ของจริงจาก WiFi <span className="mono">{obsItems.length}</span>
              </h3>
              <ul className="feed-list">
                {obsItems.map((a) => (
                  <ObservedItem key={a.id} alert={a} roomName={roomName(a)} active={a.id === activeId} />
                ))}
              </ul>
            </>
          )}
          {simAttention.length > 0 && (
            <>
              <h3 className="feed-group">
                ยังไม่รับทราบ <span className="mono">{simAttention.length}</span>
              </h3>
              <ul className="feed-list">
                {simAttention.map((item) => (
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
          {simHistory.length > 0 && (
            <>
              <h3 className="feed-group">
                ประวัติ <span className="mono">{simHistory.length}</span>
              </h3>
              <ul className="feed-list">
                {simHistory.map((item) => (
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
