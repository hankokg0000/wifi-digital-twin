import { test, expect, snapshot, clickWorld } from './helpers';

test('inspector wall thickness input commits on change and validates > 0', async ({ app: page }) => {
  const before = await snapshot(page);

  // Find a wall with openings on the sample house
  const wall = before.doc.walls.find((w) => {
    const wallOpenings = before.doc.openings.filter((o) => o.wallId === w.id);
    return wallOpenings.length > 0;
  })!;

  const wallId = wall.id;
  const oldThickness = wall.thickness;

  // Select the wall
  await page.keyboard.press('v');
  const wallMidpoint = [
    (wall!.a[0] + wall!.b[0]) / 2,
    (wall!.a[1] + wall!.b[1]) / 2,
  ] as [number, number];
  await clickWorld(page, wallMidpoint[0], wallMidpoint[1]);

  let s = await snapshot(page);
  expect(s.selection).toBe(wallId);

  // Find and fill the Thickness input
  const thicknessInput = page.locator('input[type="number"]').filter({ has: page.locator('..').filter({ hasText: /Thickness/ }) }).first();
  await thicknessInput.fill('0.25');

  // Trigger change event (blur or Enter)
  await thicknessInput.blur();

  s = await snapshot(page);
  const updatedWall = s.doc.walls.find((w) => w.id === wallId)!;
  expect(updatedWall.thickness).toBe(0.25);
});

test('inspector wall thickness with invalid value 0 is rejected', async ({ app: page }) => {
  const before = await snapshot(page);

  // Find a wall
  const wall = before.doc.walls.find((w) => {
    const wallOpenings = before.doc.openings.filter((o) => o.wallId === w.id);
    return wallOpenings.length > 0;
  })!;

  const wallId = wall.id;

  // Select the wall
  await page.keyboard.press('v');
  const wallMidpoint = [
    (wall!.a[0] + wall!.b[0]) / 2,
    (wall!.a[1] + wall!.b[1]) / 2,
  ] as [number, number];
  await clickWorld(page, wallMidpoint[0], wallMidpoint[1]);

  let s = await snapshot(page);
  expect(s.selection).toBe(wallId);

  const oldThickness = s.doc.walls.find((w) => w.id === wallId)!.thickness;

  // Try to set thickness to 0
  const thicknessInput = page.locator('input[type="number"]').filter({ has: page.locator('..').filter({ hasText: /Thickness/ }) }).first();
  await thicknessInput.fill('0');
  await thicknessInput.blur();

  // Wait a moment for validation
  s = await snapshot(page);
  const wallAfter = s.doc.walls.find((w) => w.id === wallId);

  // updateWall rejects thickness 0: doc unchanged, error surfaced.
  expect(wallAfter!.thickness).toBe(oldThickness);
  expect(s.lastError).toMatch(/\S/);
});
