import type { ThreeEvent } from '@react-three/fiber';
import type { Radio } from '../../core';
import { oklchToHex } from '../theme/color';
import { PALETTE } from '../theme/palette';
import { SelectionHullSphere } from './SelectionHull';

interface RadioMeshProps {
  radio: Radio;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
  onDragStart: (e: ThreeEvent<MouseEvent>) => void;
}

// Radios are infrastructure, not alerts: accent-neutral (a quiet tint of the accent hue) for
// APs, plain ink for clients, the "ok" green for sensor nodes.
const ROLE_COLOR: Record<Radio['role'], string> = {
  ap: oklchToHex(0.8, 0.07, 285),
  client: PALETTE.ink2,
  'sensor-node': PALETTE.ok,
};

export function RadioMesh({ radio, selected, interactive, opacity, onSelect, onDragStart }: RadioMeshProps) {
  const [x, y, z] = radio.position;
  return (
    <group position={[x, y, z]}>
      <mesh onClick={interactive ? onSelect : undefined} onPointerDown={interactive && selected ? onDragStart : undefined}>
        <sphereGeometry args={[0.14, 20, 20]} />
        <meshBasicMaterial color={ROLE_COLOR[radio.role]} transparent={opacity < 1} opacity={opacity} />
        {selected && <SelectionHullSphere radius={0.14} />}
      </mesh>
      {/* floor-plan marker ring so the AP reads from above */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.25, 32]} />
        <meshBasicMaterial color={selected ? PALETTE.accent : ROLE_COLOR[radio.role]} transparent opacity={0.55 * opacity} depthWrite={false} />
      </mesh>
    </group>
  );
}
