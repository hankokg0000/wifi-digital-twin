import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { DEMO_SITE_DEPTH as DEPTH, DEMO_SITE_WIDTH as WIDTH } from '../../core/camera/site-demo';
import { OFFICE_FLOOR_Y, STOREY_HEIGHT, TOWER_STOREYS } from '../../core/camera/site-city';
import { CityBlocks, type CityBlock, type CityPoint } from './CityBlocks';

const PODIUM_Y = 3 * STOREY_HEIGHT;
const ROOF_Y = TOWER_STOREYS * STOREY_HEIGHT;
const CX = WIDTH / 2;
const CZ = DEPTH / 2;

function towerSection(bottom: number, top: number): CityBlock[] {
  const height = top - bottom;
  const middle = bottom + height / 2;
  const boxes: CityBlock[] = [
    { center: [CX, middle, CZ], size: [WIDTH, height, DEPTH], color: '#263e58' },
  ];
  for (const side of [-1, 1]) {
    const z = CZ + side * (CZ + 0.03);
    const x = CX + side * (CX + 0.03);
    boxes.push(
      { center: [CX, middle, z], size: [WIDTH, height - 0.1, 0.12], color: '#416a87' },
      { center: [x, middle, CZ], size: [0.12, height - 0.1, DEPTH], color: '#4e7e9b' },
    );
    for (let i = 1; i < 19; i++) {
      boxes.push({
        center: [WIDTH * i / 19, middle, z + side * 0.11],
        size: [i % 3 === 0 ? 0.36 : 0.13, height, 0.17], color: ['#41627d', '#7393ab', '#a6bac8'][i % 3]!,
      });
    }
    for (let i = 1; i < 17; i++) {
      boxes.push({
        center: [x + side * 0.11, middle, DEPTH * i / 17],
        size: [0.17, height, i % 3 === 0 ? 0.30 : 0.13], color: i % 3 === 0 ? '#9eb4c7' : '#668aa3',
      });
    }
    for (let y = bottom + STOREY_HEIGHT; y < top; y += STOREY_HEIGHT) {
      boxes.push(
        { center: [CX, y, z + side * 0.1], size: [WIDTH, 0.19, 0.18], color: '#273e56' },
        { center: [x + side * 0.1, y, CZ], size: [0.18, 0.19, DEPTH], color: '#374f66' },
      );
    }
  }
  [0, WIDTH].forEach(x => [0, DEPTH].forEach(z => boxes.push({
    center: [x, middle, z], size: [0.24, height, 0.25], color: '#adc1d2',
  })));
  return boxes;
}

const podium: CityBlock[] = [
  { center: [CX, PODIUM_Y / 2, CZ], size: [WIDTH + 3.4, PODIUM_Y, DEPTH + 3.4], color: '#5f7484' },
  { center: [CX, PODIUM_Y - 0.13, CZ], size: [WIDTH + 4.4, 0.49, DEPTH + 4.4], color: '#9ba7ad' },
  { center: [CX, 3.3, DEPTH + 1.78], size: [WIDTH + 2.4, 5.25, 0.23], color: '#365b69' },
  { center: [WIDTH + 1.77, 3.3, CZ], size: [0.22, 5.25, DEPTH + 2.4], color: '#527583' },
  { center: [CX + 1.5, 4.55, DEPTH + 3], size: [13.8, 0.43, 4.5], color: '#dce1d8' },
  ...Array.from({ length: 8 }, (_, i): CityBlock => ({
    center: [2.5 + 5.8 * i, 3.15, DEPTH + 1.92], size: [0.23, 6, 0.23], color: '#9eb0b8',
  })),
];
const lower = towerSection(PODIUM_Y, OFFICE_FLOOR_Y);
const upper: CityBlock[] = [
  ...towerSection(OFFICE_FLOOR_Y, ROOF_Y),
  { center: [CX, ROOF_Y + 0.2, CZ], size: [WIDTH + 0.3, 0.50, DEPTH + 0.30], color: '#b2bdc7' },
  { center: [CX + 4, ROOF_Y + 1.25, CZ - 3], size: [21, 1.8, 16], color: '#536374' },
  { center: [CX - 13, ROOF_Y + 0.48, CZ + 4], size: [9, 0.19, 17], color: '#6b897e' },
  { center: [CX + 16, ROOF_Y + 0.48, CZ + 6], size: [8, 0.19, 14], color: '#6b897e' },
];
const bandY = OFFICE_FLOOR_Y + STOREY_HEIGHT * 0.5;
const floorOutline: CityPoint[] = [
  [-0.24, bandY, -0.24], [WIDTH + 0.24, bandY, -0.24], [WIDTH + 0.24, bandY, DEPTH + 0.24],
  [-0.24, bandY, DEPTH + 0.24], [-0.24, bandY, -0.24],
];

export function OfficeTower({ inside, highlighted, reducedMotion, onHover, onEnter }: {
  inside: boolean; highlighted: boolean; reducedMotion: boolean;
  onHover: (hovering: boolean) => void; onEnter: () => void;
}) {
  const cap = useRef<Group>(null);
  const initialCapY = useRef(inside ? 60 : 0);
  useFrame((_, dt) => {
    if (!cap.current) return;
    const target = inside ? 60 : 0;
    cap.current.position.y += (target - cap.current.position.y) * (reducedMotion ? 1 : 1 - Math.exp(-8 * dt));
    cap.current.visible = cap.current.position.y < 30;
  });
  const accent = highlighted ? '#e2d6ff' : '#ab9ae4';

  return <>
    <CityBlocks blocks={podium} castShadow />
    <CityBlocks blocks={lower} castShadow />
    <group ref={cap} position-y={initialCapY.current} visible={!inside}>
      <CityBlocks blocks={upper} castShadow />
    </group>
    {!inside && <>
      <Line points={floorOutline} color={accent} toneMapped={false} lineWidth={highlighted ? 3.8 : 2.25} />
      <mesh position={[CX, bandY, DEPTH + 0.22]}>
        <boxGeometry args={[WIDTH, 1.3, 0.13]} />
        <meshBasicMaterial color={accent} transparent opacity={highlighted ? 0.69 : 0.34} depthWrite={false} />
      </mesh>
      <mesh position={[WIDTH + 0.22, bandY, CZ]}>
        <boxGeometry args={[0.13, 1.3, DEPTH]} />
        <meshBasicMaterial color={accent} transparent opacity={highlighted ? 0.69 : 0.34} depthWrite={false} />
      </mesh>
      <mesh position={[CX, ROOF_Y / 2, CZ]}
        onPointerOver={event => { event.stopPropagation(); onHover(true); }}
        onPointerOut={() => onHover(false)}
        onClick={event => { if (event.delta < 5) { event.stopPropagation(); onEnter(); } }}>
        <boxGeometry args={[WIDTH + 0.55, ROOF_Y + 0.6, DEPTH + 0.55]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
    </>}
  </>;
}
