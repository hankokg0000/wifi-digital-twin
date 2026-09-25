import { test, expect, snapshot, clickWorld } from './helpers';

test('AP tool creates radio with correct defaults and dual-band interfaces', async ({ app: page }) => {
  const before = await snapshot(page);

  // AP tool
  await page.keyboard.press('a');

  // Click at (13, 6)
  await clickWorld(page, 13, 6);

  const s = await snapshot(page);
  expect(s.doc.radios).toHaveLength(before.doc.radios.length + 1);

  const radio = s.doc.radios[s.doc.radios.length - 1]!;
  expect(radio.role).toBe('ap');
  expect(radio.position).toEqual([13, 2, 6]);
  expect(radio.ifaces).toHaveLength(2);

  // Check interfaces
  const band24 = radio.ifaces.find((f) => f.band === '2.4');
  const band5 = radio.ifaces.find((f) => f.band === '5');

  expect(band24!.channel).toBe(6);
  expect(band24!.txPowerDbm).toBe(20);

  expect(band5!.channel).toBe(36);
  expect(band5!.txPowerDbm).toBe(23);

  expect(radio.levelId).toBe(before.activeLevelId);
});
