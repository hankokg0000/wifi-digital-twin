import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { Wall, Opening } from '../../core';
import { pointAlongWall } from '../../core';
import { oklchToHex } from '../theme/color';
import { PALETTE, wallTint } from '../theme/palette';
import { wallRotationY } from './wallSegments';
import { SelectionHull } from './SelectionHull';

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

const GLASS = oklchToHex(0.74, 0.018, 265);
const PLAN_LINE_Y = 0.1;

/** Architectural door symbol in plan: leaf line + quarter-circle swing arc, hinged at the
 * opening's start. An open door shows its leaf swung 90 degrees; a closed one lies in the gap. */
function DoorSymbol({ width, open, selected }: { width: number; open: boolean; selected: boolean }) {
  const arc = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * (Math.PI / 2);
      pts.push([-width / 2 + width * Math.cos(a), PLAN_LINE_Y, -width * Math.sin(a)]);
    }
    return pts;
  }, [width]);
  const leaf: [number, number, number][] = open
    ? [[-width / 2, PLAN_LINE_Y, 0], [-width / 2, PLAN_LINE_Y, -width]]
    : [[-width / 2, PLAN_LINE_Y, 0], [width / 2, PLAN_LINE_Y, 0]];
  const color = selected ? PALETTE.accent : PALETTE.ink2;
  return (
    <>
      <Line points={leaf} color={color} lineWidth={2} />
      <Line points={arc} color={selected ? PALETTE.accent : PALETTE.ink3} lineWidth={1} />
    </>
  );
}

/** Window in plan: the wall gap filled dark with two thin glazing lines. */
function WindowSymbol({ width, thickness, selected }: { width: number; thickness: number; selected: boolean }) {
  const d = thickness * 0.22;
  const color = selected ? PALETTE.accent : PALETTE.ink3;
  return (
    <>
      <mesh position={[0, 1.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, thickness * 1.02]} />
        <meshBasicMaterial color={PALETTE.surface2} />
      </mesh>
      <Line points={[[-width / 2, 1.26, -d], [width / 2, 1.26, -d]]} color={color} lineWidth={1.25} />
      <Line points={[[-width / 2, 1.26, d], [width / 2, 1.26, d]]} color={color} lineWidth={1.25} />
    </>
  );
}

export function OpeningMesh({ wall, opening, color, selected, interactive, opacity, cutHeight = Infinity, onSelect }: OpeningMeshProps) {
  const rotationY = useMemo(() => wallRotationY(wall), [wall]);
  if (opening.sill >= cutHeight) return null;
  const plan = Number.isFinite(cutHeight);
  const top = Math.min(opening.sill + opening.height, cutHeight);
  const height = top - opening.sill;
  const mid = opening.offset + opening.width / 2;
  const [x, z] = pointAlongWall(wall, mid);
  const y = opening.sill + height / 2;

  if (plan) {
    // An invisible box keeps the opening clickable in Edit mode.
    return (
      <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
        <mesh position={[0, y, 0]} onClick={interactive ? onSelect : undefined}>
          <boxGeometry args={[opening.width, height, Math.max(wall.thickness, 0.12)]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        {opening.kind === 'door' ? (
          <DoorSymbol width={opening.width} open={opening.open} selected={selected} />
        ) : (
          <WindowSymbol width={opening.width} thickness={wall.thickness} selected={selected} />
        )}
      </group>
    );
  }

  const isDoor = opening.kind === 'door';
  if (opening.open) {
    // Open: no solid panel — a faint frame marks the gap, plus an invisible box for clicking.
    return (
      <group position={[x, y, z]} rotation={[0, rotationY, 0]}>
        <mesh onClick={interactive ? onSelect : undefined}>
          <boxGeometry args={[opening.width, height, wall.thickness]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <mesh>
          <boxGeometry args={[opening.width, height, wall.thickness]} />
          <meshBasicMaterial color={selected ? PALETTE.accent : PALETTE.ink3} wireframe />
        </mesh>
      </group>
    );
  }

  return (
    <mesh position={[x, y, z]} rotation={[0, rotationY, 0]} onClick={interactive ? onSelect : undefined}>
      <boxGeometry args={[opening.width, height, Math.max(wall.thickness * 0.6, 0.03)]} />
      <meshStandardMaterial
        color={isDoor ? wallTint(color, 0.62) : GLASS}
        roughness={isDoor ? 0.9 : 0.15}
        transparent
        opacity={isDoor ? Math.min(opacity, 0.95) : Math.min(opacity, 0.35)}
        depthWrite={false}
      />
      {selected && <SelectionHull size={[opening.width, height, Math.max(wall.thickness * 0.6, 0.03)]} />}
    </mesh>
  );
}
