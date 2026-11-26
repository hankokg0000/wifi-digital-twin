import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { streetPosition, type StreetRoute } from '../../core/camera/site-city';
import { CityBlocks, type CityBlock } from './CityBlocks';

const roads: CityBlock[] = [
  { center: [23, -0.55, 20], size: [260, 0.6, 217], color: '#374557' },
  { center: [23, -0.14, 54], size: [229, 0.18, 14], color: '#293343' },
  { center: [23, -0.14, -17], size: [227, 0.18, 9], color: '#293343' },
  ...[-16, 63].map((x): CityBlock => ({ center: [x, -0.13, 20], size: [10, 0.18, 170], color: '#293343' })),
  { center: [23, -0.07, 20], size: [55, 0.20, 52], color: '#68727a' },
  { center: [23, 0.06, 45.2], size: [55, 0.20, 3.8], color: '#828d8e' },
  ...[46.4, 61.5].map((z): CityBlock => ({ center: [23, 0.03, z], size: [218, 0.22, 1.65], color: '#65747c' })),
  ...[-22.1, -9.9, 56.8, 69.2].map((x): CityBlock => ({ center: [x, 0.02, 19], size: [1.5, 0.17, 159], color: '#63727b' })),
  { center: [49.9, 0.1, 31], size: [4.5, 0.26, 19], color: '#657b70' },
  { center: [32.5, 0.10, -3.5], size: [23, 0.21, 3.6], color: '#687d76' },
  { center: [-43, -0.13, 37], size: [25, 0.33, 19], color: '#546c65' },
  { center: [85, -0.1, 30], size: [24, 0.34, 22], color: '#526b63' },
];

const paintedRoads: CityBlock[] = [
  ...Array.from({ length: 33 }, (_, i): CityBlock => ({
    center: [-79 + 6.3 * i, -0.034, 54], size: [2.7, 0.07, 0.17], color: '#b79c64',
  })),
  ...Array.from({ length: 10 }, (_, i): CityBlock => ({
    center: [53.3, -0.026, 48 + i * 1.22], size: [3.8, 0.06, 0.52], color: '#a6b7bb',
  })),
  ...Array.from({ length: 8 }, (_, i): CityBlock => ({
    center: [58.8 + i * 1.17, -0.025, 46.1], size: [0.52, 0.065, 2.5], color: '#a6b7bb',
  })),
  ...Array.from({ length: 9 }, (_, i): CityBlock => ({
    center: [-17.6 + i * 1.17, -0.025, 47.4], size: [0.49, 0.065, 2.0], color: '#a6b7bb',
  })),
];

const skyline: readonly [number, number, number, number, number][] = [
  [-70, -46, 23, 23, 32], [-44, -46, 20, 24, 49], [-42, -17, 22, 20, 25],
  [-66, 11, 28, 26, 34], [-35, 12, 18, 21, 18], [-54, 36, 16, 15, 11],
  [1, -42, 15, 25, 26], [22, -44, 21, 24, 49], [45, -43, 17, 18, 35],
  [86, -38, 28, 24, 52], [104, -9, 22, 22, 29], [85, 2, 19, 20, 39],
  [112, 28, 27, 19, 23], [83, 45, 20, 9, 12], [-63, 77, 27, 22, 9],
  [-31, 78, 22, 17, 11], [11, 87, 26, 22, 7], [40, 91, 18, 14, 10],
  [79, 79, 18, 20, 12], [106, 79, 25, 15, 15],
];

const neighborhoods = skyline.flatMap(([x, z, width, depth, height], index): CityBlock[] => [
  { center: [x, height / 2, z], size: [width, height, depth], color: ['#4e6172', '#596877', '#586171'][index % 3]! },
  { center: [x, height, z], size: [width + 0.45, 0.35, depth + 0.45], color: '#6e7f8b' },
  ...[0.30, 0.58, 0.81].map((fraction): CityBlock => ({
    center: [x, height * fraction, z + depth / 2 + 0.04], size: [width * 0.86, height * 0.088, 0.12], color: '#537286',
  })),
  { center: [x, height + 0.65, z], size: [width * 0.54, 1.3, depth * 0.50], color: '#596876' },
]);

const streetFurniture: CityBlock[] = [
  { center: [52, 0.12, 43], size: [5.4, 0.24, 4.2], color: '#8d9ca5' },
  { center: [52, 1.95, 42.9], size: [5.7, 0.23, 3], color: '#6e8ca8' },
  ...[49.7, 54.3].map((x): CityBlock => ({ center: [x, 0.97, 42.9], size: [0.15, 1.9, 2.66], color: '#9db2bb' })),
  ...[-3, 10, 24, 38, 58].flatMap((x): CityBlock[] => [
    { center: [x, 1.45, 46.4], size: [0.13, 2.9, 0.13], color: '#8a9aa1' },
    { center: [x, 2.9, 46.8], size: [0.23, 0.13, 0.83], color: '#aeb9b7' },
  ]),
];

