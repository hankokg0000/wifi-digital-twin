import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Wall, Opening } from '../../core';
import { pointAlongWall } from '../../core';
import { wallRotationY } from './wallSegments';

interface OpeningMeshProps {
  wall: Wall;
  opening: Opening;
  color: string;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  cutHeight?: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

export function OpeningMesh({
  wall,
  opening,
  color,
  selected,
  interactive,
  opacity,
  cutHeight = Infinity,
  onSelect,
}: OpeningMeshProps) {
  const rotationY = useMemo(() => wallRotationY(wall), [wall]);
  if (opening.sill >= cutHeight) return null;
  const top = Math.min(opening.sill + opening.height, cutHeight);
  const height = top - opening.sill;
  const mid = opening.offset + opening.width / 2;
  const [x, z] = pointAlongWall(wall, mid);
  const y = opening.sill + height / 2;
  const outlineColor = selected ? '#5ac8fa' : '#cfd4da';

  if (opening.open) {
    // Open: no solid panel — a thin wireframe outline marks the gap, plus an invisible
    // solid box underneath so it stays clickable.
    return (
      <group position={[x, y, z]} rotation={[0, rotationY, 0]}>
        <mesh onClick={interactive ? onSelect : undefined}>
          <boxGeometry args={[opening.width, height, wall.thickness]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <mesh>
          <boxGeometry args={[opening.width, height, wall.thickness]} />
          <meshBasicMaterial color={outlineColor} wireframe />
        </mesh>
      </group>
    );
  }

  return (
    <mesh position={[x, y, z]} rotation={[0, rotationY, 0]} onClick={interactive ? onSelect : undefined}>
      <boxGeometry args={[opening.width, height, Math.max(wall.thickness * 0.6, 0.03)]} />
      <meshStandardMaterial
        color={selected ? '#5ac8fa' : color}
        emissive={selected ? '#1c6fa8' : '#000000'}
        emissiveIntensity={selected ? 0.4 : 0}
        transparent
        opacity={Math.min(opacity, 0.55)}
        depthWrite={false}
      />
    </mesh>
  );
}
