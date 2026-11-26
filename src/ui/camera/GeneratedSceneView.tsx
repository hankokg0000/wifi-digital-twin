import { Canvas, useFrame } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Shape, Vector2, type Group } from 'three';
import type { CameraScene } from '../../core/camera/feed';
import type { FloorPlanGeometry, GeneratedFloorPlan, PlanObject, PlanObjectKind } from '../../core/camera/floor-plan';
import type { SceneObservation } from '../../core/camera/generated-scene';
import type { UsdRoomModel } from '../../core/camera/plan-import';
import { moveAvatar, type DemoArea } from '../../core/camera/site-demo';
import { WifiPlacement } from './WifiPlacement';

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

function PlanLights({ studio = false }: { studio?: boolean }) {
  return <>
    <ambientLight intensity={studio ? 0.57 : 1.14} />
    <hemisphereLight args={['#dce5fd', '#303649', 1.08]} />
    <directionalLight position={studio ? [-9, 16, 1] : [-2, 7, 3]} color={studio ? '#ffe0b8' : '#fff1dc'}
      intensity={studio ? 2.05 : 2.28} castShadow={studio}
      shadow-mapSize={[1536, 1536]} shadow-camera-left={-25} shadow-camera-right={25}
      shadow-camera-top={24} shadow-camera-bottom={-24} shadow-normalBias={0.025} shadow-radius={3} />
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
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.83} />
    </mesh>
  );
}

