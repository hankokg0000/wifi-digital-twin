import { test, expect, snapshot, clickWorld, dragWorld, worldToScreen, edit } from './helpers';

test('object tool creates object with correct defaults at click point', async ({ app: page }) => {
  await edit(page);
  const before = await snapshot(page);

  // Object tool
  await page.keyboard.press('o');

  // Click at (12, 2)
  await clickWorld(page, 12, 2);

  const s = await snapshot(page);
  expect(s.doc.objects).toHaveLength(before.doc.objects.length + 1);

  const obj = s.doc.objects[s.doc.objects.length - 1]!;
  expect(obj.position).toEqual([12, 0, 2]);
  expect(obj.size).toEqual([1, 0.8, 1]);
  expect(obj.rotationY).toBe(0);
  expect(obj.levelId).toBe(before.activeLevelId);
});

test('selected object rotates with ] and [ and follows a left-button drag without panning the camera', async ({ app: page }) => {
  await edit(page);
  await page.keyboard.press('o');
  await clickWorld(page, 12, 2);
  await page.keyboard.press('v');
  await clickWorld(page, 12, 2);

  const placed = await snapshot(page);
  const id = placed.doc.objects.at(-1)!.id;
  expect(placed.selection).toBe(id);

  await page.keyboard.press(']');
  expect((await snapshot(page)).doc.objects.find((o) => o.id === id)!.rotationY).toBeCloseTo(Math.PI / 12, 6);
  await page.keyboard.press('[');
  expect((await snapshot(page)).doc.objects.find((o) => o.id === id)!.rotationY).toBeCloseTo(0, 6);

  const originBefore = await worldToScreen(page, 0, 0);
  await dragWorld(page, [12, 2], [14, 5]);
  const originAfter = await worldToScreen(page, 0, 0);

  expect(originAfter).toEqual(originBefore);
  expect((await snapshot(page)).doc.objects.find((o) => o.id === id)!.position).toEqual([14, 0, 5]);
});
