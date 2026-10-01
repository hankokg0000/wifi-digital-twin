import * as THREE from 'three';
import { PALETTE } from '../theme/palette';

const GROW = 0.24; // total m added to each dimension

/**
 * Selection outline for box-shaped meshes: a slightly inflated copy of the box drawn with
 * back-faces only (an "inverted hull"), so only a rim of accent shows around the original — in
 * plan and 3D alike. Put it as a child of the selected mesh; it inherits the transform.
 */
export function SelectionHull({ size }: { size: [number, number, number] }) {
  return (
    <mesh renderOrder={-1} raycast={() => null}>
      <boxGeometry args={[size[0] + GROW, size[1] + GROW, size[2] + GROW]} />
      <meshBasicMaterial color={PALETTE.accent} side={THREE.BackSide} />
    </mesh>
  );
}

/** Same idea for a sphere (AP radios). */
export function SelectionHullSphere({ radius }: { radius: number }) {
  return (
    <mesh renderOrder={-1} raycast={() => null}>
      <sphereGeometry args={[radius + GROW / 2, 20, 20]} />
      <meshBasicMaterial color={PALETTE.accent} side={THREE.BackSide} />
    </mesh>
  );
}
