import { useMemo } from 'react';
import type { Stair } from '../../core';

const STEP_THICKNESS = 0.15;
const RISER_TARGET = 0.18; // m — typical stair riser height, used only to pick a step count

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

  const color = selected ? '#5ac8fa' : '#8a8f96';

  return (
    <group>
      {steps.out.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, s.z]} rotation={[0, steps.angle, 0]}>
          <boxGeometry args={[stair.width, STEP_THICKNESS, steps.treadDepth]} />
          <meshStandardMaterial color={color} emissive={selected ? '#1c6fa8' : '#000000'} emissiveIntensity={selected ? 0.3 : 0} />
        </mesh>
      ))}
    </group>
  );
}
