import { useLayoutEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { useSceneStore } from '../store';
import { PALETTE } from '../theme/palette';
import { LevelsRenderer } from './LevelsRenderer';
import { LabelProjector } from './LabelProjector';
import { SimClock } from './SimClock';
import { AgentsLayer } from './AgentsLayer';
import { StairsLayer } from './StairsLayer';
import { CameraRig } from './CameraRig';
import { HeatmapLayer } from './HeatmapLayer';
import { ProbeController } from './ProbeController';
import { houseBounds } from './bounds';

/**
 * Object positions (the camera's included, via props computed from `viewMode`/`activeLevelId`)
 * are applied synchronously during React's commit, but a THREE.Object3D's `matrixWorld` — what
 * `.project()` and raycasting both use — is normally only recomputed once per animation frame,
 * as part of the renderer's own traversal. A brand-new object (e.g. a level just added and
 * switched to) starts with an identity `matrixWorld` until that first frame runs, so pointer
 * events / world-to-screen projections that happen before then are silently wrong: raycasts miss
 * meshes that are actually right under the cursor, and `.project()` reports stale coordinates.
 * Forcing a full matrix-world update after every commit keeps the scene graph always in sync
 * with the latest React-applied positions, independent of frame timing.
 */
function SceneMatrixSync() {
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    scene.updateMatrixWorld(true);
  });
  return null;
}

export function SceneCanvas() {
  const viewMode = useSceneStore((s) => s.viewMode);
  const activeLevelId = useSceneStore((s) => s.activeLevelId);
  const doc = useSceneStore((s) => s.doc);
  const mode = useSceneStore((s) => s.mode);
  const setSelection = useSceneStore((s) => s.setSelection);

  const bounds = useMemo(() => houseBounds(doc), [doc]);
  const activeLevel = doc.levels.find((l) => l.id === activeLevelId) ?? doc.levels[0];
  const centerY = activeLevel ? activeLevel.elevation + activeLevel.height / 2 : 1.5;
  const floorY = activeLevel ? activeLevel.elevation : 0;

  return (
    <Canvas
      flat
      dpr={[1, 2]}
      gl={{ antialias: true }}
      // In Monitor there is no ground plane catching clicks, so a click that hits nothing means
      // "deselect". (Edit mode's interaction plane always catches the click.)
      onPointerMissed={() => {
        if (mode === 'monitor') setSelection(null);
      }}
      onCreated={(state) => {
        // Dev-only: lets E2E tests project world points to screen pixels with the live camera.
        if (import.meta.env.DEV) (window as unknown as { __r3f: typeof state }).__r3f = state;
      }}
    >
      <color attach="background" args={[PALETTE.bg]} />
      <hemisphereLight args={['#e6e9f5', '#34384a', 1.5]} />
      <directionalLight position={[10, 22, 8]} intensity={1.7} />
      <directionalLight position={[-12, 10, -10]} intensity={0.35} />

      <CameraRig bounds={bounds} floorY={floorY} centerY={centerY} />

      <LevelsRenderer bounds={bounds} />
      <HeatmapLayer />
      <StairsLayer />
      <AgentsLayer />
      <SimClock />
      <LabelProjector />
      <ProbeController />
      <SceneMatrixSync />

      {viewMode === '3d' && (
        <ContactShadows
          position={[bounds.cx, floorY + 0.015, bounds.cz]}
          scale={Math.max(bounds.width, bounds.depth) + 8}
          blur={2.2}
          opacity={0.55}
          far={2.4}
          resolution={512}
          color="#05060a"
        />
      )}
    </Canvas>
  );
}
