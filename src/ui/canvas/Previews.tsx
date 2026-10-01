import { Line } from '@react-three/drei';
import type { Vec2, Wall } from '../../core';
import { OPENING_DEFAULTS, pointAlongWall } from '../../core';
import { wallRotationY } from './wallSegments';
import type { HoverWall } from './snapping';
import { PALETTE } from '../theme/palette';

export function SnapIndicator({ point, snappedToEndpoint }: { point: Vec2; snappedToEndpoint: boolean }) {
  return (
    <mesh position={[point[0], 0.03, point[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[snappedToEndpoint ? 0.1 : 0.06, snappedToEndpoint ? 0.14 : 0.09, 20]} />
      <meshBasicMaterial color={snappedToEndpoint ? PALETTE.ink : PALETTE.accent} transparent opacity={0.9} />
    </mesh>
  );
}

export function DraftChainPreview({ points, cursor }: { points: Vec2[]; cursor: Vec2 | null }) {
  const all: Vec2[] = cursor ? [...points, cursor] : points;
  if (all.length === 0) return null;
  const linePoints: [number, number, number][] = all.map(([x, z]) => [x, 0.04, z]);
  return (
    <group>
      {linePoints.length >= 2 && <Line points={linePoints} color={PALETTE.accent} lineWidth={2} dashed={false} />}
      {points.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.04, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.06, 12]} />
          <meshBasicMaterial color={PALETTE.accent} />
        </mesh>
      ))}
    </group>
  );
}

export function OpeningPreview({
  wall,
  hover,
  kind,
}: {
  wall: Wall;
  hover: HoverWall;
  kind: 'door' | 'window';
}) {
  const defaults = OPENING_DEFAULTS[kind];
  const width = defaults.width;
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  const offset = Math.min(Math.max(hover.offset - width / 2, 0), Math.max(length - width, 0));
  const mid = offset + width / 2;
  const [x, z] = pointAlongWall(wall, mid);
  const rotationY = wallRotationY(wall);
  const y = defaults.sill + defaults.height / 2;

  return (
    <mesh position={[x, y, z]} rotation={[0, rotationY, 0]}>
      <boxGeometry args={[width, defaults.height, wall.thickness * 1.05]} />
      <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.45} depthWrite={false} />
    </mesh>
  );
}
