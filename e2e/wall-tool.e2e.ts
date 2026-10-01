import { test, expect, snapshot, clickWorld, grid, edit } from './helpers';

// Free space right of the house (house footprint is x 0–10, z 0–12).
const FREE_X = 12;

test('wall tool draws a snapped chain and Escape ends it', async ({ app: page }) => {
  await edit(page);
  const before = await snapshot(page);

  await page.keyboard.press('w');
  await clickWorld(page, FREE_X + 0.03, 1.04);
  await clickWorld(page, FREE_X + 0.03, 4.02);
  await clickWorld(page, FREE_X + 2.01, 4.02);
  await page.keyboard.press('Escape');

  const after = await snapshot(page);
  expect(after.tool).toBe('wall');
  expect(after.draft).toBeNull();
  expect(after.doc.walls).toHaveLength(before.doc.walls.length + 2);

  const [w1, w2] = after.doc.walls.slice(-2);
  expect(w1!.levelId).toBe(before.activeLevelId);
  expect(w1!.a).toEqual([grid(FREE_X), 1]);
  expect(w1!.b).toEqual([grid(FREE_X), 4]);
  expect(w2!.a).toEqual(w1!.b);
  expect(w2!.b).toEqual([grid(FREE_X + 2), 4]);
});

test('wall tool snaps to an existing endpoint within 0.25 m', async ({ app: page }) => {
  await edit(page);
  await page.keyboard.press('w');
  await clickWorld(page, FREE_X, 1);
  await clickWorld(page, FREE_X, 4);
  await page.keyboard.press('Escape');

  // Start a new chain 0.18 m off the previous endpoint: must snap onto it exactly.
  await clickWorld(page, FREE_X + 0.13, 4.13);
  await clickWorld(page, FREE_X + 3, 4.13);
  await page.keyboard.press('Escape');

  const s = await snapshot(page);
  const last = s.doc.walls.at(-1)!;
  expect(last.a).toEqual([FREE_X, 4]);
});
