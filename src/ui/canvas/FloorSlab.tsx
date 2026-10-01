import { PALETTE } from '../theme/palette';
import type { Bounds } from './bounds';

const MARGIN = 0.5;
const THICKNESS = 0.12;

/** Dark floor slab under a level in 3D, so the house reads as a solid object on the dark ground. */
export function FloorSlab({ bounds, opacity }: { bounds: Bounds; opacity: number }) {
  return (
    <mesh position={[bounds.cx, -THICKNESS / 2 - 0.01, bounds.cz]}>
      <boxGeometry args={[bounds.width + MARGIN * 2, THICKNESS, bounds.depth + MARGIN * 2]} />
      <meshStandardMaterial color={PALETTE.slab} roughness={1} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
    </mesh>
  );
}
