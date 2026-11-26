import { CAMERA_STEP_MS, type CameraReplay } from './feed';
import type { FloorPlanGeometry, PlanObject } from './floor-plan';
import { createSceneTracker, type SceneObservation } from './generated-scene';
import { OFFICE_LENGTH, OFFICE_WIDTH } from './office';
import { simulateDemoFrames } from './room-monitor';
import type { CameraPersonDetection } from './tracking';

type Tone = { floor: string; wall: string; base: string; furniture: string; glazing?: boolean; display?: boolean; timber?: boolean; stocked?: boolean };
type Point = readonly [number, number];
type DemoSeat = NonNullable<SceneObservation['seat']> & { image: Point; position: Point };

export interface DemoArea {
  id: 'office' | 'meeting' | 'hall' | 'studio' | 'briefing' | 'lift' | 'storage' | 'back-hall' | 'it' | 'exit';
  name: string;
  origin: Point;
  rotation: number;
  tone: Tone;
  plan: FloorPlanGeometry;
  seats?: readonly DemoSeat[];
  credit?: { author: string; url: string };
}

function rectangle(width: number, depth: number, objects: PlanObject[] = []): FloorPlanGeometry {
  return {
    version: 1,
    bounds: [0, 0, width, depth],
    visibleFloor: [[0, 0], [width, 0], [width, depth], [0, depth]],
    walls: [
      { from: [0, depth], to: [0, 0], inferred: false },
      { from: [0, 0], to: [width, 0], inferred: false },
    ],
    objects,
  };
}

function furniture(kind: PlanObject['kind'], x: number, z: number, width: number, length: number, height: number, rotation = 0): PlanObject {
  return { kind, center: [x, z], width, length, height, rotation };
}

const warm: Tone = { floor: '#817567', wall: '#c0aa8d', base: '#857a71', furniture: '#a37c61' };
const cool: Tone = { floor: '#697882', wall: '#adbac1', base: '#79848e', furniture: '#9d826b' };

const hallwayCredit = { author: 'Charlotte May', url: 'https://www.pexels.com/video/hallway-in-a-building-5823867/' };
const boardroomCredit = { author: 'Gustavo Fring', url: 'https://www.pexels.com/video/two-men-in-a-meeting-6285663/' };
const boardroomSeats: readonly DemoSeat[] = [
  { side: 'left', image: [0.64, 0.28], position: [6.0, 4.85], rotation: Math.PI },
  { side: 'right', image: [0.80, 0.24], position: [8.67, 6.45], rotation: Math.PI / 2 },
];
const sideRoomSeats: readonly DemoSeat[] = [
  { side: 'left', image: [0.18, 0.12], position: [3.14, 4.5], rotation: -Math.PI / 2 },
  { side: 'right', image: [0.86, 0.16], position: [7.86, 4.5], rotation: Math.PI / 2 },
];

function meetingChairs(seats: readonly DemoSeat[]) {
  return seats.map(({ position: [x, z], rotation }) => furniture('chair', x, z, 0.66, 0.7, 1.04, rotation));
}

const briefingCredit = { author: 'Gustavo Fring', url: 'https://www.pexels.com/video/three-men-in-meeting-6285673/' };
const hallTone: Tone = { floor: '#99866d', wall: '#ad886b', base: '#81756a', furniture: '#7d573e', timber: true };

function corridor(id: DemoArea['id'], name: string, origin: Point, w: number, depth: number): DemoArea {
  const points = [0.22, 0.5, 0.78];
  return { id, name, origin, rotation: 0, tone: hallTone, credit: hallwayCredit,
    plan: rectangle(w, depth, points.map(k => furniture('unknown', k * w, 0.34, 1.65, 0.33, 2.3))) };
}

export const DEMO_SITE_WIDTH = 46;
export const DEMO_SITE_DEPTH = 41;
export const SITE_MEDIA_PATH = '/indoor-twin/site-media';