const plots = [
  [-44, 39], [-39, 33], [-48, 32], [-55, 42], [75, 31], [80, 24], [83, 35], [91, 30],
  [-5, 36], [-5, 28], [-5, 13], [50, 34], [50, 27], [50, 13], [50, 7],
  [6, 44], [13, 44], [36, 44], [43, 44], [1, -6], [11, -6], [29, -6], [40, -6],
] as const;

const trees = plots.flatMap(([x, z], i): CityBlock[] => {
  const height = 2.7 + (i % 4) * 0.3;
  const color = ['#527768', '#658174', '#608577'][i % 3]!;
  return [
    { center: [x, 0.66, z], size: [0.23, 1.32, 0.24], color: '#767064' },
    { center: [x, height / 2 + 0.70, z], size: [1.52, height * 0.64, 1.44], color },
    { center: [x + 0.49, height * 0.55 + 0.75, z - 0.17], size: [1.02, height * 0.43, 0.97], color },
  ];
});

type CityJourney = { route: StreetRoute; phase: number; color: string; kind: 'car' | 'person' };
const east: StreetRoute = { from: [-91, 51.5], to: [136, 51.5], duration: 22 };
const west: StreetRoute = { from: [136, 57.9], to: [-91, 57.9], duration: 25 };
const south: StreetRoute = { from: [61, -67], to: [61, 108], duration: 23 };
const walkway: StreetRoute = { from: [-4, 45], to: [50.2, 45], duration: 33 };
const journeys: CityJourney[] = [
  ...[0.06, 0.23, 0.43, 0.71, 0.89].map((phase, i): CityJourney => ({
    route: east, phase, color: ['#f0ba77', '#7faebd', '#abb9b9', '#b98380', '#738ba4'][i]!, kind: 'car',
  })),
  ...[0.03, 0.31, 0.51, 0.75].map((phase, i): CityJourney => ({
    route: west, phase, color: ['#789fad', '#a8a9b4', '#cf8b77', '#b8ab80'][i]!, kind: 'car',
  })),
  { route: south, phase: 0.13, color: '#b0a3ae', kind: 'car' },
  { route: south, phase: 0.53, color: '#8ab8bb', kind: 'car' },
  { route: walkway, phase: 0.17, color: '#e0bc93', kind: 'person' },
  { route: walkway, phase: 0.68, color: '#aeb5df', kind: 'person' },
  { route: { from: [50.2, 45.9], to: [-4, 45.9], duration: 29 }, phase: 0.12, color: '#8ca4b4', kind: 'person' },
  { route: { from: [54, 45.2], to: [54, 63.3], duration: 15 }, phase: 0.3, color: '#c7b9a9', kind: 'person' },
];

function StreetActor({ journey, reducedMotion }: { journey: CityJourney; reducedMotion: boolean }) {
  const ref = useRef<Group>(null);
  const { route, phase, color, kind } = journey;
  const car = kind === 'car';
  const [x, z] = streetPosition(route, 0, phase);
  const direction = Math.atan2(route.to[0] - route.from[0], route.to[1] - route.from[1]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const time = reducedMotion ? 0 : clock.elapsedTime;
    const [nextX, nextZ] = streetPosition(route, time, phase);
    ref.current.position.set(nextX, car || reducedMotion ? 0 : 0.04 * Math.sin(time * 11), nextZ);
  });
  return (
    <group ref={ref} position={[x, 0, z]} rotation-y={direction}>
      {car ? <>
        <mesh position={[0, 0.42, 0]}><boxGeometry args={[1.65, 0.58, 3.3]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, 0.83, -0.24]}><boxGeometry args={[1.42, 0.34, 1.78]} /><meshStandardMaterial color="#455866" /></mesh>
      </> : <>
        <mesh position={[0, 0.68, 0]}><boxGeometry args={[0.34, 0.92, 0.32]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, 1.29, 0]}><sphereGeometry args={[0.17, 6, 5]} /><meshStandardMaterial color="#c4a78d" /></mesh>
      </>}
    </group>
  );
}

export function BangkokCity({ reducedMotion, muted }: { reducedMotion: boolean; muted: boolean }) {
  return <>
    <CityBlocks blocks={roads} muted={muted} receiveShadow />
    <CityBlocks blocks={paintedRoads} muted={muted} />
    <CityBlocks blocks={neighborhoods} muted={muted} />
    <CityBlocks blocks={trees} muted={muted} />
    <CityBlocks blocks={streetFurniture} muted={muted} />
    {journeys.map((journey, index) => <StreetActor key={index} journey={journey} reducedMotion={reducedMotion} />)}
  </>;
}
