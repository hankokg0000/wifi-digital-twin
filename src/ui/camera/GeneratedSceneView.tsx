import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Shape, Vector2 } from 'three';
import type { CameraScene } from '../../core/camera/feed';
import type { FloorPlanGeometry, GeneratedFloorPlan, PlanObject, PlanObjectKind } from '../../core/camera/floor-plan';
import type { SceneObservation } from '../../core/camera/generated-scene';
import type { UsdRoomModel } from '../../core/camera/plan-import';

const kinds: Record<PlanObjectKind, { label: string; color: string }> = {
  shelf: { label: 'ชั้นวาง', color: '#7899ca' },
  counter: { label: 'เคาน์เตอร์', color: '#cc805d' },
  basket: { label: 'ตะกร้า', color: '#d6b679' },
  desk: { label: 'โต๊ะ', color: '#b6a987' },
  chair: { label: 'เก้าอี้', color: '#7dadad' },
  sofa: { label: 'โซฟา', color: '#a392c2' },
  unknown: { label: 'ยังไม่ทราบชนิด', color: '#8991a3' },
};

type Triple = [number, number, number];

const surfaceColors = {
  floor: '#515f77', wall: '#8f9bb5', frame: '#b3c1d5', glass: '#69c5ba', furniture: '#a9b6ce',
};

function PlanLights() {
  return <>
    <ambientLight intensity={1.14} />
    <hemisphereLight args={['#dce5fd', '#303649', 1.08]} />
    <directionalLight position={[-2, 7, 3]} color="#fff1dc" intensity={2.28} />
  </>;
}

function UsdSurface({ surface, transparentWalls }: {
  surface: UsdRoomModel['surfaces'][number]; transparentWalls: boolean;
}) {
  const geometry = useMemo(() => {
    const shape = new BufferGeometry();
    shape.setAttribute('position', new Float32BufferAttribute(surface.positions, 3));
    shape.setIndex(surface.indices);
    shape.computeVertexNormals();
    return shape;
  }, [surface]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const opacity = surface.kind === 'glass' ? 0.27 : surface.kind === 'wall' && transparentWalls ? 0.28 : 1;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={surfaceColors[surface.kind]} roughness={0.86} side={DoubleSide}
        transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} forceSinglePass />
    </mesh>
  );
}

function Solid({ position, size, color }: { position: Triple; size: Triple; color: string }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.83} />
    </mesh>
  );
}

function ObjectModel({ model }: { model: PlanObject }) {
  const { kind, center: [x, z], width: w, length: d, height: h, rotation } = model;
  const { color } = kinds[kind];
  const thin = Math.min(0.055, w * 0.1, d * 0.12, h * 0.14);
  return (
    <group position={[x, 0.025, z]} rotation={[0, rotation, 0]}>
      {kind === 'shelf' ? (
        <>
          <Solid position={[0, h / 2, -d / 2 + thin / 2]} size={[w, h, thin]} color="#536888" />
          {[-1, 1].map((edge) => (
            <Solid key={edge} position={[(w - thin) * edge / 2, h / 2, 0]} size={[thin, h, d]} color={color} />
          ))}
          {[0.12, 0.44, 0.74, 0.96].map((tier) => (
            <Solid key={tier} position={[0, h * tier, 0]} size={[w, thin, d]} color={color} />
          ))}
        </>
      ) : kind === 'basket' ? (
        <>
          <mesh position={[0, h * 0.7, 0]} scale={[w / d, 1, 1]}>
            <cylinderGeometry args={[d * 0.48, d * 0.31, h * 0.55, 12, 1, true]} />
            <meshStandardMaterial color={color} wireframe />
          </mesh>
          <Solid position={[0, h * 0.24, 0]} size={[thin, h * 0.48, thin]} color={color} />
          <Solid position={[0, thin / 2, 0]} size={[w * 0.48, thin, d * 0.52]} color={color} />
        </>
      ) : kind === 'desk' ? (
        <>
          <Solid position={[0, h - thin / 2, 0]} size={[w, thin, d]} color={color} />
          {[-1, 1].map((edge) => (
            <Solid key={edge} position={[(w - thin * 3) * edge / 2, h / 2, 0]} size={[thin, h, d * 0.74]} color={color} />
          ))}
        </>
      ) : kind === 'chair' ? (
        <>
          <Solid position={[0, h * 0.50, 0]} size={[w, thin * 2, d]} color={color} />
          <Solid position={[0, h * 0.74, d * 0.42]} size={[w, h * 0.5, thin]} color={color} />
          <Solid position={[0, h * 0.24, 0]} size={[thin, h * 0.48, thin]} color={color} />
        </>
      ) : kind === 'sofa' ? (
        <>
          <Solid position={[0, h * 0.23, 0]} size={[w, h * 0.46, d]} color={color} />
          <Solid position={[0, h * 0.66, d * 0.38]} size={[w, h * 0.68, d * 0.24]} color={color} />
          {[-1, 1].map((edge) => (
            <Solid key={edge} position={[edge * w * 0.43, h * 0.59, -d * 0.04]}
              size={[w * 0.14, h * 0.26, d * 0.81]} color={color} />
          ))}
        </>
      ) : (
        <>
          <Solid position={[0, h / 2, 0]} size={[w, h, d]} color={color} />
          {kind === 'counter' && <Solid position={[0, h - thin / 2, 0]} size={[w + thin, thin, d + thin]} color="#efcfb7" />}
        </>
      )}
    </group>
  );
}

