import { expect, test } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const active = (key: string) => `${GAME}?.scene.isActive('${key}')`;
const SAVE_KEY = 'lonely-tank.save';

test('the title comes first; New game starts without asking when there is no save', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
  await page.reload();
  await page.waitForFunction(active('Title'));
  expect(await page.evaluate(active('Game'))).toBe(false);
  await page.keyboard.press('Enter');
  await page.waitForFunction(`${active('Game')} && ${active('Hud')}`);
  expect(await page.evaluate(active('Title'))).toBe(false);
});

test('Continue resumes the save, and New game asks before wiping it', async ({ page }) => {
  // Make a save out on the planet.
  await page.goto('/?play&newgame');
  await page.waitForFunction(active('Game'));
  await page.evaluate(`(() => { const s = ${GAME}.scene.getScene('Game'); s.tank.reset(5000, 3000); s.save(); })()`);

  // A refresh shows the title again, and Continue picks up where we were.
  await page.goto('/');
  await page.waitForFunction(active('Title'));
  await page.evaluate(`${GAME}.scene.getScene('Title').choose('continue')`);
  await page.waitForFunction(active('Game'));
  const at = await page.evaluate<number[]>(`(() => { const t = ${GAME}.scene.getScene('Game').tank.hull; return [t.x, t.y]; })()`);
  expect(Math.hypot(at[0] - 5000, at[1] - 3000)).toBeLessThan(60);

  // New game asks; Cancel (the default) keeps the save.
  await page.goto('/');
  await page.waitForFunction(active('Title'));
  await page.keyboard.press('s');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(await page.evaluate(active('Title'))).toBe(true);
  expect(await page.evaluate((k) => localStorage.getItem(k) !== null, SAVE_KEY)).toBe(true);

  // Confirming starts over at the ship.
  await page.keyboard.press('Enter');
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  await page.waitForFunction(active('Game'));
  const fresh = await page.evaluate<[number, number, boolean]>(`(() => { const s = ${GAME}.scene.getScene('Game'); return [s.tank.hull.x, s.tank.hull.y, s.playTimeMs < 5000]; })()`);
  expect(Math.hypot(fresh[0] - 1024, fresh[1] - 1024)).toBeLessThan(400);
  expect(fresh[2]).toBe(true);
});
