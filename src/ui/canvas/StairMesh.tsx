import { useMemo } from 'react';
import { Edges } from '@react-three/drei';
import type { Stair } from '../../core';
import { useSceneStore } from '../store';
import { oklchToHex } from '../theme/color';
import { PALETTE } from '../theme/palette';
import { SelectionHull } from './SelectionHull';

const STEP_THICKNESS = 0.15;
const RISER_TARGET = 0.18; // m — typical stair riser height, used only to pick a step count
const TREAD_EDGE = oklchToHex(0.5, 0.014, 265);

interface StairMeshProps {
  stair: Stair;
  fromElevation: number;
  toElevation: number;
  selected: boolean;
}

/** N flat boxes climbing from the stair's bottom landing to its top landing. Positioned in
 * absolute world space (not nested under a level group) so it reads correctly in both the
 * lower and upper level's views without duplication. */
export function StairMesh({ stair, fromElevation, toElevation, selected }: StairMeshProps) {
  const plan = useSceneStore((s) => s.viewMode) === 'plan';
  const steps = useMemo(() => {
    const rise = toElevation - fromElevation;
    const stepCount = Math.max(4, Math.round(Math.abs(rise) / RISER_TARGET));
    const dx = (stair.top[0] - stair.bottom[0]) / stepCount;
    const dz = (stair.top[1] - stair.bottom[1]) / stepCount;
    const stepRise = rise / stepCount;
    const treadDepth = Math.hypot(dx, dz) * 1.05;
    const angle = Math.atan2(dx, dz);
    const out: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < stepCount; i++) {
      out.push({
        x: stair.bottom[0] + dx * (i + 0.5),
        y: fromElevation + stepRise * (i + 1) - STEP_THICKNESS / 2,
        z: stair.bottom[1] + dz * (i + 0.5),
      });
    }
    return { out, treadDepth, angle };
  }, [stair, fromElevation, toElevation]);

  return (
    <group>
      {steps.out.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, s.z]} rotation={[0, steps.angle, 0]}>
          <boxGeometry args={[stair.width, STEP_THICKNESS, steps.treadDepth]} />
          {plan ? (
            // Alternate tread shades + a hairline edge: the plan symbol for a staircase, hatched.
            <meshBasicMaterial color={i % 2 === 0 ? PALETTE.surface3 : PALETTE.surface2} />
          ) : (
            <meshStandardMaterial color={PALETTE.furniture3d} roughness={0.9} />
          )}
          <Edges color={selected ? PALETTE.accent : TREAD_EDGE} threshold={20} />
          {selected && <SelectionHull size={[stair.width, STEP_THICKNESS, steps.treadDepth]} />}
        </mesh>
      ))}
    </group>
  );
}
