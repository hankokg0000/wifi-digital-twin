import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Wall, Opening } from '../../core';
import { pointAlongWall } from '../../core';
import { computeWallSegments, wallRotationY } from './wallSegments';

interface WallMeshProps {
  wall: Wall;
  openings: Opening[];
  color: string;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  cutHeight?: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

export function WallMesh({ wall, openings, color, selected, interactive, opacity, cutHeight, onSelect }: WallMeshProps) {
  const segments = useMemo(() => computeWallSegments(wall, openings, cutHeight), [wall, openings, cutHeight]);
  const rotationY = useMemo(() => wallRotationY(wall), [wall]);

  return (
    <group>
      {segments.map((seg, i) => {
        const mid = (seg.offsetStart + seg.offsetEnd) / 2;
        const [x, z] = pointAlongWall(wall, mid);
        const y = (seg.yStart + seg.yEnd) / 2;
        const length = seg.offsetEnd - seg.offsetStart;
        const height = seg.yEnd - seg.yStart;
        if (length <= 0 || height <= 0) return null;
        return (
          <mesh
            key={i}
            position={[x, y, z]}
            rotation={[0, rotationY, 0]}
            onClick={interactive ? onSelect : undefined}
          >
            <boxGeometry args={[length, height, wall.thickness]} />
            <meshStandardMaterial
              color={selected ? '#5ac8fa' : color}
              emissive={selected ? '#1c6fa8' : '#000000'}
              emissiveIntensity={selected ? 0.4 : 0}
              transparent={opacity < 1}
              opacity={opacity}
              depthWrite={opacity >= 1}
            />
          </mesh>
        );
      })}
    </group>
  );
}
