import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, MapControls, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneStore } from '../store';
import { prefersReducedMotion } from '../theme/motion';
import type { Bounds } from './bounds';

const FOCUS_MS = 250;
const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);

/** Editing keeps free ground beside the house in view to draw on;
 * Monitor fits the house to the canvas, leaving room for the banner and legend. */
const EDIT_CENTER_SHIFT_X = 1.5;
const EDIT_FREE_GROUND = 4.2; // m of free ground kept visible right of the house for drawing

interface CameraRigProps {
  bounds: Bounds;
  floorY: number;
  centerY: number;
}

/**
 * Owns the camera + controls for both views and the smooth "pan to agent" animation (250 ms
 * ease-out-quart, instant under reduced motion) driven by the store's `focusRequest`.
 */
export function CameraRig({ bounds, floorY, centerY }: CameraRigProps) {
  const viewMode = useSceneStore((s) => s.viewMode);
  const mode = useSceneStore((s) => s.mode);
  const cameraLocked = useSceneStore((s) => s.cameraLocked);
  const focus = useSceneStore((s) => s.focusRequest);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const controlsRef = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; offset: THREE.Vector3; start: number } | null>(null);

  const editing = mode === 'edit';
  const cx = editing ? bounds.cx + EDIT_CENTER_SHIFT_X : bounds.cx;
  const cz = bounds.cz;

  const fitZoom = Math.min(
    Math.max(size.width - 96, 200) / (bounds.width + 1.2),
    Math.max(size.height - 130, 200) / (bounds.depth + 1.2),
  );
  const editZoom = Math.min(
    (size.width / 2 - 20) / (bounds.maxX + EDIT_FREE_GROUND - cx),
    (size.height - 80) / (bounds.depth + 1.5),
    70,
  );
  const zoom = editing ? Math.max(editZoom, 20) : Math.min(Math.max(fitZoom, 20), 120);

  // 3D: 35 deg elevation, slightly off-axis, orbit-damped.
  const elevation = (35 * Math.PI) / 180;
  const azimuth = (28 * Math.PI) / 180;
  const fov = 38;
  const radius = Math.hypot(bounds.width, bounds.depth) / 2 + 0.5;
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  const aspect = Math.max(size.width / Math.max(size.height, 1), 0.4);
  const dist = (radius / (tanHalf * Math.min(aspect, 1))) * 1.04; // fit the house in both axes
  const camPos: [number, number, number] = [
    bounds.cx + dist * Math.sin(azimuth) * Math.cos(elevation),
    centerY + dist * Math.sin(elevation),
    bounds.cz + dist * Math.cos(azimuth) * Math.cos(elevation),
  ];

  useEffect(() => {
    if (!focus) return;
    const c = controlsRef.current;
    if (!c) return;
    const to = new THREE.Vector3(focus.x, c.target.y, focus.z);
    const offset = camera.position.clone().sub(c.target);
    if (prefersReducedMotion()) {
      c.target.copy(to);
      camera.position.copy(to).add(offset);
      c.update();
      return;
    }
    anim.current = { from: c.target.clone(), to, offset, start: performance.now() };
  }, [focus, camera]);

  useFrame(() => {
    const a = anim.current;
    const c = controlsRef.current;
    if (!a || !c) return;
    const p = Math.min((performance.now() - a.start) / FOCUS_MS, 1);
    const e = easeOutQuart(p);
    c.target.lerpVectors(a.from, a.to, e);
    camera.position.copy(c.target).add(a.offset);
    c.update();
    if (p >= 1) anim.current = null;
  });

  return viewMode === 'plan' ? (
    <>
      <OrthographicCamera makeDefault position={[cx, floorY + 30, cz + 0.001]} zoom={zoom} near={0.1} far={200} />
      <MapControls
        ref={controlsRef as never}
        enabled={!cameraLocked}
        enableRotate={false}
        enableDamping={!prefersReducedMotion()}
        dampingFactor={0.12}
        screenSpacePanning
        target={[cx, floorY, cz]}
        minZoom={10}
        maxZoom={200}
      />
    </>
  ) : (
    <>
      <PerspectiveCamera makeDefault position={camPos} fov={fov} near={0.1} far={500} />
      <OrbitControls
        ref={controlsRef as never}
        enabled={!cameraLocked}
        enableDamping={!prefersReducedMotion()}
        dampingFactor={0.08}
        target={[bounds.cx, centerY, bounds.cz]}
        minDistance={6}
        maxDistance={70}
        maxPolarAngle={Math.PI * 0.49}
      />
    </>
  );
}
