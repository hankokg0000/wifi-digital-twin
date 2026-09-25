import { readFile } from 'node:fs/promises';
import { test, expect, snapshot, clickWorld } from './helpers';

async function fileMenu(page: import('@playwright/test').Page, item: string | RegExp) {
  await page.getByRole('button', { name: /^File/ }).click();
  await page.getByRole('button', { name: item, exact: typeof item === 'string' }).click();
}

test('Save JSON downloads scene.json matching the current doc', async ({ app: page }) => {
  const downloadPromise = page.waitForEvent('download');
  await fileMenu(page, 'Save JSON');
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('scene.json');
  const saved = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(saved).toEqual((await snapshot(page)).doc);
});

test('Open JSON with an invalid file keeps the doc and lists the issues', async ({ app: page }) => {
  const before = await snapshot(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 2 })),
  });

  // File reading is async: wait for the issues UI, then check nothing changed.
  await expect(page.getByText(/version/i).first()).toBeVisible();
  const after = await snapshot(page);
  expect(after.doc).toEqual(before.doc);
  expect(after.lastError).toMatch(/\S/);
});

test('a saved file round-trips through New and Open JSON', async ({ app: page }) => {
  await page.keyboard.press('w');
  await clickWorld(page, 12, 1);
  await clickWorld(page, 12, 3);
  await page.keyboard.press('Escape');

  const downloadPromise = page.waitForEvent('download');
  await fileMenu(page, 'Save JSON');
  const content = await readFile((await (await downloadPromise).path())!, 'utf8');
  const edited = (await snapshot(page)).doc;

  await fileMenu(page, 'New');
  const empty = await snapshot(page);
  expect(empty.doc.levels).toHaveLength(1);
  expect(empty.doc.walls).toHaveLength(0);
  expect(empty.pastLength).toBe(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'scene.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
  await expect.poll(async () => (await snapshot(page)).doc).toEqual(edited);

  await fileMenu(page, 'Load sample');
  const sample = await snapshot(page);
  expect(sample.doc.rooms).toHaveLength(11);
  expect(sample.doc.walls).toHaveLength(edited.walls.length - 1);
});
