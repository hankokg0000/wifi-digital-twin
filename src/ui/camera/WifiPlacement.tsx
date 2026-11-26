import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh, MeshBasicMaterial } from 'three';
import type { FloorPlanGeometry } from '../../core/camera/floor-plan';
import { demoLink } from '../../core/camera/site-demo';

export function WifiPlacement({ plan, active = false, observed = false }: {
  plan: FloorPlanGeometry; active?: boolean; observed?: boolean;
}) {
  const { router: [tx, tz], receiver: [rx, rz] } = demoLink(plan);
  const pulse = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!pulse.current || !material.current) return;
    const progress = clock.elapsedTime % 1.5 / 1.5;
    pulse.current.scale.setScalar(0.55 + progress * 2.3);
    material.current.opacity = 0.7 * (1 - progress);
  });
  const amber = observed ? '#69efd6' : '#ffc575';
  return (
    <>
      <Line points={[[tx, 0.35, tz], [rx, 0.35, rz]]} color={amber} transparent
        opacity={active ? 1 : 0.72} lineWidth={active ? 3 : 1.4} dashed dashSize={0.43} gapSize={0.26} />
      <group position={[tx, 0.18, tz]}>
        <mesh>
          <cylinderGeometry args={[0.33, 0.39, 0.26, 10]} />
          <meshStandardMaterial color="#785926" emissive={amber} emissiveIntensity={0.55} />
        </mesh>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.035, 0.047, 0.3, 6]} />
          <meshBasicMaterial color={amber} />
        </mesh>
      </group>
      <mesh position={[rx, 0.17, rz]}>
        <boxGeometry args={[0.55, 0.23, 0.36]} />
        <meshStandardMaterial color="#ba8844" emissive={amber} emissiveIntensity={0.48} />
      </mesh>
      {active && <mesh ref={pulse} position={[rx, 0.055, rz]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.62, 0.68, 40]} />
        <meshBasicMaterial ref={material} color={amber} transparent depthWrite={false} />
      </mesh>}
    </>
  );
}
