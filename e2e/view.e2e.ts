import { test, expect, snapshot } from './helpers';

test('switch to 3D and back to Plan preserves view mode state', async ({ app: page }) => {
  let s = await snapshot(page);
  expect(s.viewMode).toBe('plan');

  // Click 3D button
  await page.getByRole('button', { name: /^3d$/i }).click();

  s = await snapshot(page);
  expect(s.viewMode).toBe('3d');

  // Click Plan button
  await page.getByRole('button', { name: /^plan$/i }).click();

  s = await snapshot(page);
  expect(s.viewMode).toBe('plan');
});

test('3D button shows active state when in 3D mode', async ({ app: page }) => {
  let planBtn = page.getByRole('button', { name: /^plan$/i });
  let threeBtn = page.getByRole('button', { name: /^3d$/i });

  let s = await snapshot(page);
  expect(s.viewMode).toBe('plan');

  // Plan button should have active class
  await expect(planBtn).toHaveClass(/active/);
  await expect(threeBtn).not.toHaveClass(/active/);

  // Switch to 3D
  await threeBtn.click();

  s = await snapshot(page);
  expect(s.viewMode).toBe('3d');

  // 3D button should have active class
  await expect(planBtn).not.toHaveClass(/active/);
  await expect(threeBtn).toHaveClass(/active/);
});
