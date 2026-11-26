export const OFFICE_FLOOR = 14;
export const TOWER_STOREYS = 34;
export const STOREY_HEIGHT = 3.25;
export const OFFICE_FLOOR_Y = (OFFICE_FLOOR - 1) * STOREY_HEIGHT;

export interface StreetRoute {
  from: readonly [number, number];
  to: readonly [number, number];
  duration: number;
}

export function streetPosition({ from, to, duration }: StreetRoute, elapsed: number, phase: number): [number, number] {
  const distance = (elapsed / duration + phase) % 1;
  return [from[0] + (to[0] - from[0]) * distance, from[1] + (to[1] - from[1]) * distance];
}
