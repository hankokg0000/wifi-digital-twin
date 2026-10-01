import { useCallback, type ReactNode } from 'react';
import { CameraOff, Wifi } from 'lucide-react';
import { useSceneStore } from './store';
import { registerLabel, unregisterLabel } from './canvas/labels';
import { useHeatmapStore } from './rf/heatmapStore';
import { QUALITY_COLOR, QUALITY_ICON, fmtDbm } from './rf/quality';
import type { Id, Vec2 } from '../core';

/** Average of a room's polygon vertices, in the same [x, z] shape RoomMesh used for its label. */
function centroid(polygon: Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const p of polygon) {
    x += p[0];
    z += p[1];
  }
  return [x / polygon.length, z / polygon.length];
}

/** Signal-bars glyph + mean dBm under a room's name, while the signal layer is on and the
 * latest result is for this floor and band. Selects primitives so it only re-renders on change. */
function RoomSignal({ roomId, levelId }: { roomId: Id; levelId: Id }) {
  const band = useSceneStore((s) => s.heatmap.band);
  const valid = useHeatmapStore((s) => s.heatmap?.levelId === levelId && s.heatmap.band === band);
  const quality = useHeatmapStore((s) => s.coverage.find((c) => c.roomId === roomId)?.quality);
  const mean = useHeatmapStore((s) => s.coverage.find((c) => c.roomId === roomId)?.meanDbm);
  if (!valid || quality === undefined || mean === undefined) return null;
  const Icon = QUALITY_ICON[quality];
  return (
    <span className="room-signal" style={{ color: QUALITY_COLOR[quality] }}>
      <Icon size={13} strokeWidth={1.5} aria-hidden="true" />
      <span className="mono">{fmtDbm(mean)}</span>
    </span>
  );
}

interface LabelDivProps {
  id: string;
  className: string;
  world: [number, number, number];
  children: ReactNode;
}

/**
 * A single overlay label. Registers itself (and its current world position) in the shared
 * registry on mount and whenever `world` changes, and unregisters on unmount. Starts hidden;
 * <LabelProjector> (inside <Canvas>) positions it and reveals it once it has a screen position.
 */
function LabelDiv({ id, className, world, children }: LabelDivProps) {
  const [wx, wy, wz] = world;
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) registerLabel(id, el, [wx, wy, wz]);
      else unregisterLabel(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id/wx/wy/wz fully describe `world`
    [id, wx, wy, wz],
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * Plain DOM overlay rendered by the main React root (NOT inside <Canvas>). Renders one label
 * per room/radio on the active level only; <LabelProjector> positions them over the canvas.
 */
export function LabelsOverlay() {
  const doc = useSceneStore((s) => s.doc);
  const activeLevelId = useSceneStore((s) => s.activeLevelId);
  const selection = useSceneStore((s) => s.selection);
  const showSignal = useSceneStore((s) => s.heatmap.enabled);

  const level = doc.levels.find((l) => l.id === activeLevelId);
  if (!level) return null;

  const rooms = doc.rooms.filter((r) => r.levelId === level.id);
  const radios = doc.radios.filter((r) => r.levelId === level.id);
  const zones = doc.zones.filter((z) => z.levelId === level.id);

  const selectedAgent = doc.agents.find((a) => a.id === selection);
  const waypointsOnLevel =
    selectedAgent && selectedAgent.behavior.type === 'route'
      ? selectedAgent.behavior.waypoints
          .map((wp, i) => ({ wp, i }))
          .filter(({ wp }) => wp.levelId === level.id)
      : [];

  return (
    <div className="labels-overlay">
      {/* Agent name labels: world position is only a mount-time placeholder — AgentsLayer
          (inside <Canvas>) overrides it every simulation frame via updateLabelWorld. */}
      {doc.agents.map((agent) => {
        const startLevel = doc.levels.find((l) => l.id === agent.start.levelId);
        return (
          <LabelDiv
            key={agent.id}
            id={`agent:${agent.id}`}
            className={`agent-pill${selection === agent.id ? ' label-selected' : ''}`}
            world={[agent.start.p[0], (startLevel?.elevation ?? 0) + agent.height + 0.15, agent.start.p[1]]}
          >
            <span className="agent-pill-dot" style={{ background: agent.color }} />
            {agent.name}
          </LabelDiv>
        );
      })}
      {waypointsOnLevel.map(({ wp, i }) => (
        <LabelDiv key={`wp:${selectedAgent!.id}:${i}`} id={`waypoint:${selectedAgent!.id}:${i}`} className="waypoint-label" world={[wp.p[0], level.elevation + 0.06, wp.p[1]]}>
          {i + 1}
        </LabelDiv>
      ))}
      {rooms.map((room) => {
        const [cx, cz] = centroid(room.polygon);
        return (
          <LabelDiv key={room.id} id={`room:${room.id}`} className={`room-label${showSignal ? ' room-label-heat' : ''}`} world={[cx, level.elevation + 0.05, cz]}>
            <span className="room-label-name">
              {room.name}
              {!room.cameraAllowed && <CameraOff size={13} strokeWidth={1.5} aria-label="ห้องส่วนตัว ไม่มีกล้อง" />}
            </span>
            {showSignal && <RoomSignal roomId={room.id} levelId={level.id} />}
          </LabelDiv>
        );
      })}
      {zones.map((zone) => {
        // Room-linked zones are named after (and hatched over) their room, whose label is
        // already centred there — a second label would just collide with it.
        if (zone.roomId !== undefined) return null;
        const polygon = zone.polygon;
        if (polygon.length < 3) return null;
        const [cx, cz] = centroid(polygon);
        return (
          <LabelDiv key={zone.id} id={`zone:${zone.id}`} className={`zone-label${zone.enabled ? '' : ' zone-label-off'}`} world={[cx, level.elevation + 0.08, cz]}>
            {zone.name}
          </LabelDiv>
        );
      })}
      {radios.map((radio) => (
        <LabelDiv
          key={radio.id}
          id={`radio:${radio.id}`}
          className="radio-label"
          // Sits 0.55 m toward the top of the plan so it does not cover the room label centred below it.
          world={[radio.position[0], level.elevation + radio.position[1] + 0.22, radio.position[2] - 0.55]}
        >
          <Wifi size={13} strokeWidth={1.5} />
          {radio.name}
        </LabelDiv>
      ))}
    </div>
  );
}
