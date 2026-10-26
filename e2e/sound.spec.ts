import { expect, test } from '@playwright/test';

const GAME = `window.__LT_GAME__`;

test('every sound file loads and decodes once audio is unlocked', async ({ page }) => {
  const bad: string[] = [];
  page.on('response', (r) => r.url().includes('/assets/sfx/') && !r.ok() && bad.push(`${r.status()} ${r.url()}`));
  await page.goto('/?play');
  await page.waitForFunction(`${GAME}?.scene.isActive('Game')`);
  // A click is the gesture that lets the page make sound.
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  const status = () => page.evaluate(() => (window as unknown as { __LT_SFX__: { status(): { total: number; decoded: number; failed: string[] } } }).__LT_SFX__.status());
  await expect.poll(async () => (await status()).decoded, { timeout: 10000 }).toBe((await status()).total);
  expect((await status()).failed).toEqual([]);
  expect(bad).toEqual([]);
  // Driving and firing with real samples doesn't throw.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.keyboard.down('d');
  await page.mouse.click(400, 300);
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  expect(errors).toEqual([]);
});
