import { Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Archive, ArrowUpRight, Building2, DoorOpen, Footprints, Monitor, Presentation, UsersRound, Wifi } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Vector3 } from 'three';
import { OFFICE_FLOOR, OFFICE_FLOOR_Y } from '../../core/camera/site-city';
import { DEMO_AREAS, DEMO_SITE_DEPTH, DEMO_SITE_WIDTH, demoArea, type DemoArea } from '../../core/camera/site-demo';
import { PlanStage } from '../camera/GeneratedSceneView';
import { OfficeModel } from '../camera/OfficeScene';
import { SceneBoundary } from '../camera/SceneBoundary';
import { WifiPlacement } from '../camera/WifiPlacement';
import { BrandMark } from '../shell/BrandMark';
import { IndoorArea } from './IndoorTwin';
import { useIndoorWifi } from './IndoorWifi';
import { BangkokCity } from './BangkokCity';
import { CityBlocks, type CityBlock } from './CityBlocks';
import { OfficeTower } from './OfficeTower';

type Triple = [number, number, number];
const CENTER: Triple = [DEMO_SITE_WIDTH / 2, OFFICE_FLOOR_Y + 0.45, DEMO_SITE_DEPTH / 2];
const CITY_TARGET: Triple = [CENTER[0], 46, CENTER[2]];
const CITY_OFFSET: Triple = [105, 101, 152];
const FLOOR_OFFSET: Triple = [22, 48, 53];
const ZOOM_MS = 880;
const PICK_COLOR = '#c8b9ff';

const areaIcons = {
  office: Building2, meeting: UsersRound, hall: Footprints, studio: Monitor, briefing: Presentation,
  lift: DoorOpen, storage: Archive, 'back-hall': Footprints, it: UsersRound, exit: DoorOpen,
} satisfies Record<DemoArea['id'], typeof Building2>;

function areaCenter(area: DemoArea): Triple {
  const [, , width, depth] = area.plan.bounds;
  const c = Math.cos(area.rotation);
  const s = Math.sin(area.rotation);
  return [area.origin[0] + (width * c + depth * s) / 2, CENTER[1], area.origin[1] + (-width * s + depth * c) / 2];
}

function SiteOrbit({ goal, from, inside, reducedMotion }: {
  goal: DemoArea | null; from: DemoArea | null; inside: boolean; reducedMotion: boolean;
}) {
  const camera = useThree(state => state.camera);
  const aspect = useThree(state => state.size.width / Math.max(1, state.size.height));
  const floorFit = Math.max(1, Math.min(2.6, 1.22 / Math.max(0.1, aspect)));
  const cityFit = Math.max(1.1, Math.min(1.85, 0.90 / Math.max(0.1, aspect)));
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const elapsed = useRef(ZOOM_MS);
  const ready = useRef(false);
  const target = useRef(new Vector3());
  const position = useRef(new Vector3());
  const startTarget = useRef(new Vector3());
  const startPosition = useRef(new Vector3());

  useEffect(() => {
    const controller = controls.current;
    if (!controller) return;
    function frameArea(area: DemoArea | null) {
      target.current.set(...(area ? areaCenter(area) : inside ? CENTER : CITY_TARGET));
      position.current.set(...(inside ? FLOOR_OFFSET : CITY_OFFSET))
        .multiplyScalar(inside ? floorFit * (area ? 0.24 : 1) : cityFit).add(target.current);
    }
    if (!ready.current) {
      frameArea(from);
      controller.target.copy(target.current);
      camera.position.copy(position.current);
      controller.update();
      ready.current = true;
      if (!from) return;
    }
    startTarget.current.copy(controller.target);
    startPosition.current.copy(camera.position);
    frameArea(goal);
    elapsed.current = reducedMotion ? ZOOM_MS : 0;
    if (reducedMotion) {
      controller.target.copy(target.current);
      camera.position.copy(position.current);
      controller.update();
    }
  }, [camera, inside, from, goal, floorFit, cityFit, reducedMotion]);

  useFrame((_, delta) => {
    const controller = controls.current;
    if (!controller || elapsed.current >= ZOOM_MS) return;
    elapsed.current = Math.min(ZOOM_MS, elapsed.current + delta * 1000);
    const t = elapsed.current / ZOOM_MS;
    const weight = t * t * (3 - 2 * t);
    controller.target.lerpVectors(startTarget.current, target.current, weight);
    camera.position.lerpVectors(startPosition.current, position.current, weight);
    camera.position.y += Math.sin(t * Math.PI) * 3.4;
    controller.update();
  });

  return <OrbitControls ref={controls} enabled={!goal} enablePan={false}
    minDistance={inside ? 13 : 85} maxDistance={inside ? 340 : 480}
    minPolarAngle={0.24} maxPolarAngle={inside ? Math.PI / 2.35 : Math.PI / 2.12} />;
}

