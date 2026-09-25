import { test as base, expect, type Page } from '@playwright/test';

/** console.error messages we accept. Anything else fails the test. */
const ALLOWED_CONSOLE_ERRORS: RegExp[] = [];

type Vec2 = [number, number];

/** JSON-safe snapshot of the editor store (no functions). */
export interface Snapshot {
  doc: {
    levels: { id: string; name: string; elevation: number; height: number }[];
    walls: { id: string; levelId: string; a: Vec2; b: Vec2; thickness: number; height: number; materialId: string }[];
    openings: { id: string; wallId: string; kind: 'door' | 'window'; offset: number; width: number; sill: number; height: number; open: boolean }[];
    rooms: { id: string; levelId: string; name: string; polygon: Vec2[]; cameraAllowed: boolean }[];
    objects: { id: string; levelId: string; position: [number, number, number]; size: [number, number, number]; rotationY: number }[];
    radios: { id: string; levelId: string; role: string; position: [number, number, number]; ifaces: { band: string; channel: number; txPowerDbm: number }[] }[];
    agents: { id: string; name: string; kind: 'person' | 'pet'; start: { levelId: string; p: Vec2; dwell: number } }[];
    stairs: { id: string; fromLevelId: string; toLevelId: string; bottom: Vec2; top: Vec2; width: number }[];
    materials: { id: string; name: string; lossDb: Record<string, number> }[];
  };
  pastLength: number;
  futureLength: number;
  selection: string | null;
  activeLevelId: string;
  tool: string;
  viewMode: string;
  draft: { kind: string; points: Vec2[] } | null;
  lastError: string | null;
}

export async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const s = (window as any).__sceneStore.getState();
    return JSON.parse(
      JSON.stringify({
        doc: s.doc,
        pastLength: s.past.length,
        futureLength: s.future.length,
        selection: s.selection,
        activeLevelId: s.activeLevelId,
        tool: s.tool,
        viewMode: s.viewMode,
        draft: s.draft,
        lastError: s.lastError,
      }),
    );
  });
}

/** Wait until R3F has mounted and rendered at least one frame with the current camera. */
export async function waitForCanvas(page: Page) {
  await page.waitForFunction(() => {
    const r = (window as any).__r3f;
    return !!r && r.size.width > 0 && r.gl.info.render.frame > 1;
  });
}

/**
 * Project a world point (x, z on the ACTIVE level's floor, plus height y above that floor)
 * to page pixel coordinates using the live camera. Exact, no calibration needed.
 */
export async function worldToScreen(page: Page, x: number, z: number, y = 0): Promise<{ x: number; y: number }> {
  await waitForCanvas(page);
  return page.evaluate(
    ({ x, y, z }) => {
      const r = (window as any).__r3f;
      const s = (window as any).__sceneStore.getState();
      const level = s.doc.levels.find((l: any) => l.id === s.activeLevelId);
      const v = r.camera.position.clone().set(x, (level?.elevation ?? 0) + y, z).project(r.camera);
      const rect = r.gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    },
    { x, y, z },
  );
}

export async function clickWorld(page: Page, x: number, z: number, y = 0) {
  const p = await worldToScreen(page, x, z, y);
  await page.mouse.click(p.x, p.y);
}

export async function hoverWorld(page: Page, x: number, z: number, y = 0) {
  const p = await worldToScreen(page, x, z, y);
  await page.mouse.move(p.x, p.y);
}

/** Left-button drag between two world points (y = height above active floor). */
export async function dragWorld(page: Page, from: Vec2, to: Vec2, y = 0) {
  const a = await worldToScreen(page, from[0], from[1], y);
  const b = await worldToScreen(page, to[0], to[1], y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

/** Round to 0.1 m grid for exact snap assertions. */
export const grid = (n: number) => Math.round(n * 10) / 10;

/**
 * `test` with an auto fixture: fresh localStorage (sample house) before each test,
 * canvas ready, and a hard failure on any page error or unexpected console.error.
 * Use `test.use({ keepStorage: true })` style is NOT supported — autosave test reloads manually.
 */
export const test = base.extend<{ app: Page }>({
  app: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !ALLOWED_CONSOLE_ERRORS.some((re) => re.test(m.text()))) {
          problems.push(`console.error: ${m.text()}`);
        }
      });
      await page.addInitScript(() => {
        // Only clear on the first load of this test, so reload() can check autosave.
        if (!sessionStorage.getItem('e2e-started')) {
          localStorage.clear();
          sessionStorage.setItem('e2e-started', '1');
        }
      });
      await page.goto('/');
      await page.waitForFunction(() => !!(window as any).__sceneStore);
      await waitForCanvas(page);
      await use(page);
      expect(problems, 'page errors / unexpected console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
