import { test, expect, snapshot, clickWorld, edit } from './helpers';

test('sample house starts on the ground floor', async ({ app: page }) => {
  await edit(page);
  const s = await snapshot(page);
  expect(s.doc.levels).toHaveLength(2);
  expect(s.activeLevelId).toBe(s.doc.levels[0]!.id);
});

test('add a level, draw on it, then remove it with its contents', async ({ app: page }) => {
  await edit(page);
  const before = await snapshot(page);

  // Edit mode's left rail opens on the "ชั้น" (levels) tab.
  await page.getByTitle('Add level').click();
  const added = await snapshot(page);
  expect(added.doc.levels).toHaveLength(3);
  const level = added.doc.levels.at(-1)!;
  // Sample top floor: elevation 3.2 + height 2.8 = 6.0, plus 0.2 slab.
  expect(level.name).toBe('ชั้น 3');
  expect(level.elevation).toBeCloseTo(6.2, 6);
  expect(level.height).toBe(3);
  expect(added.activeLevelId).toBe(before.activeLevelId);

  await page.locator('.level-list').getByRole('button', { name: /ชั้น 3/ }).click();
  expect((await snapshot(page)).activeLevelId).toBe(level.id);

  await page.keyboard.press('w');
  await clickWorld(page, 12, 1);
  await clickWorld(page, 12, 3);
  await page.keyboard.press('Escape');
  const drawn = await snapshot(page);
  expect(drawn.doc.walls).toHaveLength(before.doc.walls.length + 1);
  expect(drawn.doc.walls.at(-1)!.levelId).toBe(level.id);

  await page.getByTitle('Remove level').nth(2).click();
  const removed = await snapshot(page);
  expect(removed.doc.levels.map((l) => l.id)).toEqual(before.doc.levels.map((l) => l.id));
  expect(removed.doc.walls).toHaveLength(before.doc.walls.length);
  expect(removed.doc.levels.map((l) => l.id)).toContain(removed.activeLevelId);
});

test('the last remaining level cannot be removed', async ({ app: page }) => {
  await edit(page);
  await page.getByRole('button', { name: 'เมนูไฟล์' }).click();
  await page.getByRole('menuitem', { name: 'New', exact: true }).click();

  expect((await snapshot(page)).doc.levels).toHaveLength(1);
  await expect(page.getByTitle('Remove level')).toBeDisabled();
});