const floorStructure: CityBlock[] = [
  { center: [CENTER[0], -0.26, CENTER[2]], size: [DEMO_SITE_WIDTH, 0.4, DEMO_SITE_DEPTH], color: '#9da8b3' },
  { center: [CENTER[0], 0.38, 0.12], size: [DEMO_SITE_WIDTH, 0.82, 0.20], color: '#6a879e' },
  { center: [CENTER[0], 0.38, DEMO_SITE_DEPTH - 0.12], size: [DEMO_SITE_WIDTH, 0.82, 0.20], color: '#6a879e' },
  { center: [0.12, 0.38, CENTER[2]], size: [0.20, 0.82, DEMO_SITE_DEPTH], color: '#6a879e' },
  { center: [DEMO_SITE_WIDTH - 0.12, 0.38, CENTER[2]], size: [0.20, 0.82, DEMO_SITE_DEPTH], color: '#6a879e' },
  { center: [CENTER[0], -0.075, 16.53], size: [44, 0.13, 6.45], color: '#aeaa9d' },
  { center: [28.0, -0.09, 30.4], size: [7.0, 0.15, 20.7], color: '#a6a49a' },
  { center: [28.1, 0.9, 26.55], size: [5.85, 1.85, 9.3], color: '#566778' },
  { center: [28.1, 1.86, 26.55], size: [5.88, 0.16, 9.35], color: '#73879a' },
  ...[26.1, 27.42, 28.74, 30.06].map((x): CityBlock => ({
    center: [x, 0.8, 21.88], size: [0.92, 1.59, 0.15], color: '#b0bdc8',
  })),
];

function ProjectSiteLabels({ labels, entrance, street, transit }: {
  labels: Map<DemoArea['id'], HTMLButtonElement>;
  entrance: RefObject<HTMLDivElement | null>;
  street: RefObject<HTMLDivElement | null>;
  transit: RefObject<HTMLDivElement | null>;
}) {
  const point = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    const project = (label: HTMLElement, x: number, y: number, z: number) => {
      const p = point.current.set(x, y, z).project(camera);
      label.style.visibility = Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1 ? 'visible' : 'hidden';
      label.style.transform = `translate3d(${(p.x + 1) * size.width / 2}px, ${(1 - p.y) * size.height / 2}px, 0) translate(-50%, -50%)`;
    };
    if (entrance.current) project(entrance.current, 25, OFFICE_FLOOR_Y + 2.0, DEMO_SITE_DEPTH + 0.25);
    if (street.current) project(street.current, 16, 0.9, 64);
    if (transit.current) project(transit.current, 52, 3.15, 43);
    for (const area of DEMO_AREAS) {
      const label = labels.get(area.id);
      if (!label) continue;
      const [x, , z] = areaCenter(area);
      project(label, x, OFFICE_FLOOR_Y + 3.15, z);
    }
  });
  return null;
}

