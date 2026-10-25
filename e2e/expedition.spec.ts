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

