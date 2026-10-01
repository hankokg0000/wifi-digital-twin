import { test, expect, snapshot, edit } from './helpers';

test('materials tab: update material 2.4 GHz loss', async ({ app: page }) => {
  await edit(page);
  const before = await snapshot(page);

  // Find brick material
  const brickMaterial = before.doc.materials.find((m) => m.id === 'brick')!;

  const oldLoss24 = brickMaterial.lossDb['2.4'];
  const oldLoss5 = brickMaterial.lossDb['5'];

  // Click on Materials tab
  const materialsTab = page.getByRole('tab', { name: 'วัสดุ' });
  await materialsTab.click();

  // Find the input for brick's 2.4 GHz loss
  // The materials table has rows for each material; find the brick row and its 2.4 input
  const brickRow = page.locator('tr').filter({ hasText: /brick/i }).first();
  const inputs = brickRow.locator('input[type="number"]');
  const input24 = inputs.first();

  // Set to 9
  await input24.fill('9');
  await input24.blur();

  let s = await snapshot(page);
  const updatedBrick = s.doc.materials.find((m) => m.id === 'brick')!;
  expect(updatedBrick.lossDb['2.4']).toBe(9);
  expect(updatedBrick.lossDb['5']).toBe(oldLoss5);
});
