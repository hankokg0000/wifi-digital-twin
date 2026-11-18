import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Id, SceneDoc } from '../../core';
import { sampleWorld, pointInPolygon } from '../../core';
import { useSceneStore } from '../store';
import { useSimPlans } from '../useSimPlans';
import { simClockRef } from '../simClock';
import type { Vec2 } from '../../core';
import { updateLabelWorld, setLabelHidden, setLabelPriority, toggleLabelClass } from './labels';
import { roomStatus, setRoomStatus, type AlertPoint } from './roomStatus';
import { setZoneOccupied } from './zoneOccupancy';
import { AgentMesh } from './AgentMesh';
import { PALETTE } from '../theme/palette';
import { prefersReducedMotion } from '../theme/motion';

const ROUTE_PREVIEW_WINDOW = 60; // s — how far ahead the selected agent's route line is drawn

/** Opacity for an agent currently on `levelId`, given the active level/view — mirrors
 * LevelsRenderer's own level-ghosting rule (§ SceneCanvas) so agents fade the same way their
 * floor does. 0 means "don't render". Plan view only ever shows the active level's own agents
 * (plus ones mid-stair-transit onto it, handled separately below) — any OTHER level, above or
 * below, is fully hidden so e.g. a ground-floor cat never appears ghosted onto the upper floor's
 * plan. 3D view keeps the softer above/below ghosting. */
function levelOpacity(doc: SceneDoc, levelId: Id, activeLevelId: Id, viewMode: 'plan' | '3d', hideAbove: boolean): number {
  if (levelId === activeLevelId) return 1;
  if (viewMode === 'plan') return 0;
  const active = doc.levels.find((l) => l.id === activeLevelId);
  const lvl = doc.levels.find((l) => l.id === levelId);
  if (!active || !lvl) return 1;
  const isBelow = lvl.elevation < active.elevation;
  if (hideAbove && !isBelow) return 0; // Monitor 3D cutaway: upper levels aren't drawn at all
  return isBelow ? 0.2 : 0.3;
}

function applyOpacity(group: THREE.Group, opacity: number) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !obj.userData.fx) {
      const mat = obj.material as THREE.MeshStandardMaterial;
      if (mat.opacity !== opacity) mat.opacity = opacity;
      const transparent = opacity < 1;
      if (mat.transparent !== transparent) mat.transparent = transparent;
    }
  });
}

/**
 * One persistent mesh instance per agent, positioned every animation frame by sampling the
 * (memoized) plans at the live sim clock — no React state/props involved in the motion itself,
 * so this never triggers a scene-wide re-render. Also draws the selected agent's near-term
 * route preview and, via the labels registry, keeps its name label following along.
 */
