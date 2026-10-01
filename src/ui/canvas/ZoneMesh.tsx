import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Zone } from '../../core';
import { PALETTE } from '../theme/palette';
import { prefersReducedMotion } from '../theme/motion';
import { isZoneOccupied } from './zoneOccupancy';

interface ZoneMeshProps {
  zone: Zone;
  polygon: [number, number][]; // resolved — room-linked zones follow the room's live polygon
  selected: boolean;
  interactive: boolean;
  onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

const HATCH_SPACING = 0.32; // m between hatch lines (UVs of ShapeGeometry are world meters)

let hatchTexture: THREE.CanvasTexture | null = null;

/** Diagonal hatch in the warning hue over a faint wash; one shared texture, tiled in world
 * space (ShapeGeometry UVs are the polygon's own x/y meters, so `repeat = 1/spacing`). */
function getHatchTexture(): THREE.CanvasTexture {
  if (hatchTexture) return hatchTexture;
  const px = 64;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(0, 0, px, px);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 5;
  for (const o of [-px, 0, px]) {
    g.beginPath();
    g.moveTo(o, px);
    g.lineTo(o + px, 0);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / HATCH_SPACING, 1 / HATCH_SPACING);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  hatchTexture = tex;
  return tex;
}

/** Restricted zone: warning-hue diagonal hatch + dashed outline. When an applicable agent is
 * inside, the hatch strengthens and the outline goes solid (driven per frame from the
 * zoneOccupancy registry — no React state). Disabled zones are an ink-3 dashed outline only. */
export function ZoneMesh({ zone, polygon, selected, interactive, onSelect }: ZoneMeshProps) {
  const fillRef = useRef<THREE.Mesh>(null);
  const dashedRef = useRef<THREE.Object3D>(null);
  const solidRef = useRef<THREE.Object3D>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  const outlineColor = selected ? PALETTE.accent : zone.enabled ? PALETTE.warning : PALETTE.ink3;
  const IDLE = 0.34;

  useFrame(({ clock }) => {
    const occupied = zone.enabled && isZoneOccupied(zone.id);
    if (fillRef.current && zone.enabled && !selected) {
      const mat = fillRef.current.material as THREE.MeshBasicMaterial;
      const target = occupied ? (reduced ? 0.8 : 0.72 + 0.2 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 4))) : IDLE;
      if (Math.abs(mat.opacity - target) > 0.002) mat.opacity = target;
    }
    if (dashedRef.current) dashedRef.current.visible = !occupied;
    if (solidRef.current) solidRef.current.visible = occupied;
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

  const showHatch = zone.enabled && !selected;

  return (
    <group>
      {(showHatch || selected) && (
        <mesh ref={fillRef} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={interactive ? onSelect : undefined}>
          <shapeGeometry args={[shape]} />
          {selected ? (
            <meshBasicMaterial color={PALETTE.accent} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
          ) : (
            <meshBasicMaterial
              color={PALETTE.warning}
              map={getHatchTexture()}
              transparent
              opacity={IDLE}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          )}
        </mesh>
      )}
      {!zone.enabled && interactive && (
        // Disabled zones have no fill, but stay clickable in Edit mode via an invisible mesh.
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onSelect}>
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
      {outlinePoints.length >= 2 && (
        <>
          <Line ref={dashedRef as never} points={outlinePoints} color={outlineColor} lineWidth={1.75} dashed dashSize={0.22} gapSize={0.14} />
          {zone.enabled && <Line ref={solidRef as never} points={outlinePoints} color={outlineColor} lineWidth={2.5} visible={false} />}
        </>
      )}
    </group>
  );
}
