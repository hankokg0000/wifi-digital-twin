import { test, expect, snapshot, clickWorld } from './helpers';

test('selecting wall with openings and deleting removes wall and all its openings', async ({ app: page }) => {
  const before = await snapshot(page);

  // Find a wall with openings on the ground floor (first level)
  const wall = before.doc.walls.find((w) => {
    const wallOpenings = before.doc.openings.filter((o) => o.wallId === w.id);
    return wallOpenings.length > 0;
  })!;

  const wallOpeningCount = before.doc.openings.filter((o) => o.wallId === wall.id).length;

  // Select tool is default
  // Click on the wall (not on an opening)
  const wallMidpoint = [
    (wall!.a[0] + wall!.b[0]) / 2,
    (wall!.a[1] + wall!.b[1]) / 2,
  ] as [number, number];

  await clickWorld(page, wallMidpoint[0], wallMidpoint[1]);

  let s = await snapshot(page);
  expect(s.selection).toBe(wall!.id);

  // Delete
  await page.keyboard.press('Delete');

  s = await snapshot(page);
  expect(s.doc.walls.every((w) => w.id !== wall!.id)).toBe(true);
  expect(s.doc.openings.every((o) => o.wallId !== wall!.id)).toBe(true);
  expect(s.doc.openings).toHaveLength(before.doc.openings.length - wallOpeningCount);
  expect(s.selection).toBeNull();
});

test('Space key toggles opening open/closed state', async ({ app: page }) => {
  const before = await snapshot(page);

  // Find a door
  const door = before.doc.openings.find((o) => o.kind === 'door')!;

  const initialOpen = door.open;
  const wallId = door.wallId;

  // Select tool
  await page.keyboard.press('v');

  // Find the wall to click on it and get the door's approximate position
  const wall = before.doc.walls.find((w) => w.id === wallId)!;
  const wallLength = Math.sqrt(Math.pow(wall.b[0] - wall.a[0], 2) + Math.pow(wall.b[1] - wall.a[1], 2));

  // Calculate approximate click point for the door
  const doorClickX = wall.a[0] + ((door.offset + door.width / 2) / wallLength) * (wall.b[0] - wall.a[0]);
  const doorClickZ = wall.a[1] + ((door.offset + door.width / 2) / wallLength) * (wall.b[1] - wall.a[1]);

  await clickWorld(page, doorClickX, doorClickZ);

  let s = await snapshot(page);
  expect(s.selection).toBe(door.id);

  // Toggle with Space
  await page.keyboard.press(' ');

  s = await snapshot(page);
  const updatedDoor = s.doc.openings.find((o) => o.id === door.id)!;
  expect(updatedDoor.open).toBe(!initialOpen);

  // Toggle again
  await page.keyboard.press(' ');

  s = await snapshot(page);
  const finalDoor = s.doc.openings.find((o) => o.id === door.id)!;
  expect(finalDoor.open).toBe(initialOpen);
});
