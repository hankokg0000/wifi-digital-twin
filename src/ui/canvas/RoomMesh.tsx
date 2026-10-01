import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Room } from '../../core';
import { PALETTE } from '../theme/palette';

interface RoomMeshProps {
  room: Room;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

/** A very subtle floor fill — rooms are told apart by their label, never by color. Camera
 * privacy is an icon on the room label, not a tint. */
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

  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={interactive ? onSelect : undefined}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial
        color={selected ? PALETTE.accent : PALETTE.surface2}
        transparent
        opacity={selected ? 0.28 : 0.85 * opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
