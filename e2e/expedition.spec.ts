import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;
const HUD = `${GAME}.scene.getScene('Hud')`;

async function start(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);
  // Focus the canvas so it gets key presses.
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
}

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

test('fuel burns while driving and not while parked', async ({ page }) => {
  await start(page);
  const before = await read<number>(page, `${SCENE}.fuel`);
  expect(before).toBe(100);
  await page.waitForTimeout(500);
  expect(await read<number>(page, `${SCENE}.fuel`)).toBe(before);

  await page.keyboard.down('a');
  await page.waitForTimeout(1200);
  await page.keyboard.up('a');
  const after = await read<number>(page, `${SCENE}.fuel`);
  expect(after).toBeLessThan(before - 0.5);
  expect(after).toBeGreaterThan(before - 1.5);
  expect(await read<number>(page, `${HUD}.fuelBar.fill.width`)).toBeLessThanOrEqual(48);
});

test('running out of fuel rescues the tank to the ship', async ({ page }) => {
  await start(page);
  await page.evaluate(`(() => {
    const s = ${SCENE};
    s.inventory = { scrap: 4, crystal: 2, circuit: 0 };
    s.fuel = 0.3;
    s.tank.reset(s.world.spawn.x, s.world.spawn.y + 300);
  })()`);
  await page.keyboard.down('d');
  await page.waitForFunction(`${HUD}.banner.visible`, null, { timeout: 5000 });
  await page.keyboard.up('d');
  const r = await read<{ fuel: number; inventory: object; d: number; text: string }>(
    page,
    `(() => { const s = ${SCENE}; return { fuel: s.fuel, inventory: s.inventory, d: Math.hypot(s.tank.x - s.world.spawn.x, s.tank.y - s.world.spawn.y), text: ${HUD}.bannerText.text }; })()`,
  );
  expect(r.fuel).toBeGreaterThan(99);
  expect(r.inventory).toEqual({ scrap: 3, crystal: 2, circuit: 0 });
  expect(r.d).toBeLessThan(10);
  expect(r.text).toContain('OUT OF FUEL');
});

