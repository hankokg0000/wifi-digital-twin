import { useState } from 'react';
import type { Alert } from '../../core';
import { useSceneStore } from '../store';
import { useAlerts } from '../useAlerts';
import { SIM_DAY_START_SECONDS, formatClock } from '../simClock';

const KIND_ICON: Record<Alert['severity'], string> = { warning: '⚠️', critical: '🚨' };

/** Right-column panel, above the Inspector: every alert with t <= the current sim time, newest
 * first. Clicking one jumps the sim there (paused), selects the agent, and switches level. */
export function AlertsPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const simT = useSceneStore((s) => s.sim.t);
  const pause = useSceneStore((s) => s.pause);
  const setTime = useSceneStore((s) => s.setTime);
  const setSelection = useSceneStore((s) => s.setSelection);
  const setActiveLevelId = useSceneStore((s) => s.setActiveLevelId);
  const alerts = useAlerts();

  const visible = alerts.filter((a) => a.t <= simT).sort((a, b) => b.t - a.t);

  function jumpTo(alert: Alert) {
    pause();
    // setActiveLevelId clears selection as a side effect (see SimBar's chip handler), so set the
    // level first and select second.
    setActiveLevelId(alert.levelId);
    setSelection(alert.agentId);
    setTime(alert.t);
  }

  return (
    <div className="alerts-panel">
      <button className="alerts-panel-header" onClick={() => setCollapsed((v) => !v)}>
        <span>แจ้งเตือน</span>
        <span className="alerts-panel-badge">{visible.length}</span>
        <span className="alerts-panel-collapse">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <ul className="alerts-list">
          {visible.length === 0 ? (
            <li className="empty-hint">ยังไม่มีแจ้งเตือน</li>
          ) : (
            visible.map((a) => (
              <li key={a.id}>
                <button className={`alert-item alert-${a.severity}`} onClick={() => jumpTo(a)}>
                  <span className="alert-icon">{KIND_ICON[a.severity]}</span>
                  <span className="alert-time">{formatClock(SIM_DAY_START_SECONDS + a.t)}</span>
                  <span className="alert-message">{a.message}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
