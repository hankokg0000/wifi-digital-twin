import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { useCallback, useMemo, useRef, type ComponentRef } from 'react';
import { Shape, type Group } from 'three';
import type { Agent, Vec2 } from '../../core/scene/types';
import type { SceneObservation } from '../../core/camera/generated-scene';
import { OFFICE_CALIBRATION, OFFICE_DESKS, OFFICE_LENGTH, OFFICE_WIDTH } from '../../core/camera/office';
import { createOfficeProjector, officeRegion, type OfficeChair, type OfficeLayout } from '../../core/camera/office-layout';
import { isInCameraRegion, type CameraTrack, type FloorCalibration, type FloorPoint } from '../../core/camera/tracking';
import { AgentMesh } from '../canvas/AgentMesh';
import { PositionMarkers } from './GeneratedSceneView';
import { WifiPlacement } from './WifiPlacement';
import type { FloorPlanGeometry } from '../../core/camera/floor-plan';

type Triple = [number, number, number];
export type OfficeView = 'perspective' | 'plan';

const CENTER: Triple = [OFFICE_WIDTH / 2, 0.25, OFFICE_LENGTH / 2];
const CAMERA_POSITION: Triple = [18.7, 20.8, 21.7];
const PERSON: Agent = {
  id: 'camera-person',
  name: 'ตำแหน่งที่กล้องตรวจจับ',
  kind: 'person',
  color: '#b29aff',
  radius: 0.23,
  height: 1.7,
  speed: 1.2,
  materialId: 'human-body',
  start: { levelId: 'office', p: [0, 0], dwell: 0 },
  behavior: { type: 'route', waypoints: [], loop: false },
};

function Box({ at, size, color, emissive }: { at: Triple; size: Triple; color: string; emissive?: string }) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={emissive} roughness={0.78} />
    </mesh>
  );
}

function Desk({ x, z, rotation, showSeat, presentation }: {
  x: number; z: number; rotation: number; showSeat: boolean; presentation: boolean;
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      <Box at={[0, 0.79, 0]} size={[1.8, 0.1, 0.84]} color={presentation ? '#bc9470' : '#cad0db'} />
      <Box at={[-0.79, 0.39, 0]} size={[0.08, 0.78, 0.72]} color="#3b4a4c" />
      <Box at={[0.79, 0.39, 0]} size={[0.08, 0.78, 0.72]} color="#3b4a4c" />
      <Box at={[0, 1.12, -0.42]} size={[1.85, 0.58, 0.07]} color={presentation ? '#444a51' : '#52637d'} />
      <Box at={[0.28, 1.06, -0.18]} size={[0.56, 0.31, 0.05]} color="#293248" />
      <Box at={[0.27, 0.87, -0.14]} size={[0.26, 0.08, 0.19]} color="#516565" />
      <Box at={[0.17, 0.85, 0.19]} size={[0.35, 0.03, 0.13]} color="#657772" />
      {showSeat && <Chair x={0} z={0.76} color={presentation ? '#333b43' : '#46546d'} />}
    </group>
  );
}

function Chair({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <Box at={[0, 0.46, 0]} size={[0.58, 0.11, 0.53]} color={color} />
      <Box at={[0, 0.72, 0.23]} size={[0.56, 0.5, 0.09]} color={color} />
      <Box at={[0, 0.23, 0]} size={[0.09, 0.42, 0.09]} color="#444c62" />
      <Box at={[0, 0.06, 0]} size={[0.6, 0.06, 0.08]} color="#444c62" />
      <Box at={[0, 0.06, 0]} size={[0.08, 0.06, 0.55]} color="#444c62" />
    </group>
  );
}

