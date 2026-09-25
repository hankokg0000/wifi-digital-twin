import { test, expect, snapshot, clickWorld } from './helpers';

const FREE_X = 12;

test('door tool creates opening with correct defaults', async ({ app: page }) => {
  const before = await snapshot(page);

  // Draw a wall first
  await page.keyboard.press('w');
  await clickWorld(page, FREE_X, 1);
  await clickWorld(page, FREE_X, 4);
  await page.keyboard.press('Escape');

  let s = await snapshot(page);
  const wall = s.doc.walls[s.doc.walls.length - 1]!;

  // Click roughly in the middle of the wall to place a door
  const midZ = (wall.a[1] + wall.b[1]) / 2;

  // Place door
  await page.keyboard.press('d');
  await clickWorld(page, wall.a[0], midZ);

  s = await snapshot(page);
  expect(s.doc.openings).toHaveLength(before.doc.openings.length + 1);

  const opening = s.doc.openings[s.doc.openings.length - 1]!;
  expect(opening.kind).toBe('door');
  expect(opening.wallId).toBe(wall.id);
  expect(opening.width).toBe(0.9);
  expect(opening.sill).toBe(0);
  expect(opening.height).toBe(2.0);
});

test('window tool creates opening with correct defaults', async ({ app: page }) => {
  const before = await snapshot(page);

  // Draw a wall
  await page.keyboard.press('w');
  await clickWorld(page, FREE_X, 1);
  await clickWorld(page, FREE_X, 4);
  await page.keyboard.press('Escape');

  let s = await snapshot(page);
  const wall = s.doc.walls[s.doc.walls.length - 1]!;
  const midZ = (wall.a[1] + wall.b[1]) / 2;

  // Place window
  await page.keyboard.press('n');
  await clickWorld(page, wall.a[0], midZ);

  s = await snapshot(page);
  expect(s.doc.openings).toHaveLength(before.doc.openings.length + 1);

  const opening = s.doc.openings[s.doc.openings.length - 1]!;
  expect(opening.kind).toBe('window');
  expect(opening.wallId).toBe(wall.id);
  expect(opening.width).toBe(1.2);
  expect(opening.sill).toBe(0.9);
  expect(opening.height).toBe(1.2);
});

test('clicking door tool on existing door shows error', async ({ app: page }) => {
  const before = await snapshot(page);

  // Draw a wall
  await page.keyboard.press('w');
  await clickWorld(page, FREE_X, 1);
  await clickWorld(page, FREE_X, 5);
  await page.keyboard.press('Escape');

  let s = await snapshot(page);
  const wall = s.doc.walls[s.doc.walls.length - 1]!;
  const midZ = (wall.a[1] + wall.b[1]) / 2;

  // Place first door
  await page.keyboard.press('d');
  await clickWorld(page, wall.a[0], midZ);

  s = await snapshot(page);
  const doorCount = s.doc.openings.length;
  expect(s.lastError).toBeNull();

  // Try to place another door at the exact same spot
  await page.keyboard.press('d');
  await clickWorld(page, wall.a[0], midZ);

  s = await snapshot(page);
  expect(s.doc.openings.length).toBe(doorCount);
  expect(s.lastError).toBeTruthy();
  expect(s.lastError).toMatch(/^.+$/);
});
