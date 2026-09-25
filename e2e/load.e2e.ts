import { test, expect, snapshot } from './helpers';

test('sample house loads with 2 levels, 11 rooms, 2 radios, 4 agents', async ({ app: page }) => {
  const s = await snapshot(page);

  // Check levels
  expect(s.doc.levels).toHaveLength(2);
  expect(s.doc.levels[0]!.name).toBe('ชั้น 1');
  expect(s.doc.levels[1]!.name).toBe('ชั้น 2');

  // Check rooms (ground floor: 6 rooms; upper floor: 5 rooms = 11 total)
  expect(s.doc.rooms).toHaveLength(11);

  // Check radios: 2 APs (one on each level)
  expect(s.doc.radios).toHaveLength(2);
  expect(s.doc.radios[0]!.role).toBe('ap');
  expect(s.doc.radios[1]!.role).toBe('ap');

  // Check agents (3 people + 1 pet, the "เช้าวันธรรมดา" scenario)
  expect(s.doc.agents).toHaveLength(4);

  // Check initial state
  expect(s.activeLevelId).toBe(s.doc.levels[0]!.id);
  expect(s.viewMode).toBe('plan');
  expect(s.tool).toBe('select');

  // Bands on AP
  const ap = s.doc.radios[0]!;
  expect(ap.ifaces).toHaveLength(2);
  const band24 = ap.ifaces.find((f) => f.band === '2.4');
  const band5 = ap.ifaces.find((f) => f.band === '5');
  expect(band24!.band).toBe('2.4');
  expect(band5!.band).toBe('5');
});