export function AgentsLayer() {
  const doc = useSceneStore((s) => s.doc);
  const activeLevelId = useSceneStore((s) => s.activeLevelId);
  const viewMode = useSceneStore((s) => s.viewMode);
  const selection = useSceneStore((s) => s.selection);
  const mode = useSceneStore((s) => s.mode);
  const tool = useSceneStore((s) => s.tool);
  const setSelection = useSceneStore((s) => s.setSelection);
  const simT = useSceneStore((s) => s.sim.t); // throttled (~10 Hz) — fine for the route overlay below
  const plans = useSimPlans();

  const groupRefs = useRef(new Map<Id, THREE.Group>());
  const reducedMotion = useRef(prefersReducedMotion());

  useFrame(({ clock }, delta) => {
    const t = simClockRef.t;
    const states = sampleWorld(doc, plans, t);
    const monitor3d = viewMode === '3d' && mode === 'monitor';
    const activeLevel = doc.levels.find((l) => l.id === activeLevelId);
    const activeTop = activeLevel ? activeLevel.elevation + activeLevel.height : Infinity;
    // Per-level floor positions / active alerts, for the Monitor room status tint.
    const levelAgents = new Map<Id, Vec2[]>();
    const levelAlerts = new Map<Id, AlertPoint[]>();

    // Zone occupancy (for ZoneMesh's per-frame pulse): recomputed fresh each frame rather than
    // incrementally, since it's cheap (few zones × few agents) and avoids tracking transitions
    // here too (computeAlerts already does that, for the actual zone-entry alerts).
    const enabledZones = doc.zones.filter((z) => z.enabled);
    const zoneOccupied = new Map<Id, boolean>();
    for (const zone of enabledZones) zoneOccupied.set(zone.id, false);

    for (const state of states) {
      const group = groupRefs.current.get(state.agentId);
      if (!group) continue;

      group.position.set(state.position[0], state.position[1], state.position[2]);
      // Ease the heading toward the sampled one along the shortest arc (snap on first sight).
      const ud = group.userData as { init?: boolean; px?: number; pz?: number; moving?: boolean };
      if (!ud.init || reducedMotion.current) {
        group.rotation.y = state.heading;
      } else {
        const d = Math.atan2(Math.sin(state.heading - group.rotation.y), Math.cos(state.heading - group.rotation.y));
        group.rotation.y += d * (1 - Math.exp(-12 * delta));
      }
      // Moving = covering ground between frames (hysteresis so it doesn't flicker).
      if (ud.init && delta > 0) {
        const speed = Math.hypot(state.position[0] - (ud.px ?? 0), state.position[2] - (ud.pz ?? 0)) / delta;
        ud.moving = speed > (ud.moving ? 0.08 : 0.15);
      } else {
        ud.moving = false;
      }
      ud.px = state.position[0];
      ud.pz = state.position[2];
      ud.init = true;

      let opacity: number;
      if (state.onStairLevels) {
        const matchesActive = state.onStairLevels.includes(activeLevelId);
        opacity = matchesActive ? 1 : viewMode === '3d' ? 1 : 0;
        // Monitor 3D cutaway: someone already climbing above the active floor is out of view.
        if (monitor3d && state.position[1] > activeTop - 0.05) opacity = 0;
      } else {
        opacity = levelOpacity(doc, state.levelId, activeLevelId, viewMode, monitor3d);
      }
      const visible = opacity > 0;
      group.visible = visible;
      if (visible) applyOpacity(group, opacity);

      const agent = doc.agents.find((a) => a.id === state.agentId);
      const labelY = state.position[1] + (agent?.height ?? 1) + 0.15;
      updateLabelWorld(`agent:${state.agentId}`, [state.position[0], labelY, state.position[2]]);
      // Ghosted (non-active level) agents carry no name label: it would only add clutter.
      setLabelHidden(`agent:${state.agentId}`, opacity < 1);

      const fallen = state.posture === 'fallen';
      toggleLabelClass(`agent:${state.agentId}`, 'label-fallen', fallen);
      let inZone = false;
      const standingGroup = group.getObjectByName('standing');
      const fallenGroup = group.getObjectByName('fallen');
      if (standingGroup) standingGroup.visible = !fallen;
      if (fallenGroup) fallenGroup.visible = fallen;
      // Floor effects (halo, selection ring, alarm rings) only at full strength: ghosted
      // levels in 3D show just the body.
      const fx = group.getObjectByName('floorfx');
      if (fx) {
        fx.visible = opacity === 1;
        const halo = fx.getObjectByName('halo');
        if (halo) halo.visible = !fallen;
        const pulse = fx.getObjectByName('pulse') as THREE.Mesh | undefined;
        if (pulse) {
          const show = !!ud.moving && !fallen;
          pulse.visible = show;
          if (show) {
            const hr = (pulse.userData.haloRadius as number | undefined) ?? 0.6;
            const mat = pulse.material as THREE.MeshBasicMaterial;
            if (reducedMotion.current) {
              pulse.scale.setScalar(hr * 1.1);
              mat.opacity = 0.3;
            } else {
              const phase = (clock.elapsedTime * 0.9) % 1;
              pulse.scale.setScalar(hr * (0.55 + phase * 0.85));
              mat.opacity = (1 - phase) * 0.55;
            }
          }
        }
        const alarm = fx.getObjectByName('alarm');
        if (alarm) {
          alarm.visible = fallen;
          if (fallen) {
            for (let i = 0; i < 3; i++) {
              const ring = alarm.getObjectByName(`alarmRing${i}`) as THREE.Mesh | undefined;
              if (!ring) continue;
              const mat = ring.material as THREE.MeshBasicMaterial;
              if (reducedMotion.current) {
                ring.scale.setScalar(0.5 + i * 0.4);
                mat.opacity = 0.85 - i * 0.28;
              } else {
                const phase = (clock.elapsedTime * 0.7 + i / 3) % 1;
                ring.scale.setScalar(0.35 + phase * 1.15);
                mat.opacity = (1 - phase) * 0.85;
              }
            }
          }
        }
      }

      if (agent && visible) {
        for (const zone of enabledZones) {
          if (zone.levelId !== state.levelId) continue;
          if (zone.appliesTo !== 'any' && zone.appliesTo !== agent.kind) continue;
          const poly = zone.roomId !== undefined ? doc.rooms.find((r) => r.id === zone.roomId)?.polygon : zone.polygon;
          if (!poly || poly.length < 3) continue;
          if (pointInPolygon([state.position[0], state.position[2]], poly)) {
            zoneOccupied.set(zone.id, true);
            inZone = true;
          }
        }
      }

      if (!state.onStairLevels) {
        const p: Vec2 = [state.position[0], state.position[2]];
        const agentList = levelAgents.get(state.levelId);
        if (agentList) agentList.push(p);
        else levelAgents.set(state.levelId, [p]);
        const severity = fallen ? 'critical' : inZone ? 'warning' : null;
        if (severity) {
          const alertList = levelAlerts.get(state.levelId);
          const item: AlertPoint = { p, severity };
          if (alertList) alertList.push(item);
          else levelAlerts.set(state.levelId, [item]);
        }
      }
      setLabelPriority(`agent:${state.agentId}`, fallen || inZone || selection === state.agentId ? 4 : 3);
    }

    if (mode === 'monitor') {
      for (const room of doc.rooms) {
        setRoomStatus(room.id, roomStatus(room.polygon, levelAgents.get(room.levelId) ?? [], levelAlerts.get(room.levelId) ?? []));
      }
    }

    for (const [zoneId, isOccupied] of zoneOccupied) setZoneOccupied(zoneId, isOccupied);
  });

  const selectedAgent = selection ? doc.agents.find((a) => a.id === selection) : undefined;
  const selectedPlan = selectedAgent ? plans.get(selectedAgent.id) : undefined;
  const routeSegments =
    selectedPlan?.segments.filter(
      (seg) => seg.kind === 'walk' && seg.levelId === activeLevelId && seg.t1 > simT && seg.t0 < simT + ROUTE_PREVIEW_WINDOW,
    ) ?? [];

  return (
    <>
      {doc.agents.map((agent) => (
        <AgentMesh
          key={agent.id}
          agent={agent}
          selected={selection === agent.id}
          interactive={tool === 'select'}
          onSelect={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            setSelection(agent.id);
          }}
          ref={(el) => {
            if (el) groupRefs.current.set(agent.id, el);
            else groupRefs.current.delete(agent.id);
          }}
        />
      ))}

      {routeSegments.map((seg, i) =>
        seg.kind === 'walk' ? (
          <Line
            key={i}
            points={seg.path.map(([x, z]): [number, number, number] => [x, 0.05, z])}
            color={PALETTE.accent}
            lineWidth={2}
            dashed
            dashSize={0.3}
            gapSize={0.2}
          />
        ) : null,
      )}

      {selectedAgent?.behavior.type === 'route' &&
        selectedAgent.behavior.waypoints
          .map((wp, i) => ({ wp, i }))
          .filter(({ wp }) => wp.levelId === activeLevelId)
          .map(({ wp, i }) => (
            <mesh key={i} position={[wp.p[0], 0.06, wp.p[1]]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.15, 16]} />
              <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.85} depthWrite={false} />
            </mesh>
          ))}
    </>
  );
}
