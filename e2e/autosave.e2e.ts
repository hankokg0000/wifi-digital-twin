import { test, expect, snapshot, clickWorld, waitForCanvas } from './helpers';

const FREE_X = 12;

test('autosave persists wall across page reload', async ({ app: page }) => {
  const before = await snapshot(page);
  const beforeWallCount = before.doc.walls.length;

  // Draw a wall
  await page.keyboard.press('w');
  await clickWorld(page, FREE_X + 0.03, 1.04);
  await clickWorld(page, FREE_X + 0.03, 4.02);
  await page.keyboard.press('Escape');

  let s = await snapshot(page);
  expect(s.doc.walls).toHaveLength(beforeWallCount + 1);

  const drawnWall = s.doc.walls[s.doc.walls.length - 1]!;
  const wallData = {
    a: drawnWall.a,
    b: drawnWall.b,
    thickness: drawnWall.thickness,
  };

  // Wait for autosave debounce (500ms) + buffer
  await page.waitForTimeout(700);

  // Reload the page
  await page.reload();

  // Wait for store and canvas to load
  await page.waitForFunction(() => !!(window as any).__sceneStore);
  await waitForCanvas(page);

  // Check that the wall is still there
  s = await snapshot(page);
  expect(s.doc.walls).toHaveLength(beforeWallCount + 1);

  const reloadedWall = s.doc.walls.find((w) =>
    w.a[0] === wallData.a[0] &&
    w.a[1] === wallData.a[1] &&
    w.b[0] === wallData.b[0] &&
    w.b[1] === wallData.b[1],
  );
  expect(reloadedWall).toBeDefined();
  expect(reloadedWall!.thickness).toBe(wallData.thickness);
});
