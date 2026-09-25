import { useMemo } from 'react';
import type { SceneDoc, WorldAgentState } from '../../core';
import { sampleWorld, pointInPolygon } from '../../core';
import { useSceneStore, type SimSpeed } from '../store';
import { useSimPlans } from '../useSimPlans';
import { useAlerts } from '../useAlerts';
import { SIM_HORIZON_SECONDS, SIM_DAY_START_SECONDS, formatClock } from '../simClock';

const SPEEDS: SimSpeed[] = [1, 5, 20, 60];

function currentRoomLabel(doc: SceneDoc, state: WorldAgentState): string {
  if (state.onStairLevels) return 'บันได';
  const room = doc.rooms.find(
    (r) => r.levelId === state.levelId && pointInPolygon([state.position[0], state.position[2]], r.polygon),
  );
  return room?.name ?? '—';
}

/** DOM bar pinned to the bottom of the canvas area: playback controls, scrubber, clock, and
 * per-agent chips. Reads `sim.t` from the store (throttled to ~10 Hz by SimClock), which is
 * plenty for these — unlike the 3D scene, this is cheap to re-render at that rate. */
export function SimBar() {
  const sim = useSceneStore((s) => s.sim);
  const doc = useSceneStore((s) => s.doc);
  const selection = useSceneStore((s) => s.selection);
  const setSelection = useSceneStore((s) => s.setSelection);
  const setActiveLevelId = useSceneStore((s) => s.setActiveLevelId);
  const pause = useSceneStore((s) => s.pause);
  const toggle = useSceneStore((s) => s.toggle);
  const setSpeed = useSceneStore((s) => s.setSpeed);
  const setTime = useSceneStore((s) => s.setTime);
  const resetTime = useSceneStore((s) => s.resetTime);
  const plans = useSimPlans();
  const alerts = useAlerts();

  const states = useMemo(() => sampleWorld(doc, plans, sim.t), [doc, plans, sim.t]);

  return (
    <div className="sim-bar">
      <button className="toolbar-btn" onClick={toggle} title="Play/Pause (Shift+Space)">
        {sim.playing ? '⏸' : '▶'}
      </button>

      <div className="sim-bar-speeds">
        {SPEEDS.map((sp) => (
          <button key={sp} className={`toolbar-btn${sim.speed === sp ? ' active' : ''}`} onClick={() => setSpeed(sp)}>
            ×{sp}
          </button>
        ))}
      </div>

      <div className="sim-bar-slider-wrap">
        <input
          className="sim-bar-slider"
          type="range"
          min={0}
          max={SIM_HORIZON_SECONDS}
          step={1}
          value={sim.t}
          onPointerDown={pause}
          onChange={(e) => setTime(Number(e.target.value))}
        />
        <div className="sim-bar-ticks">
          {alerts.map((a) => (
            <span
              key={a.id}
              className={`sim-bar-tick${a.severity === 'critical' ? ' critical' : ''}`}
              style={{ left: `${(a.t / SIM_HORIZON_SECONDS) * 100}%` }}
              title={a.message}
            />
          ))}
        </div>
      </div>

      <span className="sim-bar-clock">{formatClock(SIM_DAY_START_SECONDS + sim.t)}</span>

      <button className="toolbar-btn" onClick={resetTime} title="Reset to 0">
        ⟲
      </button>

      <div className="sim-bar-chips">
        {states.map((state) => {
          const agent = doc.agents.find((a) => a.id === state.agentId);
          if (!agent) return null;
          return (
            <button
              key={state.agentId}
              className={`sim-chip${selection === state.agentId ? ' active' : ''}`}
              onClick={() => {
                // setActiveLevelId clears selection as a side effect (switching floors drops
                // whatever was selected there), so set the level first and select second.
                setActiveLevelId(state.onStairLevels ? state.onStairLevels[0] : state.levelId);
                setSelection(state.agentId);
              }}
            >
              <span className="sim-chip-dot" style={{ background: agent.color }} />
              {agent.name}
              {state.posture === 'fallen' && <span title="ล้ม">🚨</span>}
              <span className="sim-chip-room">{currentRoomLabel(doc, state)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