export function OfficeModel({ placedChairs, presentation }: { placedChairs: FloorPoint[]; presentation: boolean }) {
  return (
    <>
      <Box at={[CENTER[0], -0.16, CENTER[2]]} size={[OFFICE_WIDTH, 0.3, OFFICE_LENGTH]} color={presentation ? '#626b76' : '#505969'} />
      <Box at={[CENTER[0], -0.37, CENTER[2]]} size={[OFFICE_WIDTH + 0.17, 0.14, OFFICE_LENGTH + 0.17]} color={presentation ? '#b2a592' : '#373e55'} />
      {Array.from({ length: 13 }, (_, index) => index + 1).map((line) => (
        <Box key={line} at={[CENTER[0], 0.008, line * 0.9]} size={[OFFICE_WIDTH - 0.12, 0.005, 0.015]} color={presentation ? '#727981' : '#526c6a'} />
      ))}
      {presentation && Array.from({ length: 12 }, (_, index) => (
        <Box key={index} at={[0.9 * (index + 1), 0.008, CENTER[2]]} size={[0.015, 0.005, OFFICE_LENGTH - 0.12]} color="#727981" />
      ))}
      <Box at={[CENTER[0], 0.74, 0.06]} size={[OFFICE_WIDTH, 1.48, 0.14]} color={presentation ? '#c9bfaf' : '#68748a'} />
      <Box at={[0.05, 0.4, CENTER[2]]} size={[0.14, 0.8, OFFICE_LENGTH]} color={presentation ? '#b9ae9c' : '#606e84'} />
      {presentation && <>
        <Box at={[CENTER[0], 0.055, OFFICE_LENGTH]} size={[OFFICE_WIDTH, 0.14, 0.12]} color="#d4c8b6" />
        <Box at={[OFFICE_WIDTH, 0.055, CENTER[2]]} size={[0.12, 0.14, OFFICE_LENGTH]} color="#d4c8b6" />
        <Box at={[0.10, 2.44, CENTER[2]]} size={[0.19, 0.10, OFFICE_LENGTH]} color="#e2d8c6" />
      </>}
      {[1.16, 3.79, 6.42, 9.05, 11.68].map((z) => (
        <group key={z}>
          {presentation ? (
            <mesh position={[0.07, 1.63, z]}>
              <boxGeometry args={[0.06, 1.48, 2.55]} />
              <meshStandardMaterial color="#b4c2bc" transparent opacity={0.24} depthWrite={false} roughness={0.2} />
            </mesh>
          ) : <Box at={[0.07, 1.63, z]} size={[0.1, 1.48, 2.55]} color="#afbace" emissive="#374b42" />}
          <Box at={[0.12, 1.65, z - 1.26]} size={[0.15, 1.6, 0.095]} color={presentation ? '#474a4b' : '#52686a'} />
          {presentation && <Box at={[0.12, 1.65, z]} size={[0.12, 1.6, 0.045]} color="#555657" />}
          <Box at={[0.13, 1.63, z]} size={[0.11, 0.045, 2.54]} color={presentation ? '#535351' : '#657c78'} />
          <Box at={[0.12, 0.91, z]} size={[0.24, 0.085, 2.57]} color={presentation ? '#e3d3b7' : '#5b7170'} />
        </group>
      ))}
      {[2, 6.2, 10.2].map((z) => (
        <Box key={z} at={[11.22, 1.26, z]} size={[0.43, 2.52, 0.62]} color={presentation ? '#cac0ad' : '#7b8e84'} />
      ))}
      <Box at={[8.38, 0.91, 0.16]} size={[1.02, 1.82, 0.17]} color="#354b4b" />
      <Box at={[8.67, 0.86, 0.27]} size={[0.14, 0.045, 0.035]} color="#ccd6c9" />
      {OFFICE_DESKS.map(([x, z, rotation]) => {
        const seatX = x + Math.sin(rotation) * 0.76;
        const seatZ = z + Math.cos(rotation) * 0.76;
        const showSeat = !placedChairs.some(([cx, cz]) => Math.hypot(seatX - cx, seatZ - cz) < 0.9);
        return <Desk key={z} x={x} z={z} rotation={rotation} showSeat={showSeat} presentation={presentation} />;
      })}
    </>
  );
}

