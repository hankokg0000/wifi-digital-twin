import { useLayoutEffect, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';

export type CityPoint = [number, number, number];
export type CityBlock = { center: CityPoint; size: CityPoint; color: string };

export function CityBlocks({ blocks, muted = false, receiveShadow = false, castShadow = false }: {
  blocks: readonly CityBlock[]; muted?: boolean; receiveShadow?: boolean; castShadow?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const shape = new Object3D();
    const color = new Color();
    blocks.forEach((block, index) => {
      shape.position.set(...block.center);
      shape.scale.set(...block.size);
      shape.updateMatrix();
      mesh.setMatrixAt(index, shape.matrix);
      mesh.setColorAt(index, color.set(block.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [blocks]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, blocks.length]} receiveShadow={receiveShadow} castShadow={castShadow}>
      <boxGeometry />
      <meshStandardMaterial color={muted ? '#8793a3' : 'white'} roughness={0.82} />
    </instancedMesh>
  );
}
