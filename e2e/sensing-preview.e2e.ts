import { expect, test, type Page } from '@playwright/test';

const baseline = {
  recordedAt: '2026-11-19T00:00:00Z',
  durationS: 30,
  meanRssi: -55,
  windowStdMean: 0.2,
  windowStdSd: 0.3,
  samples: 240,
};

type EventType = 'status' | 'message' | 'error';

declare global {
  interface Window {
    emitTestWifi(type: EventType, data?: unknown): void;
  }
}

async function openSite(page: Page, withBaseline: boolean) {
  await page.route('**/api/sites', (route) => route.fulfill({
    json: {
      version: 1,
      activeSiteId: 'qa-site',
      sites: [{
        id: 'qa-site',
        name: 'ห้องทดสอบ',
        widthM: 4,
        lengthM: 5,
        createdAt: baseline.recordedAt,
        devices: { tx: [-1, 1], rx: [5, 3] },
        network: null,
      }],
    },
  }));
  await page.addInitScript((savedBaseline) => {
    if (savedBaseline) localStorage.setItem('wdt.baseline.v1', JSON.stringify(savedBaseline));
    localStorage.setItem('wdt.reality.v1', 'real');

    class TestEventSource extends EventTarget {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        super();
        window.emitTestWifi = (type, data) => {
          const event = new MessageEvent(type, { data: JSON.stringify(data) });
          if (type === 'message') this.onmessage?.(event);
          else if (type === 'error') this.onerror?.();
          else this.dispatchEvent(event);
        };
      }

      close() {}
    }

    Object.defineProperty(window, 'EventSource', { value: TestEventSource });
  }, withBaseline ? baseline : null);
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'สถานที่' })).toHaveValue('qa-site');
  await page.waitForFunction(() => typeof window.emitTestWifi === 'function');
  await page.evaluate(() => document.fonts.ready);
}

function setStream(page: Page, mode: 'live' | 'fake') {
  return page.evaluate((mode) => window.emitTestWifi('status', { mode }), mode);
}

function sendReadings(page: Page, startMs: number, count: number, motion: boolean) {
  return page.evaluate(({ startMs, count, motion }) => {
    for (let i = 0; i < count; i++) {
      window.emitTestWifi('message', {
        ts: startMs + i * 125,
        rssi: motion ? (i % 2 === 0 ? -61 : -49) : -55,
        channel: 36,
      });
    }
  }, { startMs, count, motion });
}

test('WiFi preview keeps the chart fixed and labels motion and Alerts by origin', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openSite(page, true);
  const preview = page.locator('.motion-preview');
  const chart = page.getByRole('img', { name: 'กราฟสัญญาณ WiFi 60 วินาทีล่าสุด' });
  const chartTop = () => chart.evaluate((element) => element.getBoundingClientRect().top);
  const chartStart = await chartTop();
  const badge = page.locator('.sensing-badge');
  const room = page.locator('.room-mirror');
  const alertBadges = page.locator('.feed .src-badge');

  await setStream(page, 'fake');
  await sendReadings(page, 100_000, 25, true);
  await expect(badge).toHaveText('จำลอง');
  await expect(preview.getByText('ภาพประกอบจำลอง')).toBeVisible();
  const leg = preview.locator('.motion-leg').first();
  await expect(leg).toHaveCSS('animation-name', 'motion-stride');
  await expect(leg).toHaveCSS('animation-play-state', 'running');
  await expect(room).toHaveText('จำลอง · มีการเคลื่อนไหว');
  await expect(alertBadges).toHaveText(['จำลอง']);
  await expect(page.locator('.warn-toast > span')).toHaveText('จำลอง · ตรวจพบการเคลื่อนไหวในห้องทดสอบ จาก WiFi');
  expect(await chartTop()).toBe(chartStart);

  await sendReadings(page, 103_125, 49, false);
  await expect(page.locator('.sensing-status')).toHaveText('ไม่มีการเคลื่อนไหว');
  await expect(preview).toBeHidden();
  expect(await chartTop()).toBe(chartStart);

  await setStream(page, 'live');
  await sendReadings(page, 109_250, 25, true);
  await expect(badge).toHaveText('ของจริง');
  await expect(preview).toBeVisible();
  await expect(room).toHaveText('ของจริง · มีการเคลื่อนไหว');
  await expect(alertBadges).toHaveText(['ของจริง', 'จำลอง']);
  await expect(page.locator('.warn-toast > span').last()).toHaveText('ของจริง · ตรวจพบการเคลื่อนไหวในห้องทดสอบ จาก WiFi');

  await page.evaluate(() => window.emitTestWifi('error'));
  await expect(page.locator('.sensing-conn-text')).toHaveText('ไม่ได้เชื่อมต่อ');
  await expect(preview).toBeHidden();
  await expect(room).toHaveCount(0);
  await expect(page.locator('.feed-live')).toHaveCount(0);
  expect(await chartTop()).toBe(chartStart);

  await setStream(page, 'live');
  await expect(badge).toHaveText('ของจริง');
  await expect(page.locator('.sensing-conn-text')).toHaveText('เชื่อมต่อแล้ว · – dBm · ช่อง 36');
  await expect(preview).toBeHidden();
  await expect(alertBadges).toHaveText(['ของจริง', 'จำลอง']);
});

test('Replay uses its own Baseline and ends the preview even if its last verdict is motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSite(page, false);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const preview = page.locator('.motion-preview');
  const readings = Array.from({ length: 41 }, (_, i) => ({ t: i / 8, rssi: i % 2 === 0 ? -61 : -49 }));
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'เปิด Recording' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'wifi-recording.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, kind: 'wifi-recording', baseline, readings, meta: { channel: 36 } })),
  });

  await expect(page.locator('.sensing-badge')).toHaveText('ย้อนหลัง');
  await expect(page.locator('.sensing-status')).toHaveText('มีการเคลื่อนไหว');
  await expect(preview.getByText('ภาพประกอบจำลอง')).toBeVisible();
  await expect(preview.locator('.motion-leg').first()).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.room-mirror')).toHaveText('ย้อนหลัง · มีการเคลื่อนไหว');
  await expect(page.locator('.feed .src-badge')).toHaveText(['ย้อนหลัง']);

  await expect(page.getByText('เล่นย้อนหลังจบแล้ว', { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(preview).toBeHidden();
  await expect(page.locator('.room-mirror')).toHaveCount(0);
  await expect(page.locator('.feed-live')).toHaveCount(0);
  await expect(page.locator('.feed .src-badge')).toHaveText(['ย้อนหลัง']);
});
