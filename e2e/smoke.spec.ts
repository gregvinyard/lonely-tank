import { expect, test } from '@playwright/test';

test('game boots into the Game scene without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.waitForFunction(() => (window as any).__LT_GAME__?.scene.isActive('Game'));
  await page.screenshot({ path: 'test-results/smoke.png' });

  expect(errors).toEqual([]);
});
