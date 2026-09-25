import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Room } from '../../core';

interface RoomMeshProps {
  room: Room;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

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

  const fillColor = room.cameraAllowed ? '#3a6fa8' : '#8a4a5c';

  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={interactive ? onSelect : undefined}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial
          color={selected ? '#5ac8fa' : fillColor}
          transparent
          opacity={selected ? 0.45 : 0.25 * opacity + 0.05}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