function TrackedPerson({ track, paused, region }: { track: CameraTrack; paused: boolean; region: Vec2[] | null }) {
  const group = useRef<Group>(null);
  const initialized = useRef(false);
  const before = useRef(paused);
  useFrame((_, delta) => {
    const target = group.current;
    const resumed = before.current && !paused;
    before.current = paused;
    if (!target) return;
    const immediate = paused || track.visibility === 'occluded' || resumed || !initialized.current || Math.hypot(target.position.x - track.x, target.position.z - track.z) > 2;
    const weight = immediate ? 1 : 1 - Math.exp(-16 * delta);
    const x = target.position.x + (track.x - target.position.x) * weight;
    const z = target.position.z + (track.z - target.position.z) * weight;
    if (region && !isInCameraRegion([x, z], region)) {
      target.position.x = track.x;
      target.position.z = track.z;
    } else {
      target.position.x = x;
      target.position.z = z;
    }
    const angle = track.heading - target.rotation.y;
    target.rotation.y += Math.atan2(Math.sin(angle), Math.cos(angle)) * weight;
    initialized.current = true;
  });

  return (
    <group ref={group}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.37, 0.44, 48]} />
        <meshBasicMaterial color={track.visibility === 'visible' ? '#bfabff' : '#eac382'} />
      </mesh>
      <AgentMesh agent={PERSON} selected={false} interactive={false} onSelect={() => {}} />
    </group>
  );
}

type Area = FloorCalibration['floor'];
const suggestionOutline: Triple[] = Array.from({ length: 65 }, (_, index) => {
  const angle = index / 64 * Math.PI * 2;
  return [Math.cos(angle) * 0.44, 0.034, Math.sin(angle) * 0.44];
});

function OfficeControls({ center, position, presentation }: { center: Triple; position: Triple; presentation: boolean }) {
  const aspect = useThree(({ size }) => size.width / Math.max(1, size.height));
  const fit = presentation && aspect > 0 ? Math.max(1, Math.min(2.3, 1.10 / aspect)) : 1;
  const resetControls = useCallback((controller: ComponentRef<typeof OrbitControls> | null) => {
    if (!controller) return;
    controller.object.position.set(
      center[0] + (position[0] - center[0]) * fit,
      center[1] + (position[1] - center[1]) * fit,
      center[2] + (position[2] - center[2]) * fit,
    );
    controller.target.set(...center);
    controller.update();
  }, [center, position, fit]);
  return (
    <OrbitControls ref={resetControls} target={center} enablePan={false}
      minDistance={presentation ? 7 : 10} maxDistance={presentation ? 74 : 39}
      maxPolarAngle={Math.PI / 2.24} />
  );
}

