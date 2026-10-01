import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useSceneStore } from '../store';
import { useHeatmap } from '../rf/useHeatmap';
import { heatmapToRgba } from '../rf/colormap';

const LIFT = 0.03; // m above the floor: over the room fill (0.02), under agents and labels
const OPACITY = { plan: 0.62, '3d': 0.55 } as const;

/**
 * WiFi signal layer: one plane over the active level's floor, textured straight from the worker's
 * Float32 grid (one texel per 0.25 m cell, linear filtering for the smooth look). 3D shows the
 * active level only. Cells outside rooms are alpha 0.
 */
export function HeatmapLayer() {
  const enabled = useSceneStore((s) => s.heatmap.enabled);
  const viewMode = useSceneStore((s) => s.viewMode);
  const elevation = useSceneStore((s) => s.doc.levels.find((l) => l.id === s.activeLevelId)?.elevation ?? 0);
  const { heatmap } = useHeatmap();

  const texture = useMemo(() => {
    if (!heatmap || heatmap.cols === 0) return null;
    const t = new THREE.DataTexture(heatmapToRgba(heatmap.values, heatmap.cols, heatmap.rows), heatmap.cols, heatmap.rows, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [heatmap]);

  useEffect(() => () => texture?.dispose(), [texture]);

  if (!enabled || !heatmap || !texture) return null;
  const w = heatmap.cols * heatmap.cell;
  const d = heatmap.rows * heatmap.cell;
  return (
    // +90 deg about X maps the plane's local +y to world +z, so texture row r is z-row r.
    <mesh position={[heatmap.minX + w / 2, elevation + LIFT, heatmap.minZ + d / 2]} rotation={[Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={texture} transparent opacity={OPACITY[viewMode]} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}
