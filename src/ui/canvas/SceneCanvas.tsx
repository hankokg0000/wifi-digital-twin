import { useLayoutEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, MapControls, OrbitControls } from '@react-three/drei';
import { useSceneStore } from '../store';
import { LevelsRenderer } from './LevelsRenderer';
import { LabelProjector } from './LabelProjector';
import { SimClock } from './SimClock';
import { AgentsLayer } from './AgentsLayer';
import { StairsLayer } from './StairsLayer';

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
  const cameraLocked = useSceneStore((s) => s.cameraLocked);

  const activeLevel = doc.levels.find((l) => l.id === activeLevelId) ?? doc.levels[0];
  const centerX = 5;
  const centerZ = 6;
  const centerY = activeLevel ? activeLevel.elevation + activeLevel.height / 2 : 1.5;
  const floorY = activeLevel ? activeLevel.elevation : 0;

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={(state) => {
        // Dev-only: lets E2E tests project world points to screen pixels with the live camera.
        if (import.meta.env.DEV) (window as unknown as { __r3f: typeof state }).__r3f = state;
      }}
    >
      <color attach="background" args={['#14171b']} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[12, 24, 8]} intensity={0.7} />
      <directionalLight position={[-10, 14, -8]} intensity={0.25} />

      {viewMode === 'plan' ? (
        <>
          <OrthographicCamera makeDefault position={[centerX, floorY + 30, centerZ + 0.001]} zoom={45} near={0.1} far={200} />
          <MapControls
            enabled={!cameraLocked}
            enableRotate={false}
            screenSpacePanning
            target={[centerX, floorY, centerZ]}
            minZoom={10}
            maxZoom={200}
          />
        </>
      ) : (
        <>
          <PerspectiveCamera makeDefault position={[centerX + 14, centerY + 10, centerZ + 16]} fov={50} near={0.1} far={500} />
          <OrbitControls enabled={!cameraLocked} target={[centerX, centerY, centerZ]} maxPolarAngle={Math.PI * 0.49} />
        </>
      )}

      <LevelsRenderer />
      <StairsLayer />
      <AgentsLayer />
      <SimClock />
      <LabelProjector />
      <SceneMatrixSync />
    </Canvas>
  );
}
