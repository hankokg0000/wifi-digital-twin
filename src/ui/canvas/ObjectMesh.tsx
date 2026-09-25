import type { ThreeEvent } from '@react-three/fiber';
import type { SceneObject } from '../../core';

interface ObjectMeshProps {
  object: SceneObject;
  color: string;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
  onDragStart: (e: ThreeEvent<MouseEvent>) => void;
}

export function ObjectMesh({ object, color, selected, interactive, opacity, onSelect, onDragStart }: ObjectMeshProps) {
  const [x, yBase, z] = object.position;
  const [sx, sy, sz] = object.size;
  const y = yBase + sy / 2; // position is the center of the base; box geometry is centered.

  return (
    <mesh
      position={[x, y, z]}
      rotation={[0, object.rotationY, 0]}
      onClick={interactive ? onSelect : undefined}
      onPointerDown={interactive && selected ? onDragStart : undefined}
    >
      <boxGeometry args={[sx, sy, sz]} />
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
}
