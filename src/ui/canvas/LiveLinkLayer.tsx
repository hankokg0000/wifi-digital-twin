import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { coverageBand, type LiveLink } from '../../core';
import { PALETTE } from '../theme/palette';
import { prefersReducedMotion } from '../theme/motion';
import { useSceneStore } from '../store';
import { useLiveMirror } from '../live/useLiveLink';

/**
 * The Live Link on the plan: a line between the two real devices and its Coverage band. Idle
 * while connected it is a calm accent line; on motion it brightens and the band pulses. Offline
 * (and not replaying) it is a dashed grey line with no band. Eased by mutating materials per
 * frame, never through React state.
 */
export function LiveLinkLayer({ link }: { link: LiveLink }) {
  const viewMode = useSceneStore((s) => s.viewMode);
  const { mirrored, motion } = useLiveMirror();
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const bandRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<{ material: THREE.Material & { opacity: number; linewidth: number } } | null>(null);

  const shape = useMemo(() => {
    const ring = coverageBand(link.tx, link.rx, link.band);
    if (ring.length < 3) return null;
    const s = new THREE.Shape();
    // Same -z trick as RoomMesh: Shape lives in XY and the mesh is rotated -90deg on X.
    ring.forEach(([x, z], i) => (i === 0 ? s.moveTo(x, -z) : s.lineTo(x, -z)));
    s.closePath();
    return s;
  }, [link.tx, link.rx, link.band]);

  const y = viewMode === '3d' ? 0.9 : 0.07;
  const points = useMemo<[number, number, number][]>(
    () => [
      [link.tx[0], y, link.tx[1]],
      [link.rx[0], y, link.rx[1]],
    ],
    [link.tx, link.rx, y],
  );

  useFrame(({ clock }, delta) => {
    const k = reduced ? 1 : 1 - Math.exp(-8 * delta);
    const lineMat = lineRef.current?.material;
    const bandMat = bandRef.current?.material as THREE.MeshBasicMaterial | undefined;
    const lineTarget = !mirrored ? 0.6 : motion ? 1 : 0.5;
    const widthTarget = mirrored && motion ? 4 : 2;
    if (lineMat) {
      lineMat.opacity += (lineTarget - lineMat.opacity) * k;
      lineMat.linewidth += (widthTarget - lineMat.linewidth) * k;
    }
    if (bandMat) {
      const pulse = motion && !reduced ? 0.07 * Math.sin(clock.elapsedTime * 3) : 0;
      const target = !mirrored ? 0 : motion ? 0.35 + pulse : 0.08;
      bandMat.opacity += (target - bandMat.opacity) * k;
    }
  });

  return (
    <group>
      {shape && (
        <mesh ref={bandRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial color={PALETTE.accent} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      <Line
        ref={lineRef as never}
        points={points}
        color={mirrored ? PALETTE.accent : PALETTE.ink3}
        lineWidth={2}
        transparent
        opacity={0.5}
        dashed={!mirrored}
        dashSize={0.2}
        gapSize={0.15}
      />
    </group>
  );
}