function ObjectModel({ model, furniture, stocked }: { model: PlanObject; furniture?: string; stocked?: boolean }) {
  const { kind, center: [x, z], width: w, length: d, height: h, rotation } = model;
  const color = stocked && kind === 'shelf' ? '#974b35'
    : furniture && (kind === 'desk' || kind === 'unknown') ? furniture : kinds[kind].color;
  const thin = Math.min(0.055, w * 0.1, d * 0.12, h * 0.14);
  return (
    <group position={[x, 0.025, z]} rotation={[0, rotation, 0]}>
      {kind === 'shelf' ? (
        <>
          <Solid position={[0, h / 2, -d / 2 + thin / 2]} size={[w, h, thin]} color={stocked ? '#555b60' : '#536888'} />
          {[-1, 1].map((edge) => (
            <Solid key={edge} position={[(w - thin) * edge / 2, h / 2, 0]} size={[thin, h, d]} color={color} />
          ))}
          {[0.12, 0.44, 0.74, 0.96].map((tier) => (
            <Solid key={tier} position={[0, h * tier, 0]} size={[w, thin, d]} color={color} />
          ))}
          {stocked && [0.12, 0.44, 0.74].flatMap(tier => [-0.34, -0.1, 0.14, 0.36].map((bay, index) => (
            <Solid key={`${tier}:${bay}`} position={[w * bay, h * (tier + 0.112), 0.08]}
              size={[w * 0.15, h * 0.19, d * (index % 2 ? 0.52 : 0.72)]} color={index % 2 ? '#d2b290' : '#b88154'} />
          )))}
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

export function PlanStage({ plan, outlineOnly = false, lit = true, tone }: {
  plan: FloorPlanGeometry; outlineOnly?: boolean; lit?: boolean; tone?: DemoArea['tone'];
}) {
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
      {lit && <PlanLights studio={Boolean(tone)} />}
      {!outlineOnly && <Solid position={[(left + right) / 2, -0.066, (front + back) / 2]}
        size={[right - left, 0.12, back - front]} color={tone?.base ?? '#30374d'} />}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <shapeGeometry args={[surface]} />
        <meshStandardMaterial color={tone?.floor ?? '#46536d'} roughness={0.93} />
      </mesh>
      {plan.walls.map(({ from: [ax, az], to: [bx, bz], inferred }, index) => {
        if (inferred) {
          return <Line key={index} points={[[ax, 0.09, az], [bx, 0.09, bz]]}
            color="#b0a0db" transparent opacity={0.85} lineWidth={1.65} dashed dashSize={span * 0.023} gapSize={span * 0.016} />;
        }
        const wallHeight = tone ? 1.8 : span * 0.105;
        return (
          <group key={index} position={[(ax + bx) / 2, 0, (az + bz) / 2]} rotation={[0, -Math.atan2(bz - az, bx - ax), 0]}>
            <Solid position={[0, wallHeight / 2, 0]} size={[Math.hypot(bx - ax, bz - az), wallHeight, span * 0.012]} color={tone?.wall ?? '#78819a'} />
          </group>
        );
      })}
      {plan.objects.map((model, index) => <ObjectModel key={index} model={model} furniture={tone?.furniture} stocked={tone?.stocked} />)}
      {tone?.glazing && Array.from({ length: 4 }, (_, index) => {
        const width = (back - front) / 4;
        const z = front + width * (index + 0.5);
        return <group key={index}>
          <Solid position={[left + 0.03, 2.19, z]} size={[0.13, 1.44, width - 0.13]} color="#869fa7" />
          <Solid position={[left + 0.14, 2.92, z]} size={[0.22, 0.08, width]} color="#454a4b" />
          <Solid position={[left + 0.14, 2.2, z + width / 2 - 0.06]} size={[0.21, 1.46, 0.10]} color="#43484a" />
        </group>;
      })}
      {tone?.display && <>
        <Solid position={[(left + right) / 2, 1.93, front + 0.20]} size={[3.5, 1.74, 0.16]} color="#28323b" />
        <Solid position={[(left + right) / 2, 1.93, front + 0.29]} size={[3.29, 1.54, 0.04]} color="#e3e4db" />
      </>}
      {tone?.timber && <>
        <Solid position={[left + 0.19, 1.04, (front + back) / 2]} size={[0.14, 0.14, back - front - 0.05]} color="#76543d" />
        <Solid position={[(left + right) / 2, 0.035, back - 0.09]} size={[right - left - 0.04, 0.15, 0.17]} color="#ad9478" />
      </>}
    </>
  );
}

function TrackedFigure({ x, z, radius, height, simulated, seat }: {
  x: number; z: number; radius: number; height: number; simulated: boolean; seat?: SceneObservation['seat'];
}) {
  const root = useRef<Group>(null);
  const origin = useRef<[number, number, number]>([x, 0.035, z]);
  const color = seat?.side === 'right' ? '#f2ba72' : simulated ? '#57dfcf' : '#bf9df7';
  const overlay = simulated && !seat;
  const layer = overlay ? 6 : 0;
  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const [nextX, nextZ] = moveAvatar(group.position.x, group.position.z, x, z, delta);
    group.position.x = nextX;
    group.position.z = nextZ;
  });
  const material = { color, transparent: overlay, opacity: 0.98, depthWrite: !overlay, depthTest: !overlay, roughness: 0.72 };
  return (
    <group ref={root} position={origin.current} name={simulated ? 'simulated-floor-position' : 'camera-floor-position'}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={Math.max(0, layer - 1)}>
        <ringGeometry args={[radius * 0.84, radius, 24]} />
        <meshBasicMaterial color={color} depthTest={!overlay} depthWrite={!overlay} />
      </mesh>
      <group scale={seat ? 1.55 : height} rotation-y={seat?.rotation ?? 0}>
        <mesh position={[0, seat ? 0.79 : 0.88, 0]} renderOrder={layer}>
          <sphereGeometry args={[0.085, 10, 7]} />
          <meshStandardMaterial {...material} />
        </mesh>
        <mesh position={[0, seat ? 0.57 : 0.60, 0]} renderOrder={layer}>
          <capsuleGeometry args={[0.115, 0.215, 3, 8]} />
          <meshStandardMaterial {...material} />
        </mesh>
        {[-1, 1].map(side => (
          <group key={side} position-x={side * 0.065}>
            {seat && <mesh position={[0, 0.33, -0.11]} rotation-x={Math.PI / 2}>
              <capsuleGeometry args={[0.047, 0.18, 2, 7]} />
              <meshStandardMaterial {...material} />
            </mesh>}
            <mesh position={[0, seat ? 0.18 : 0.22, seat ? -0.22 : 0]}
              rotation-z={seat ? 0 : side * 0.09} renderOrder={layer}>
              <capsuleGeometry args={[0.045, seat ? 0.24 : 0.33, 2, 7]} />
              <meshStandardMaterial {...material} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

export function PositionMarkers({ observations, span, simulated, height = span * 0.25, markerRadius = span * 0.037 }: {
  observations: SceneObservation[]; span: number; simulated: boolean; height?: number; markerRadius?: number;
}) {
  return observations.map(({ position, id, seat }) => position && (
    <TrackedFigure key={id} x={position[0]} z={position[1]} radius={markerRadius} height={height} simulated={simulated} seat={seat} />
  ));
}

function MotionFloor({ plan, observed }: { plan: FloorPlanGeometry; observed: boolean }) {
  const floor = useMemo(() => new Shape(plan.visibleFloor.map(([x, z]) => new Vector2(x, -z))), [plan]);
  return (
    <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[floor]} />
      <meshBasicMaterial color={observed ? '#69efd6' : '#f4bc69'} transparent opacity={0.42} depthWrite={false} />
    </mesh>
  );
}

export function GeneratedSceneView({ scene, observations, resetKey, topView, highlightMotion, simulatedPositions, wifiPlacement, motionObserved }: {
  scene: CameraScene; observations: SceneObservation[]; resetKey: number; topView?: boolean; highlightMotion?: boolean;
  simulatedPositions?: boolean;
  wifiPlacement?: boolean;
  motionObserved?: boolean;
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

  return <FloorPlanCanvas plan={asset.data} observations={observations} resetKey={`${scene.url}:${resetKey}`}
    topView={topView} highlightMotion={highlightMotion} simulatedPositions={simulatedPositions}
    wifiPlacement={wifiPlacement} motionObserved={motionObserved} />;
}

export function FloorPlanCanvas({ plan, observations = [], resetKey = '', doors = [], outlineOnly = false, usdModel, transparentWalls = true, highlightMotion = false, simulatedPositions = false, topView = false, tone, wifiPlacement = false, motionObserved = false }: {
  plan: FloorPlanGeometry;
  observations?: SceneObservation[];
  resetKey?: string;
  outlineOnly?: boolean;
  usdModel?: UsdRoomModel;
  transparentWalls?: boolean;
  highlightMotion?: boolean;
  simulatedPositions?: boolean;
  topView?: boolean;
  tone?: DemoArea['tone'];
  wifiPlacement?: boolean;
  motionObserved?: boolean;
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
  const distance = tone ? framing * 1.16 : framing;
  const position: Triple = topView ? [center[0], center[1] + distance * 1.85, center[2] + 0.001]
    : [center[0] + distance * 0.44, center[1] + distance * 1.45, center[2] + distance * 0.92];
  const legend = Object.keys(kinds).filter((kind): kind is PlanObjectKind => plan.objects.some((object) => object.kind === kind));

  return (
    <div className="generated-plan">
      <Canvas key={`${resetKey}:${topView}`} aria-label={usdModel ? 'โมเดลสามมิติจาก USDZ' : 'แปลนสามมิติ'}
        camera={{ position, fov: 40, near: 0.03, far: framing * 12 }}
        dpr={[1, 1.6]} shadows={tone ? 'percentage' : false} fallback={<p className="canvas-fallback">เบราว์เซอร์เปิดแปลน 3D ไม่ได้</p>}>
        <color attach="background" args={[tone ? '#151d2b' : '#191c2b']} />
        {usdModel ? <>
          <PlanLights />
          {usdModel.surfaces.map((surface, index) => <UsdSurface key={index} surface={surface} transparentWalls={transparentWalls} />)}
        </> : <PlanStage plan={plan} outlineOnly={outlineOnly} tone={tone} />}
        {highlightMotion && <MotionFloor plan={plan} observed={motionObserved} />}
        {wifiPlacement && <WifiPlacement plan={plan} active={highlightMotion} observed={motionObserved} />}
        <PositionMarkers observations={observations} span={span} simulated={simulatedPositions}
          height={tone ? 1.75 : undefined} markerRadius={tone ? 0.38 : undefined} />
        {doors.map(({ id, from: [ax, az], to: [bx, bz] }) => (
          <Line key={id} points={[[ax, 0.115, az], [bx, 0.115, bz]]} color="#60cfbd" lineWidth={3} />
        ))}
        <OrbitControls target={center} minDistance={framing * 0.6} maxDistance={framing * 2.6} maxPolarAngle={1.15} />
      </Canvas>
      {!usdModel && !tone && legend.length > 0 && (
        <ul className="generated-plan-key" aria-label="ชนิดโมเดลในแปลน">
          {legend.map((kind) => (
            <li key={kind}><i aria-hidden="true" style={{ backgroundColor: kinds[kind].color }} />{kinds[kind].label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
