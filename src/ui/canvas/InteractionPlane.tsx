import type { ThreeEvent } from '@react-three/fiber';

interface InteractionPlaneProps {
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}

/**
 * A large, fully transparent plane at the active level's floor (local y = 0) that catches
 * pointer events not claimed by an entity mesh (entities only register handlers in select
 * tool, so in every other tool clicks fall straight through to this plane).
 */
export function InteractionPlane({ onPointerMove, onClick, onContextMenu }: InteractionPlaneProps) {
  return (
    <mesh
      position={[0, 0, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={onPointerMove}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <planeGeometry args={[120, 120]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