export const DEMO_AREAS: readonly DemoArea[] = [
  {
    id: 'office', name: 'ออฟฟิศ', origin: [1, 1.1], rotation: 0,
    tone: { floor: '#65717d', wall: '#c9bfaf', base: '#a59986', furniture: '#bc9470' },
    plan: rectangle(OFFICE_WIDTH, OFFICE_LENGTH),
  },
  {
    id: 'meeting', name: 'ห้องประชุม', origin: [13, 1.1], rotation: 0,
    tone: { floor: '#a19d94', wall: '#c1bdb1', base: '#ada397', furniture: '#353a3b', glazing: true, display: true },
    plan: rectangle(13, 11.7, [
      furniture('desk', 6.0, 6.35, 4.2, 1.95, 0.78),
      ...meetingChairs(boardroomSeats),
    ]),
    credit: boardroomCredit, seats: boardroomSeats,
  },
  {
    id: 'hall', name: 'โถงทางเดิน', origin: [44, 14.0], rotation: -Math.PI / 2,
    tone: hallTone,
    plan: rectangle(5.05, 27, [
      ...[5, 14, 22].map(z => furniture('unknown', 0.24, z, 0.22, 1.45, 2.55)),
      furniture('shelf', 3.6, 25.5, 1.8, 0.55, 1.26),
    ]),
    credit: { author: 'Charlotte May', url: 'https://www.pexels.com/video/hallway-in-a-building-5823867/' },
  },
  { id:'studio', name:'ห้องทำงาน', origin:[32,20.2], rotation:0, tone:{...cool,glazing:true},
    plan:rectangle(13,11.7, [
      ...[3,6.5,10].flatMap(x => [furniture('desk',x,4,2.65,1.2,0.82), furniture('chair',x,5,0.72,0.7,1)]),
      furniture('shelf',9,1,5.3,0.8,1.6),
    ]),
    credit:{author:'Mikhail Nilov', url:'https://www.pexels.com/video/coworkers-working-in-the-office-6930660/'},
  },
  { id:'briefing', name:'ห้องบรีฟ', origin:[26.4,1.1], rotation:0,
    tone:{...warm, floor:'#a19d94', wall:'#c1bdb1', furniture:'#353a3b', glazing:true, display:true},
    plan:rectangle(13,11.7, [
      furniture('desk',6.0,6.35,4.2,1.95,0.78),
      ...meetingChairs(boardroomSeats),
    ]), credit:boardroomCredit, seats:boardroomSeats,
  },
  { id:'storage', name:'ห้องเก็บของ', origin:[1,20.2], rotation:0,
    tone:{ floor:'#85837e', wall:'#b8b3a3', base:'#918b80', furniture:'#bb8b56', stocked:true },
    plan:rectangle(12,9, [
      ...[1.8,10.3].flatMap(x => [
        furniture('shelf',x,4.4,6.5,1.25,2.7,Math.PI / 2),
        ...[2,4.1,6.7].map(z => furniture('unknown',x,z,1.15,1.12,1.12)),
      ]),
    ]),
    credit:{author:'Gustavo Fring',url:'https://www.pexels.com/video/warehouse-worker-placing-boxes-in-shelves-5100052/'},
  },
  { id:'it', name:'ห้องประชุมย่อย', origin:[13.4,20.2], rotation:0, tone:{...cool,display:true},
    plan:rectangle(11,9, [
      furniture('desk',5.5,4.5,3.55,2.08,0.77),
      ...meetingChairs(sideRoomSeats),
    ]), credit:briefingCredit, seats:sideRoomSeats,
  },
  corridor('lift','โถงเชื่อม',[1,29.8],10,9),
  corridor('back-hall','ทางเดินปีกอาคาร',[11.4,29.8],13,9),
  corridor('exit','ทางเดินท้ายอาคาร',[32,32.2],13,6.6),
];

export function demoLink(plan: FloorPlanGeometry): { router: Point; receiver: Point } {
  const [x, z, right, back] = plan.bounds;
  const width = right - x;
  const depth = back - z;
  return { router: [x + width * 0.21, z + depth * 0.15], receiver: [x + width * 0.79, z + depth * 0.83] };
}

export function moveAvatar(x: number, z: number, targetX: number, targetZ: number, seconds: number): Point {
  const dx = targetX - x;
  const dz = targetZ - z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.085) return [x, z];
  const dt = Math.min(seconds, 0.05);
  const fraction = Math.min(1 - Math.exp(-8 * dt), 4 * dt / distance);
  return [x + dx * fraction, z + dz * fraction];
}

export function demoArea(id: string | null) {
  return DEMO_AREAS.find(area => area.id === id);
}

function placeDemoSeats(frame: SceneObservation[], seats: readonly DemoSeat[]) {
  const seated = new Map<number, DemoSeat>();
  for (const seat of seats) {
    const [x, y] = seat.image;
    let distance = 0.12;
    let closest: number | undefined;
    for (const { id, box } of frame) {
      if (seated.has(id)) continue;
      const candidate = Math.hypot(box.x + box.width / 2 - x, box.y - y);
      if (candidate < distance) {
        distance = candidate;
        closest = id;
      }
    }
    if (closest !== undefined) seated.set(closest, seat);
  }
  return frame.map(observation => {
    const match = seated.get(observation.id);
    return match ? { ...observation, position: match.position, seat: { side: match.side, rotation: match.rotation } } : observation;
  });
}

export function createAreaReplay(detections: CameraPersonDetection[][], area: DemoArea): CameraReplay {
  const tracked = detections.map(createSceneTracker(() => null, true));
  const grounded = simulateDemoFrames(tracked, area.plan, false);
  const { seats } = area;
  return {
    version: 1,
    stepMs: CAMERA_STEP_MS,
    frames: detections.map(() => null),
    sceneFrames: seats ? grounded.map(frame => placeDemoSeats(frame, seats)) : grounded,
  };
}
