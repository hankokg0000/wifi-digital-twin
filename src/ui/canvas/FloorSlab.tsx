import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../theme/palette';
import type { Bounds } from './bounds';

const MARGIN = 0.5;
const THICKNESS = 0.12;

/** Floor slab under a level in 3D, a touch lighter than the background with a soft edge line, so
 * the house reads as a solid object resting on the dark ground. */
export function FloorSlab({ bounds, opacity }: { bounds: Bounds; opacity: number }) {
  const size: [number, number, number] = [bounds.width + MARGIN * 2, THICKNESS, bounds.depth + MARGIN * 2];
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size[0], size[1], size[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <group position={[bounds.cx, -THICKNESS / 2 - 0.01, bounds.cz]}>
      <mesh>
        <boxGeometry args={size} />
        <meshStandardMaterial color={PALETTE.slab} roughness={1} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={PALETTE.line} transparent opacity={0.55 * opacity} />
      </lineSegments>
    </group>
  );
}
