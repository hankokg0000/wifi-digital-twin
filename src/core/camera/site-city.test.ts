import { expect, it } from 'vitest';
import { OFFICE_FLOOR, OFFICE_FLOOR_Y, STOREY_HEIGHT, streetPosition, TOWER_STOREYS } from './site-city';

it('places the floor slice at the bottom of level 14 inside the tower', () => {
  expect(OFFICE_FLOOR).toBe(14);
  expect(OFFICE_FLOOR_Y).toBe(42.25);
  expect(TOWER_STOREYS * STOREY_HEIGHT).toBe(110.5);
});

it('moves a street actor along both axes and loops at the route boundary', () => {
  const route = { from: [12, 28], to: [-12, 40], duration: 16 } as const;
  expect(streetPosition(route, 0, 0.25)).toEqual([6, 31]);
  expect(streetPosition(route, 8, 0.25)).toEqual([-6, 37]);
  expect(streetPosition(route, 12, 0.25)).toEqual([12, 28]);
});
