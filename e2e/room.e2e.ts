import { test, expect, snapshot, clickWorld } from './helpers';

test('room tool: 4 clicks to close, creates room with correct polygon', async ({ app: page }) => {
  const before = await snapshot(page);

  // Room tool
  await page.keyboard.press('r');

  // 4 clicks in a square
  const points = [[11, 1], [13, 1], [13, 3], [11, 3]];
  for (const [x, z] of points) {
    await clickWorld(page, x, z);
  }

  // Click first point again to close
  await clickWorld(page, 11, 1);

  const s = await snapshot(page);
  expect(s.doc.rooms).toHaveLength(before.doc.rooms.length + 1);

  const room = s.doc.rooms[s.doc.rooms.length - 1]!;
  expect(room.polygon).toEqual([[11, 1], [13, 1], [13, 3], [11, 3]]);
  expect(room.cameraAllowed).toBe(false);
  expect(room.levelId).toBe(before.activeLevelId);
});

test('room tool: 3 points + Enter closes room', async ({ app: page }) => {
  const before = await snapshot(page);

  // Room tool
  await page.keyboard.press('r');

  // 3 clicks in a triangle
  const points = [[11, 1], [13, 1], [12, 3]];
  for (const [x, z] of points) {
    await clickWorld(page, x, z);
  }

  // Press Enter to close
  await page.keyboard.press('Enter');

  const s = await snapshot(page);
  expect(s.doc.rooms).toHaveLength(before.doc.rooms.length + 1);

  const room = s.doc.rooms[s.doc.rooms.length - 1]!;
  expect(room.polygon).toEqual([[11, 1], [13, 1], [12, 3]]);
});

test('room tool: 2 points + Escape cancels without creating room', async ({ app: page }) => {
  const before = await snapshot(page);

  // Room tool
  await page.keyboard.press('r');

  // 2 clicks
  await clickWorld(page, 11, 1);
  await clickWorld(page, 13, 1);

  // Escape to cancel
  await page.keyboard.press('Escape');

  const s = await snapshot(page);
  expect(s.doc.rooms).toHaveLength(before.doc.rooms.length);
  expect(s.draft).toBeNull();
});