function AreaHighlight({ width, depth }: { width: number; depth: number }) {
  const border: Triple[] = [[0, 0.15, 0], [width, 0.15, 0], [width, 0.15, depth], [0, 0.15, depth], [0, 0.15, 0]];
  return <>
    <mesh position={[width / 2, 0.08, depth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial color={PICK_COLOR} transparent opacity={0.28} depthWrite={false} />
    </mesh>
    <Line points={border} color={PICK_COLOR} toneMapped={false} lineWidth={2.7} depthTest={false} renderOrder={6} />
  </>;
}

function SiteOverview({ focus, from, inside, setInside, open, observedRoom }: {
  focus: DemoArea | null; from: DemoArea | null; inside: boolean; setInside: (inside: boolean) => void;
  open: (area: DemoArea) => void; observedRoom?: string;
}) {
  const [hovered, setHovered] = useState<DemoArea['id']>();
  const [focused, setFocused] = useState<DemoArea['id']>();
  const [buildingHovered, setBuildingHovered] = useState(false);
  const [entranceFocused, setEntranceFocused] = useState(false);
  const labels = useRef(new Map<DemoArea['id'], HTMLButtonElement>());
  const entrance = useRef<HTMLDivElement>(null);
  const street = useRef<HTMLDivElement>(null);
  const transit = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const activeRoom = focus?.id ?? hovered ?? focused;
  const buildingActive = !inside && (buildingHovered || entranceFocused);

  function changeView(nextInside: boolean) {
    setHovered(undefined);
    setFocused(undefined);
    setBuildingHovered(false);
    setEntranceFocused(false);
    setInside(nextInside);
  }

  function leaveRoom(id: DemoArea['id']) {
    setHovered(value => value === id ? undefined : value);
  }

  return (
    <div className="indoor-shell">
      <header className="indoor-header">
        <div className="indoor-brand"><BrandMark /><strong>Indoor Twin</strong><a href="/">WiFi Digital Twin</a></div>
        {inside && <div className="indoor-source">
          <button type="button" className="indoor-button" disabled={Boolean(focus)} onClick={() => changeView(false)}>ภายนอกอาคาร</button>
        </div>}
      </header>
      <main className="indoor-site" data-inside={inside}>
        <div className="indoor-site-title">
          <h1>{inside ? `ผังชั้น ${OFFICE_FLOOR}` : 'AIA Capital Center'}</h1>
          <p>{inside ? 'แปลนจำลองตามผังชั้นสำนักงาน · เลือกได้ 10 พื้นที่' : 'ฉากจำลองย่านพระราม 9 · กดตึกเพื่อเปิดผังชั้น 14'}</p>
          {!inside && <button type="button" className="indoor-button indoor-enter" data-active={buildingActive}
            onFocus={() => setEntranceFocused(true)} onBlur={() => setEntranceFocused(false)}
            onPointerEnter={() => setBuildingHovered(true)} onPointerLeave={() => setBuildingHovered(false)}
            onClick={() => changeView(true)}>เข้าชั้น {OFFICE_FLOOR} <ArrowUpRight size={17} aria-hidden="true" /></button>}
        </div>
        <div className="indoor-site-canvas" aria-label="ภาพรวมอาคารสามมิติ"
          data-pickable={buildingHovered || Boolean(hovered)}
          onPointerLeave={() => { setHovered(undefined); setBuildingHovered(false); }}>
          <SceneBoundary>
            <Canvas camera={{ position: [130, 140, 175], fov: 39, near: 0.2, far: 650 }}
              dpr={[1, 1.5]} shadows="percentage"
              fallback={<p className="canvas-fallback">เลือกพื้นที่จากเมนูด้านล่าง</p>}>
              <color attach="background" args={['#1a2535']} />
              <fog attach="fog" args={['#1a2535', 245, 620]} />
              <ambientLight intensity={0.55} />
              <hemisphereLight args={['#dbe9ff', '#555564', 1.1]} />
              <directionalLight position={[49, 170, 14]} intensity={2.1} color="#ffe2bb" castShadow
                shadow-mapSize={[2048, 2048]} shadow-camera-left={-105} shadow-camera-right={105}
                shadow-camera-top={95} shadow-camera-bottom={-95} shadow-camera-far={310} shadow-normalBias={0.025} shadow-radius={3} />
              <BangkokCity reducedMotion={reducedMotion} muted={inside} />
              <OfficeTower inside={inside} highlighted={buildingActive} reducedMotion={reducedMotion}
                onHover={setBuildingHovered} onEnter={() => changeView(true)} />
              {inside && <group position-y={OFFICE_FLOOR_Y}>
                <CityBlocks blocks={floorStructure} />
                {DEMO_AREAS.map(area => {
                  const [, , width, depth] = area.plan.bounds;
                  const isFocused = activeRoom === area.id;
                  return (
                    <group key={area.id} position={[area.origin[0], 0, area.origin[1]]} rotation={[0, area.rotation, 0]}>
                      <mesh position={[width / 2, 0.7, depth / 2]}
                        onClick={event => { event.stopPropagation(); if (event.delta < 5) open(area); }}
                        onPointerOver={event => { event.stopPropagation(); setHovered(area.id); }}
                        onPointerOut={() => leaveRoom(area.id)}>
                        <boxGeometry args={[width, 1.6, depth]} />
                        <meshBasicMaterial colorWrite={false} depthWrite={false} />
                      </mesh>
                      {area.id === 'office' ? <OfficeModel placedChairs={[]} presentation /> : (
                        <PlanStage plan={area.plan} tone={area.tone} lit={false} />
                      )}
                      <WifiPlacement plan={area.plan} active={observedRoom === area.id} observed={observedRoom === area.id} />
                      {observedRoom === area.id && <mesh position={[width/2,0.044,depth/2]} rotation={[-Math.PI/2,0,0]}>
                        <planeGeometry args={[width,depth]} /><meshBasicMaterial color="#69efd6" transparent opacity={0.43} depthWrite={false} />
                      </mesh>}
                      {isFocused && <AreaHighlight width={width} depth={depth} />}
                      {focus && !isFocused && <mesh position={[width / 2, 0.032, depth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[width, depth]} />
                        <meshBasicMaterial color="#1b2938" transparent opacity={0.34} depthWrite={false} />
                      </mesh>}
                    </group>
                  );
                })}
              </group>}
              <SiteOrbit goal={focus} from={from} inside={inside} reducedMotion={reducedMotion} />
              <ProjectSiteLabels labels={labels.current} entrance={entrance} street={street} transit={transit} />
            </Canvas>
          </SceneBoundary>
          {!inside && <>
            <div className="indoor-entrance-marker" ref={entrance} data-active={buildingActive} aria-hidden="true">
              ชั้น {OFFICE_FLOOR} <ArrowUpRight size={17} />
            </div>
            <div ref={street} className="indoor-city-label">ถนนรัชดาภิเษก</div>
            <div ref={transit} className="indoor-city-label indoor-city-transit">MRT ศูนย์วัฒนธรรมฯ</div>
          </>}
          {inside && <div className="indoor-site-pins">
            {DEMO_AREAS.map(area => (
              <button key={area.id} type="button" className="indoor-site-pin"
                aria-label={`เปิด${area.name}บนผัง`} disabled={Boolean(focus)} tabIndex={-1}
                data-active={activeRoom === area.id} data-observed={observedRoom === area.id}
                ref={button => {
                  if (button) labels.current.set(area.id, button);
                  else labels.current.delete(area.id);
                }}
                onPointerEnter={() => setHovered(area.id)} onPointerLeave={() => leaveRoom(area.id)}
                onClick={() => open(area)}><span>{area.name}</span><ArrowUpRight size={13} aria-hidden="true" /></button>
            ))}
          </div>}
        </div>
        {focus && <div className="indoor-flight" role="status">
          <span>กำลังเข้าพื้นที่</span>
          <strong>{focus.name}</strong>
        </div>}
        {inside && <nav className="indoor-room-picker" aria-labelledby="indoor-room-picker-title">
          <h2 id="indoor-room-picker-title">เลือกพื้นที่</h2>
          <div className="indoor-site-areas">
            {DEMO_AREAS.map(area => {
              const watching = area.id === observedRoom;
              const Icon = watching ? Wifi : areaIcons[area.id];
              return (
                <button key={area.id} type="button" className="indoor-site-area" onClick={() => open(area)}
                  disabled={Boolean(focus)} data-active={activeRoom === area.id} data-observed={watching}
                  onPointerEnter={() => setHovered(area.id)} onPointerLeave={() => leaveRoom(area.id)}
                  onFocus={() => setFocused(area.id)} onBlur={() => setFocused(undefined)}>
                  <span className="indoor-area-icon"><Icon size={17} aria-hidden="true" /></span>
                  <span className="indoor-area-name">{area.name}{watching && <small>พบการเคลื่อนไหว · ของจริง</small>}</span>
                  <ArrowUpRight className="indoor-area-arrow" size={15} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </nav>}
      </main>
    </div>
  );
}

const areaFromURL = () => demoArea(new URLSearchParams(location.search).get('area')) ?? null;

export function IndoorSite() {
  const [area, setArea] = useState(areaFromURL);
  const [inside, setInside] = useState(() => Boolean(areaFromURL()));
  const wifi = useIndoorWifi();
  const [flight, setFlight] = useState<DemoArea | null>(null);
  const [from, setFrom] = useState<DemoArea | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const pop = () => {
      clearTimeout(timer.current);
      timer.current = undefined;
      setFlight(null);
      setFrom(null);
      setArea(areaFromURL());
    };
    window.addEventListener('popstate', pop);
    return () => { clearTimeout(timer.current); window.removeEventListener('popstate', pop); };
  }, []);

  function navigate(next: DemoArea | null) {
    const url = new URL(location.href);
    url.searchParams.delete('source');
    if (next) url.searchParams.set('area', next.id);
    else url.searchParams.delete('area');
    history.pushState(null, '', url);
    setArea(next);
    window.scrollTo(0, 0);
  }

  function open(next: DemoArea) {
    if (timer.current !== undefined) return;
    if (reducedMotion()) {
      navigate(next);
      return;
    }
    setFlight(next);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setFlight(null);
      navigate(next);
    }, ZOOM_MS);
  }

  return area ? <IndoorArea key={area.id} area={area} wifi={wifi} onBack={() => {
    setInside(true);
    setFrom(reducedMotion() ? null : area);
    navigate(null);
  }} /> : <SiteOverview focus={flight} from={from} inside={inside} setInside={value => {
    setFrom(null);
    setInside(value);
  }} open={open} observedRoom={wifi.observedRoom} />;
}
