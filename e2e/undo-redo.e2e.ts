import { test, expect, snapshot, clickWorld, grid } from './helpers';

const FREE_X = 12;

test('draw wall, undo with Cmd+Z/Ctrl+Z removes it, redo restores', async ({ app: page }) => {
  const before = await snapshot(page);

  // Draw a wall
  await page.keyboard.press('w');
  await clickWorld(page, FREE_X, 1);
  await clickWorld(page, FREE_X, 4);
  await page.keyboard.press('Escape');

  const afterDraw = await snapshot(page);
  const wallId = afterDraw.doc.walls[afterDraw.doc.walls.length - 1]!.id;
  const wallObject = afterDraw.doc.walls[afterDraw.doc.walls.length - 1]!;
  expect(afterDraw.doc.walls).toHaveLength(before.doc.walls.length + 1);

  // Undo with Cmd+Z (or Ctrl+Z)
  await page.keyboard.press('Control+z');
  const afterUndo = await snapshot(page);
  expect(afterUndo.doc.walls).toHaveLength(before.doc.walls.length);
  expect(afterUndo.doc.walls.every((w) => w.id !== wallId)).toBe(true);

  // Redo with Cmd+Shift+Z (or Ctrl+Shift+Z)
  await page.keyboard.press('Control+Shift+z');
  const afterRedo = await snapshot(page);
  expect(afterRedo.doc.walls).toHaveLength(before.doc.walls.length + 1);
  const redoneWall = afterRedo.doc.walls[afterRedo.doc.walls.length - 1]!;
  expect(redoneWall).toEqual(wallObject);
});

test('toolbar Undo/Redo buttons work and disabled state reflects history', async ({ app: page }) => {
  const before = await snapshot(page);

  // Initially Undo should be disabled
  const undoBtn = page.getByRole('button', { name: /undo/i });
  await expect(undoBtn).toBeDisabled();

  // Draw a wall
  await page.keyboard.press('w');
  await clickWorld(page, FREE_X + 0.5, 2);
  await clickWorld(page, FREE_X + 0.5, 5);
  await page.keyboard.press('Escape');

  const afterDraw = await snapshot(page);
  expect(afterDraw.doc.walls).toHaveLength(before.doc.walls.length + 1);

  // Undo button should be enabled
  await expect(undoBtn).toBeEnabled();

  // Click Undo
  await undoBtn.click();
  const afterUndo = await snapshot(page);
  expect(afterUndo.doc.walls).toHaveLength(before.doc.walls.length);

  // Redo button should be enabled now
  const redoBtn = page.getByRole('button', { name: /redo/i });
  await expect(redoBtn).toBeEnabled();

  // Click Redo
  await redoBtn.click();
  const afterRedo = await snapshot(page);
  expect(afterRedo.doc.walls).toHaveLength(before.doc.walls.length + 1);

  // Redo should be disabled again
  await expect(redoBtn).toBeDisabled();
});

test('new edit after undo clears redo history', async ({ app: page }) => {
  const before = await snapshot(page);

  // Draw first wall
  await page.keyboard.press('w');
  await clickWorld(page, FREE_X, 1);
  await clickWorld(page, FREE_X, 3);
  await page.keyboard.press('Escape');

  // Draw second wall
  await clickWorld(page, FREE_X + 1.5, 3);
  await clickWorld(page, FREE_X + 1.5, 6);
  await page.keyboard.press('Escape');

  let s = await snapshot(page);
  expect(s.doc.walls).toHaveLength(before.doc.walls.length + 2);

  // Undo once (removes second wall)
  await page.keyboard.press('Control+z');
  s = await snapshot(page);
  expect(s.doc.walls).toHaveLength(before.doc.walls.length + 1);
  expect(s.futureLength).toBe(1);

  // Draw a third wall (new edit)
  await clickWorld(page, FREE_X + 3, 3);
  await clickWorld(page, FREE_X + 3, 6);
  await page.keyboard.press('Escape');

  // Redo should be impossible now
  s = await snapshot(page);
  expect(s.futureLength).toBe(0);
  const redoBtn = page.getByRole('button', { name: /redo/i });
  await expect(redoBtn).toBeDisabled();
});