export function OfficeScene({ track, area, paused, resetKey, layout, suggestions, showRegion = true, demoObservations,
  view, highlightMotion = false, selectedSuggestion, wifiPlan, motionObserved = false }: {
  track: CameraTrack | null; area: Area | null; paused: boolean; resetKey: number;
  layout?: OfficeLayout; suggestions?: OfficeChair[]; showRegion?: boolean; demoObservations?: SceneObservation[];
  view?: OfficeView; highlightMotion?: boolean; selectedSuggestion?: string;
  wifiPlan?: FloorPlanGeometry; motionObserved?: boolean;
}) {
  const presentation = view !== undefined;
  const xs = area?.map(([x]) => x);
  const zs = area?.map(([, z]) => z);
  const left = xs ? Math.min(...xs) : 0;
  const right = xs ? Math.max(...xs) : OFFICE_WIDTH;
  const front = zs ? Math.min(...zs) : 0;
  const back = zs ? Math.max(...zs) : OFFICE_LENGTH;
  const live = area !== null;
  const center = useMemo<Triple>(() => live
    ? [(left + right) / 2, 0.25, (front + back) / 2]
    : CENTER, [left, right, front, back, live]);
  const position = useMemo<Triple>(() => {
    const size = Math.max(right - left, back - front, 3);
    if (view === 'plan') return [center[0], 30, center[2] + 0.01];
    if (view === 'perspective') return [center[0] + 14, 17.2, center[2] + 14];
    return live ? [center[0] + size, size * 1.6, center[2] + size * 1.2] : CAMERA_POSITION;
  }, [left, right, front, back, live, center, view]);
  const project = createOfficeProjector(layout?.calibration);
  const placedChairs = layout?.chairs.flatMap(({ id, point }) => {
    const position = project(point);
    return position ? [{ id, position }] : [];
  }) ?? [];
  const selectedRegion = layout ? officeRegion(layout.region, layout.calibration) : null;
  const polygon = JSON.stringify(showRegion ? area ?? selectedRegion ?? OFFICE_CALIBRATION.floor : null);
  const shape = useMemo(() => {
    const corners = JSON.parse(polygon) as Area | null;
    if (!corners?.length) return null;
    const result = new Shape();
    const [x, z] = corners[0];
    result.moveTo(x, -z);
    for (const [px, pz] of corners.slice(1)) result.lineTo(px, -pz);
    result.closePath();
    return result;
  }, [polygon]);
  return (
    <Canvas
      aria-label="ผังออฟฟิศสามมิติ"
      camera={{ position, fov: presentation ? 39 : 38, near: 0.1, far: 220 }}
      dpr={[1, 1.6]}
      shadows={presentation ? 'percentage' : true}
      fallback={<p className="canvas-fallback">เครื่องนี้เปิดผัง 3D ไม่ได้ ลองเปิดด้วยเบราว์เซอร์ที่รองรับ WebGL</p>}
    >
      <color attach="background" args={[presentation ? '#151d2b' : '#191c2b']} />
      {!presentation && <fog attach="fog" args={['#191c2b', 35, 67]} />}
      <ambientLight intensity={presentation ? 0.38 : 0.72} />
      <hemisphereLight args={presentation ? ['#dbe9ff', '#555564', 1.24] : ['#e4f0dc', '#486160', 1.05]} />
      <directionalLight position={presentation ? [-9, 14, 4] : [-8, 16, 11]} intensity={presentation ? 2.45 : 2.15}
        color={presentation ? '#ffe1b8' : '#fff1d9'} castShadow
        shadow-mapSize={presentation ? [2048, 2048] : [1024, 1024]} shadow-camera-left={-16} shadow-camera-right={16}
        shadow-camera-top={17} shadow-camera-bottom={-14} shadow-normalBias={presentation ? 0.025 : 0} shadow-bias={-0.00035}
        shadow-radius={presentation ? 3 : 1} />
      <mesh position={[CENTER[0], -0.48, CENTER[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color={presentation ? '#242e3e' : '#23263a'} roughness={1} />
      </mesh>
      {live
        ? <Box at={[center[0], -0.16, center[2]]} size={[right - left + 1, 0.3, back - front + 1]} color="#505969" />
        : <OfficeModel placedChairs={placedChairs.map(({ position }) => position)} presentation={presentation} />}
      {highlightMotion && (
        <mesh position={[CENTER[0], 0.016, CENTER[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[OFFICE_WIDTH - 0.13, OFFICE_LENGTH - 0.13]} />
          <meshBasicMaterial color={motionObserved ? '#69efd6' : '#efb76e'} transparent opacity={0.46} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      )}
      {shape && (
        <mesh position={[0, 0.019, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color="#7762a6" roughness={0.89} />
        </mesh>
      )}
      {suggestions?.map(({ id, point }) => {
        const floor = project(point);
        if (!floor) return null;
        const selected = id === selectedSuggestion;
        return <group key={id} position={[floor[0], 0, floor[1]]}>
          <Chair x={0} z={0} color={selected ? '#ffe1a7' : '#dab577'} />
          {presentation && <Line points={suggestionOutline} dashed dashSize={0.11} gapSize={0.06}
            color={selected ? '#ffeac9' : '#daa964'} lineWidth={selected ? 2 : 1} />}
        </group>;
      })}
      {placedChairs.map(({ id, position: [x, z] }) => <Chair key={id} x={x} z={z} color={presentation ? '#475a60' : '#b8a0ff'} />)}
      {track && <TrackedPerson track={track} paused={paused} region={selectedRegion} />}
      {demoObservations && <PositionMarkers observations={demoObservations} span={OFFICE_LENGTH} height={2.2} simulated />}
      {wifiPlan && <WifiPlacement plan={wifiPlan} active={highlightMotion} observed={motionObserved} />}
      <OfficeControls key={`${resetKey}:${view ?? ''}`} center={center} position={position} presentation={presentation} />
    </Canvas>
  );
}
