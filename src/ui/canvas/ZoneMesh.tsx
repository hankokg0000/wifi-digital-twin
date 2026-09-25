import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Zone } from '../../core';
import { isZoneOccupied } from './zoneOccupancy';

interface ZoneMeshProps {
  zone: Zone;
  polygon: [number, number][]; // resolved — room-linked zones follow the room's live polygon
  selected: boolean;
  interactive: boolean;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

const RESTRICTED_COLOR = '#d0021b';
const DISABLED_COLOR = '#6b7280';
const SELECTED_COLOR = '#5ac8fa';

/** Translucent fill + dashed outline for a restricted zone. Enabled zones pulse brighter while
 * an applicable agent is inside (driven every frame from the zoneOccupancy registry, no React
 * state — matches AgentsLayer's per-frame-motion-without-re-render rule). Disabled zones render
 * as a grey dashed outline only (no fill), per the design brief. */
export function ZoneMesh({ zone, polygon, selected, interactive, onSelect }: ZoneMeshProps) {
  const fillRef = useRef<THREE.Mesh>(null);
  const baseColor = selected ? SELECTED_COLOR : zone.enabled ? RESTRICTED_COLOR : DISABLED_COLOR;
  const baseOpacity = selected ? 0.4 : zone.enabled ? 0.18 : 0;

  useFrame(({ clock }) => {
    if (!fillRef.current || !zone.enabled || selected) return;
    const mat = fillRef.current.material as THREE.MeshBasicMaterial;
    const pulsing = isZoneOccupied(zone.id);
    const target = pulsing ? 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 4)) : baseOpacity;
    if (Math.abs(mat.opacity - target) > 0.002) mat.opacity = target;
  });

  const shape = useMemo(() => {
    if (polygon.length < 3) return null;
    const s = new THREE.Shape();
    polygon.forEach(([x, z], i) => {
      // Shape() lives in the XY plane; rotating -90deg on X maps local (x, y) to world (x, -y).
      if (i === 0) s.moveTo(x, -z);
      else s.lineTo(x, -z);
    });
    s.closePath();
    return s;
  }, [polygon]);

  const outlinePoints = useMemo((): [number, number, number][] => {
    if (polygon.length < 2) return [];
    const pts = polygon.map(([x, z]): [number, number, number] => [x, 0.05, z]);
    pts.push(pts[0]!);
    return pts;
  }, [polygon]);

  if (!shape) return null;

  return (
    <group>
      <mesh ref={fillRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={interactive ? onSelect : undefined}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={baseColor} transparent opacity={baseOpacity} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {outlinePoints.length >= 2 && (
        <Line points={outlinePoints} color={baseColor} lineWidth={2} dashed dashSize={0.2} gapSize={0.12} />
      )}
    </group>
  );
}
