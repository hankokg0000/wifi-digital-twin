import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { Room } from '../../core';
import { PALETTE } from '../theme/palette';
import { prefersReducedMotion } from '../theme/motion';
import { useMonitoredRoomId } from '../sensing/sensingStore';
import { useCrossedRoomIds, useLiveLink, useLiveMirror } from '../live/useLiveLink';
import { useSceneStore } from '../store';
import { getRoomStatus, type RoomStatus } from './roomStatus';

interface RoomMeshProps {
  room: Room;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

const C_EMPTY = new THREE.Color(PALETTE.surface2);
const C_OCCUPIED = new THREE.Color(PALETTE.surface3);
const C_WARNING = new THREE.Color(PALETTE.warning);
const C_CRITICAL = new THREE.Color(PALETTE.critical);
const C_ACCENT = new THREE.Color(PALETTE.accent);

/** Floor fill target for a status: [colour, opacity, pulse amplitude]. */
function fillTarget(status: RoomStatus): [THREE.Color, number, number] {
  switch (status) {
    case 'occupied':
      return [C_OCCUPIED, 0.92, 0];
    case 'warning':
      return [C_WARNING, 0.24, 0.07];
    case 'critical':
      return [C_CRITICAL, 0.3, 0.1];
    default:
      return [C_EMPTY, 0.85, 0];
  }
}

/**
 * The room's floor fill. In Monitor it carries the room's live status — empty (dim surface),
 * occupied (lifted a little), warning / critical (low-opacity tint with a gentle pulse; the room
 * holds an active simulated alert) — eased per frame by mutating the material, never through
 * React state. Camera privacy is an icon on the room label, not a tint. The accent colour stays
 * reserved for Observed evidence (Live Mirror, drawn on top) and selection.
 */
export function RoomMesh({ room, selected, interactive, opacity, onSelect }: RoomMeshProps) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.polygon.forEach(([x, z], i) => {
      // Shape() lives in the XY plane; rotating -90deg on X maps local (x, y) to world (x, -y),
      // so feed -z to land the polygon at world z.
      if (i === 0) s.moveTo(x, -z);
      else s.lineTo(x, -z);
    });
    s.closePath();
    return s;
  }, [room.polygon]);

  const isMonitored = useMonitoredRoomId() === room.id;
  const { mirrored, motion } = useLiveMirror();
  // With a Live Link every room it crosses shows motion faintly (no pulse), replacing the
  // monitored-room fill; the monitored room keeps its outline.
  const hasLink = useLiveLink() !== null;
  const crossed = useCrossedRoomIds().has(room.id);
  const showsMotion = hasLink ? crossed : isMonitored;
  const showFill = showsMotion && motion;
  const fillRef = useRef<THREE.Mesh>(null);
  const baseRef = useRef<THREE.Mesh>(null);
  const monitoring = useSceneStore((s) => s.mode) === 'monitor';
  const primed = useRef(false);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const outline = useMemo((): [number, number, number][] => {
    // Room polygons run along wall centre lines, so an outline drawn there is hidden inside the
    // walls. Pull each vertex inward per axis (exact for the rectangular rooms we have) so the
    // Live Mirror outline sits just inside the walls where it can be seen.
    const INSET = 0.2;
    const n = room.polygon.length || 1;
    const cx = room.polygon.reduce((a, [x]) => a + x, 0) / n;
    const cz = room.polygon.reduce((a, [, z]) => a + z, 0) / n;
    const pts = room.polygon.map(([x, z]): [number, number, number] => [
      x + Math.sign(cx - x) * INSET,
      0.06,
      z + Math.sign(cz - z) * INSET,
    ]);
    if (pts.length > 0) pts.push(pts[0]!);
    return pts;
  }, [room.polygon]);

  useFrame(({ clock }, delta) => {
    const mat = fillRef.current?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = hasLink ? 0.12 : reduced ? 0.3 : 0.26 + 0.1 * Math.sin(clock.elapsedTime * 3);

    const base = baseRef.current?.material as THREE.MeshBasicMaterial | undefined;
    if (!base) return;
    let color: THREE.Color;
    let opacityTarget: number;
    if (selected) {
      color = C_ACCENT;
      opacityTarget = 0.28;
    } else {
      const [c, o, pulse] = fillTarget(monitoring ? getRoomStatus(room.id) : 'empty');
      color = c;
      opacityTarget = (o + (reduced ? 0 : pulse * Math.sin(clock.elapsedTime * 2.4))) * opacity;
    }
    if (!primed.current) {
      primed.current = true;
      base.color.copy(color);
      base.opacity = opacityTarget;
      return;
    }
    const k = reduced ? 1 : 1 - Math.exp(-8 * delta);
    base.color.lerp(color, k);
    base.opacity += (opacityTarget - base.opacity) * k;
  });

  return (
    <>
    {isMonitored && mirrored && outline.length >= 3 && <Line points={outline} color={PALETTE.accent} lineWidth={2.5} />}
    {showFill && (
      <mesh ref={fillRef} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    )}
    <mesh ref={baseRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={interactive ? onSelect : undefined}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial
        color={selected ? PALETTE.accent : PALETTE.surface2}
        transparent
        opacity={selected ? 0.28 : 0.85 * opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
    </>
  );
}
