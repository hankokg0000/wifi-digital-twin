import { useCallback, type ReactNode } from 'react';
import { useSceneStore } from './store';
import { registerLabel, unregisterLabel } from './canvas/labels';
import type { Vec2 } from '../core';

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

  const level = doc.levels.find((l) => l.id === activeLevelId);
  if (!level) return null;

  const rooms = doc.rooms.filter((r) => r.levelId === level.id);
  const radios = doc.radios.filter((r) => r.levelId === level.id);

  return (
    <div className="labels-overlay">
      {rooms.map((room) => {
        const [cx, cz] = centroid(room.polygon);
        return (
          <LabelDiv key={room.id} id={`room:${room.id}`} className="room-label" world={[cx, level.elevation + 0.05, cz]}>
            {room.name}
            {!room.cameraAllowed && (
              <span className="room-label-lock" title="no camera">
                {' '}
                🔒
              </span>
            )}
          </LabelDiv>
        );
      })}
      {radios.map((radio) => (
        <LabelDiv
          key={radio.id}
          id={`radio:${radio.id}`}
          className="entity-label"
          world={[radio.position[0], level.elevation + radio.position[1] + 0.22, radio.position[2]]}
        >
          {radio.name}
        </LabelDiv>
      ))}
    </div>
  );
}
