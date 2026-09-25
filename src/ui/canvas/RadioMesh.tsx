import type { ThreeEvent } from '@react-three/fiber';
import type { Radio } from '../../core';

interface RadioMeshProps {
  radio: Radio;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
  onDragStart: (e: ThreeEvent<MouseEvent>) => void;
}

const ROLE_COLOR: Record<Radio['role'], string> = {
  ap: '#ffb020',
  client: '#5ac8fa',
  'sensor-node': '#8ee08e',
};

export function RadioMesh({ radio, selected, interactive, opacity, onSelect, onDragStart }: RadioMeshProps) {
  const [x, y, z] = radio.position;
  const color = selected ? '#5ac8fa' : ROLE_COLOR[radio.role];

  return (
    <group position={[x, y, z]}>
      <mesh
        onClick={interactive ? onSelect : undefined}
        onPointerDown={interactive && selected ? onDragStart : undefined}
      >
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={selected ? '#1c6fa8' : '#000000'}
          emissiveIntensity={selected ? 0.5 : 0}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>
    </group>
  );
}