function PlanStage({ plan, outlineOnly }: { plan: FloorPlanGeometry; outlineOnly: boolean }) {
  const [left, front, right, back] = plan.bounds;
  const span = Math.max(right - left, back - front);
  const surface = useMemo(() => {
    const shape = new Shape();
    for (const [index, [x, z]] of plan.visibleFloor.entries()) {
      if (index === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    shape.closePath();
    return shape;
  }, [plan.visibleFloor]);

  return (
    <>
      <PlanLights />
      {!outlineOnly && <Solid position={[(left + right) / 2, -0.066, (front + back) / 2]}
        size={[right - left, 0.12, back - front]} color="#30374d" />}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[surface]} />
        <meshStandardMaterial color="#46536d" roughness={0.93} />
      </mesh>
      {plan.walls.map(({ from: [ax, az], to: [bx, bz], inferred }, index) => {
        if (inferred) {
          return <Line key={index} points={[[ax, 0.09, az], [bx, 0.09, bz]]}
            color="#b0a0db" transparent opacity={0.85} lineWidth={1.65} dashed dashSize={span * 0.023} gapSize={span * 0.016} />;
        }
        const wallHeight = span * 0.105;
        return (
          <group key={index} position={[(ax + bx) / 2, 0, (az + bz) / 2]} rotation={[0, -Math.atan2(bz - az, bx - ax), 0]}>
            <Solid position={[0, wallHeight / 2, 0]} size={[Math.hypot(bx - ax, bz - az), wallHeight, span * 0.012]} color="#78819a" />
          </group>
        );
      })}
      {plan.objects.map((model, index) => <ObjectModel key={index} model={model} />)}
    </>
  );
}

function HumanFigure({ height, simulated }: { height: number; simulated: boolean }) {
  const shirt = simulated ? '#54e0cb' : '#b492fa';
  const skin = simulated ? '#c8fff0' : '#efe0ff';
  const trousers = simulated ? '#31948a' : '#805ac7';
  const material = { roughness: 0.7, transparent: simulated, opacity: simulated ? 0.96 : 1,
    depthTest: !simulated, depthWrite: !simulated };

  // Local units are fractions of standing height. Keep the limbs apart so
  // the silhouette stays legible in the elevated floor-plan view.
  return (
    <group name="human-figure" scale={height}>
      <mesh name="torso" position={[0, 0.64, 0]} scale={[0.126, 0.18, 0.074]} renderOrder={simulated ? 6 : 0}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color={shirt} {...material} />
      </mesh>
      <mesh name="neck" position={[0, 0.826, 0.01]} renderOrder={simulated ? 7 : 0}>
        <cylinderGeometry args={[0.037, 0.043, 0.06, 10]} />
        <meshStandardMaterial color={skin} {...material} />
      </mesh>
      <mesh name="head" position={[0, 0.91, 0.012]} scale={[0.075, 0.09, 0.072]} renderOrder={simulated ? 8 : 0}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color={skin} {...material} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh name="arm" position={[side * 0.151, 0.644, 0.013]} rotation={[0, 0, side * 0.24]} renderOrder={simulated ? 7 : 0}>
            <capsuleGeometry args={[0.036, 0.196, 4, 10]} />
            <meshStandardMaterial color={shirt} {...material} />
          </mesh>
          <mesh name="hand" position={[side * 0.183, 0.518, 0.013]} scale={[0.031, 0.048, 0.03]} renderOrder={simulated ? 7 : 0}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color={skin} {...material} />
          </mesh>
          <mesh name="leg" position={[side * 0.066, 0.251, side * 0.018]} rotation={[0, 0, side * 0.063]} renderOrder={simulated ? 6 : 0}>
            <capsuleGeometry args={[0.046, 0.37, 4, 10]} />
            <meshStandardMaterial color={trousers} {...material} />
          </mesh>
          <mesh name="foot" position={[side * 0.08, 0.027, 0.053 + side * 0.018]} scale={[0.046, 0.027, 0.093]} renderOrder={simulated ? 7 : 0}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial color={trousers} {...material} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function PositionMarkers({ observations, span, simulated }: { observations: SceneObservation[]; span: number; simulated: boolean }) {
  const radius = span * 0.037;
  return observations.map(({ position, id }) => {
    if (!position) return null;
    const [x, z] = position;
    return (
      <group key={id} name={simulated ? 'simulated-floor-position' : 'camera-floor-position'} position={[x, 0.035, z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={simulated ? 5 : 0}>
          <ringGeometry args={[radius * 0.78, radius, 32]} />
          <meshBasicMaterial color={simulated ? '#54e0cb' : '#bd9bff'} transparent={simulated} depthTest={!simulated} depthWrite={!simulated} />
        </mesh>
        <HumanFigure height={span * 0.25} simulated={simulated} />
      </group>
    );
  });
}

function MotionFloor({ plan }: { plan: FloorPlanGeometry }) {
  const floor = useMemo(() => new Shape(plan.visibleFloor.map(([x, z]) => new Vector2(x, -z))), [plan]);
  return (
    <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[floor]} />
      <meshBasicMaterial color="#f4bc69" transparent opacity={0.42} depthWrite={false} />
    </mesh>
  );
}

export function GeneratedSceneView({ scene, observations, resetKey }: {
  scene: CameraScene; observations: SceneObservation[]; resetKey: number;
}) {
  const [asset, setAsset] = useState<{ url: string; data: GeneratedFloorPlan } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (scene.kind !== 'floor-plan') return;
    const abort = new AbortController();
    void fetch(scene.url, { signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Plan unavailable');
      const data = await response.json() as GeneratedFloorPlan;
      if (data.version !== 1 || !data.visibleFloor?.length) throw new Error('Plan format unavailable');
      return data;
    }).then((data) => {
      if (!abort.signal.aborted) setAsset({ url: scene.url, data });
    }).catch(() => {
      if (!abort.signal.aborted) setFailed(scene.url);
    });
    return () => abort.abort();
  }, [scene.kind, scene.url]);
  if (scene.kind !== 'floor-plan') return <p className="canvas-fallback">รอสร้างแปลน 3D จากคลิปนี้</p>;
  if (asset?.url !== scene.url) {
    return <p className="canvas-fallback">{failed === scene.url ? 'เปิดแปลนจากคลิปไม่ได้' : 'กำลังเปิดแปลนจากคลิป…'}</p>;
  }

  return <FloorPlanCanvas plan={asset.data} observations={observations} resetKey={`${scene.url}:${resetKey}`} />;
}

export function FloorPlanCanvas({ plan, observations = [], resetKey = '', doors = [], outlineOnly = false, usdModel, transparentWalls = true, highlightMotion = false, simulatedPositions = false }: {
  plan: FloorPlanGeometry;
  observations?: SceneObservation[];
  resetKey?: string;
  outlineOnly?: boolean;
  usdModel?: UsdRoomModel;
  transparentWalls?: boolean;
  highlightMotion?: boolean;
  simulatedPositions?: boolean;
  doors?: { id: string; from: readonly [number, number]; to: readonly [number, number] }[];
}) {
  const [left, front, right, back] = plan.bounds;
  const span = Math.max(right - left, back - front);
  const modelHeight = useMemo(() => {
    let bottom = 0;
    let top = 0;
    for (const { positions } of usdModel?.surfaces ?? []) {
      for (let index = 1; index < positions.length; index += 3) {
        bottom = Math.min(bottom, positions[index]!);
        top = Math.max(top, positions[index]!);
      }
    }
    return { center: (top + bottom) / 2, span: top - bottom };
  }, [usdModel]);
  const framing = Math.max(span, modelHeight.span * 1.6);
  const center: Triple = [(left + right) / 2, modelHeight.center, (front + back) / 2];
  const position: Triple = [center[0] + framing * 0.44, center[1] + framing * 1.45, center[2] + framing * 0.92];
  const legend = Object.keys(kinds).filter((kind): kind is PlanObjectKind => plan.objects.some((object) => object.kind === kind));

  return (
    <div className="generated-plan">
      <Canvas key={resetKey} aria-label={usdModel ? 'โมเดลสามมิติจาก USDZ' : 'แปลนสามมิติ'}
        camera={{ position, fov: 40, near: 0.03, far: framing * 12 }}
        dpr={[1, 1.6]} fallback={<p className="canvas-fallback">เบราว์เซอร์เปิดแปลน 3D ไม่ได้</p>}>
        <color attach="background" args={['#191c2b']} />
        {usdModel ? <>
          <PlanLights />
          {usdModel.surfaces.map((surface, index) => <UsdSurface key={index} surface={surface} transparentWalls={transparentWalls} />)}
        </> : <PlanStage plan={plan} outlineOnly={outlineOnly} />}
        {highlightMotion && <MotionFloor plan={plan} />}
        <PositionMarkers observations={observations} span={span} simulated={simulatedPositions} />
        {doors.map(({ id, from: [ax, az], to: [bx, bz] }) => (
          <Line key={id} points={[[ax, 0.115, az], [bx, 0.115, bz]]} color="#60cfbd" lineWidth={3} />
        ))}
        <OrbitControls target={center} minDistance={framing * 0.6} maxDistance={framing * 2.6} maxPolarAngle={1.15} />
      </Canvas>
      {!usdModel && legend.length > 0 && (
        <ul className="generated-plan-key" aria-label="ชนิดโมเดลในแปลน">
          {legend.map((kind) => (
            <li key={kind}><i aria-hidden="true" style={{ backgroundColor: kinds[kind].color }} />{kinds[kind].label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
