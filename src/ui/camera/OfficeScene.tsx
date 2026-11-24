import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useCallback, useMemo, useRef, type ComponentRef } from 'react';
import { Shape, type Group } from 'three';
import type { Agent, Vec2 } from '../../core/scene/types';
import { OFFICE_CALIBRATION, OFFICE_DESKS, OFFICE_LENGTH, OFFICE_WIDTH } from '../../core/camera/office';
import { createOfficeProjector, officeRegion, type OfficeChair, type OfficeLayout } from '../../core/camera/office-layout';
import { isInCameraRegion, type CameraTrack, type FloorCalibration, type FloorPoint } from '../../core/camera/tracking';
import { AgentMesh } from '../canvas/AgentMesh';

type Triple = [number, number, number];

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

function Desk({ x, z, rotation, showSeat }: { x: number; z: number; rotation: number; showSeat: boolean }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      <Box at={[0, 0.79, 0]} size={[1.8, 0.1, 0.84]} color="#cad0db" />
      <Box at={[-0.79, 0.39, 0]} size={[0.08, 0.78, 0.72]} color="#3b4a4c" />
      <Box at={[0.79, 0.39, 0]} size={[0.08, 0.78, 0.72]} color="#3b4a4c" />
      <Box at={[0, 1.12, -0.42]} size={[1.85, 0.58, 0.07]} color="#52637d" />
      <Box at={[0.28, 1.06, -0.18]} size={[0.56, 0.31, 0.05]} color="#293248" />
      <Box at={[0.27, 0.87, -0.14]} size={[0.26, 0.08, 0.19]} color="#516565" />
      <Box at={[0.17, 0.85, 0.19]} size={[0.35, 0.03, 0.13]} color="#657772" />
      {showSeat && <Chair x={0} z={0.76} color="#46546d" />}
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

function Office({ placedChairs }: { placedChairs: FloorPoint[] }) {
  return (
    <>
      <Box at={[CENTER[0], -0.16, CENTER[2]]} size={[OFFICE_WIDTH, 0.3, OFFICE_LENGTH]} color="#505969" />
      <Box at={[CENTER[0], -0.37, CENTER[2]]} size={[OFFICE_WIDTH + 0.17, 0.14, OFFICE_LENGTH + 0.17]} color="#373e55" />
      {Array.from({ length: 13 }, (_, index) => index + 1).map((line) => (
        <Box key={line} at={[CENTER[0], 0.008, line * 0.9]} size={[OFFICE_WIDTH - 0.12, 0.005, 0.018]} color="#526c6a" />
      ))}
      <Box at={[CENTER[0], 0.74, 0.06]} size={[OFFICE_WIDTH, 1.48, 0.14]} color="#68748a" />
      <Box at={[0.05, 0.4, CENTER[2]]} size={[0.14, 0.8, OFFICE_LENGTH]} color="#606e84" />
      {[1.16, 3.79, 6.42, 9.05, 11.68].map((z) => (
        <group key={z}>
          <Box at={[0.07, 1.63, z]} size={[0.1, 1.48, 2.55]} color="#afbace" emissive="#374b42" />
          <Box at={[0.12, 1.65, z - 1.26]} size={[0.15, 1.6, 0.095]} color="#52686a" />
          <Box at={[0.13, 1.63, z]} size={[0.11, 0.045, 2.54]} color="#657c78" />
          <Box at={[0.12, 0.91, z]} size={[0.24, 0.085, 2.57]} color="#5b7170" />
        </group>
      ))}
      {[2, 6.2, 10.2].map((z) => (
        <Box key={z} at={[11.22, 1.26, z]} size={[0.43, 2.52, 0.62]} color="#7b8e84" />
      ))}
      <Box at={[8.38, 0.91, 0.16]} size={[1.02, 1.82, 0.17]} color="#354b4b" />
      <Box at={[8.67, 0.86, 0.27]} size={[0.14, 0.045, 0.035]} color="#ccd6c9" />
      {OFFICE_DESKS.map(([x, z, rotation]) => {
        const seatX = x + Math.sin(rotation) * 0.76;
        const seatZ = z + Math.cos(rotation) * 0.76;
        const showSeat = !placedChairs.some(([cx, cz]) => Math.hypot(seatX - cx, seatZ - cz) < 0.9);
        return <Desk key={z} x={x} z={z} rotation={rotation} showSeat={showSeat} />;
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

export function OfficeScene({ track, area, paused, resetKey, layout, suggestions, showRegion = true }: {
  track: CameraTrack | null; area: Area | null; paused: boolean; resetKey: number;
  layout?: OfficeLayout; suggestions?: OfficeChair[]; showRegion?: boolean;
}) {
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
    return live ? [center[0] + size, size * 1.6, center[2] + size * 1.2] : CAMERA_POSITION;
  }, [left, right, front, back, live, center]);
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
  const resetControls = useCallback((controller: ComponentRef<typeof OrbitControls> | null) => {
    if (!controller) return;
    controller.object.position.set(...position);
    controller.target.set(...center);
    controller.update();
  }, [center, position]);
  return (
    <Canvas
      aria-label="ผังออฟฟิศสามมิติ"
      camera={{ position, fov: 38, near: 0.1, far: 220 }}
      dpr={[1, 1.6]}
      shadows
      fallback={<p className="canvas-fallback">เครื่องนี้เปิดผัง 3D ไม่ได้ ลองเปิดด้วยเบราว์เซอร์ที่รองรับ WebGL</p>}
    >
      <color attach="background" args={['#191c2b']} />
      <fog attach="fog" args={['#191c2b', 35, 67]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={['#e4f0dc', '#486160', 1.05]} />
      <directionalLight position={[-8, 16, 11]} intensity={2.15} color="#fff1d9" castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-16} shadow-camera-right={16}
        shadow-camera-top={17} shadow-camera-bottom={-14} shadow-bias={-0.00035} />
      <mesh position={[CENTER[0], -0.48, CENTER[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#23263a" roughness={1} />
      </mesh>
      {live
        ? <Box at={[center[0], -0.16, center[2]]} size={[right - left + 1, 0.3, back - front + 1]} color="#505969" />
        : <Office placedChairs={placedChairs.map(({ position }) => position)} />}
      {shape && (
        <mesh position={[0, 0.019, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color="#7762a6" roughness={0.89} />
        </mesh>
      )}
      {suggestions?.map(({ id, point }) => {
        const floor = project(point);
        return floor ? <Chair key={id} x={floor[0]} z={floor[1]} color="#dab577" /> : null;
      })}
      {placedChairs.map(({ id, position: [x, z] }) => <Chair key={id} x={x} z={z} color="#b8a0ff" />)}
      {track && <TrackedPerson track={track} paused={paused} region={selectedRegion} />}
      <OrbitControls
        ref={resetControls}
        key={resetKey}
        target={center}
        enablePan={false}
        minDistance={10}
        maxDistance={39}
        maxPolarAngle={Math.PI / 2.24}
      />
    </Canvas>
  );
}
