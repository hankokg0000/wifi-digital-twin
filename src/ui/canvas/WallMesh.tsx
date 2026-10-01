import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Wall, Opening } from '../../core';
import { pointAlongWall } from '../../core';
import { wallTint } from '../theme/palette';
import { SelectionHull } from './SelectionHull';
import { computeWallSegments, wallRotationY } from './wallSegments';

interface WallMeshProps {
  wall: Wall;
  openings: Opening[];
  /** Material color from the doc; shows only as a subtle tint on the light-neutral wall. */
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
  const tint = useMemo(() => wallTint(color), [color]);
  const plan = cutHeight !== undefined;

  return (
    <group>
      {segments.map((seg, i) => {
        const mid = (seg.offsetStart + seg.offsetEnd) / 2;
        const [x, z] = pointAlongWall(wall, mid);
        const y = (seg.yStart + seg.yEnd) / 2;
        const length = seg.offsetEnd - seg.offsetStart;
        const height = seg.yEnd - seg.yStart;
        if (length <= 0 || height <= 0) return null;
        const transparent = opacity < 1;
        return (
          <mesh key={i} position={[x, y, z]} rotation={[0, rotationY, 0]} onClick={interactive ? onSelect : undefined}>
            <boxGeometry args={[length, height, wall.thickness]} />
            {plan ? (
              <meshBasicMaterial color={tint} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
            ) : (
              <meshStandardMaterial color={tint} roughness={1} metalness={0} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
            )}
            {selected && <SelectionHull size={[length, height, wall.thickness]} />}
          </mesh>
        );
      })}
    </group>
  );
}
