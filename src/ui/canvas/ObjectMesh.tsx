import type { ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import type { SceneObject } from '../../core';
import { useSceneStore } from '../store';
import { oklchToHex } from '../theme/color';
import { PALETTE } from '../theme/palette';
import { SelectionHull } from './SelectionHull';

interface ObjectMeshProps {
  object: SceneObject;
  /** Material color from the doc — unused visually: furniture is neutral, never a saturated wood. */
  color: string;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
  onDragStart: (e: ThreeEvent<MouseEvent>) => void;
}

const EDGE = oklchToHex(0.44, 0.014, 265);

export function ObjectMesh({ object, selected, interactive, opacity, onSelect, onDragStart }: ObjectMeshProps) {
  const plan = useSceneStore((s) => s.viewMode) === 'plan';
  const [x, yBase, z] = object.position;
  const [sx, sy, sz] = object.size;
  const y = yBase + sy / 2; // position is the center of the base; box geometry is centered.
  const transparent = opacity < 1;

  return (
    <mesh
      position={[x, y, z]}
      rotation={[0, object.rotationY, 0]}
      onClick={interactive ? onSelect : undefined}
      onPointerDown={interactive && selected ? onDragStart : undefined}
    >
      <boxGeometry args={[sx, sy, sz]} />
      {plan ? (
        <meshBasicMaterial color={PALETTE.surface3} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
      ) : (
        <meshStandardMaterial color={PALETTE.furniture3d} roughness={0.9} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
      )}
      <Edges color={selected ? PALETTE.accent : EDGE} threshold={20} />
      {selected && <SelectionHull size={[sx, sy, sz]} />}
    </mesh>
  );
}
