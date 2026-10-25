import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;
const HUD = `${GAME}.scene.getScene('Hud')`;

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

test.beforeEach(async ({ page }) => {
  await page.goto('/?newgame');
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
});

/** Out of fuel, almost out of charge, just outside the door with open ground to the west. */
async function nearlyFlat(page: Page, battery = 0.6) {
  await page.evaluate(`(() => { const s = ${SCENE}; s.tank.reset(s.world.spawn.x, s.world.spawn.y); s.fuel = 0; s.battery = ${battery}; })()`);
}

test('with the fuel gone the tank runs on its battery, then is stranded', async ({ page }) => {
  await nearlyFlat(page);
  const x0 = await read<number>(page, `${SCENE}.tank.x`);
  await page.keyboard.down('a');
  await page.waitForTimeout(1600);
  const r = await read<{ x: number; battery: number; stranded: boolean; warning: string }>(
    page,
    `(() => { const s = ${SCENE}; return { x: s.tank.x, battery: s.battery, stranded: s.stranded, warning: ${HUD}.warning.visible && ${HUD}.warning.text.text }; })()`,
  );
  // Still holding the key, but going nowhere.
  await page.waitForTimeout(400);
  const later = await read<number>(page, `${SCENE}.tank.x`);
  await page.keyboard.up('a');
  expect(r.x).toBeLessThan(x0 - 30); // it drove on the battery
  expect(r.battery).toBe(0);
  expect(r.stranded).toBe(true);
  expect(r.warning).toBe('BATTERY FLAT · [F] DEPLOY SOLAR PANELS');
  expect(Math.abs(later - r.x)).toBeLessThan(2);
  // No rescue for running dry any more.
  expect(await read<boolean>(page, `${HUD}.banner.visible`)).toBe(false);
});

test('solar panels charge a stopped tank, and pausing stops the charging', async ({ page }) => {
  await nearlyFlat(page, 0);
  await page.keyboard.press('f');
  await page.waitForFunction(`${SCENE}.solarState === 'out'`, null, { timeout: 3000 });
  const a = await read<number>(page, `${SCENE}.battery`);
  await page.waitForTimeout(1000);
  const b = await read<number>(page, `${SCENE}.battery`);
  expect(b - a).toBeGreaterThan(0.3); // 0.5 a second
  expect(await read<boolean>(page, `${SCENE}.panels.every((p) => p.visible)`)).toBe(true);
  expect(await read<string>(page, `${HUD}.warning.text.text`)).toContain('SOLAR CHARGING');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const paused = await read<number>(page, `${SCENE}.battery`);
  await page.waitForTimeout(600);
  expect(await read<number>(page, `${SCENE}.battery`)).toBe(paused);
  await page.keyboard.press('Escape');
});

test('driving off folds the panels only once there is charge to drive on', async ({ page }) => {
  await nearlyFlat(page, 0);
  await page.keyboard.press('f');
  await page.waitForFunction(`${SCENE}.solarState === 'out'`, null, { timeout: 3000 });
  // Nearly flat: holding a drive key keeps the panels out (folding would strand it for good).
  await page.keyboard.down('a');
  await page.waitForTimeout(300);
  expect(await read<string>(page, `${SCENE}.solarState`)).toBe('out');
  await page.keyboard.up('a');
  // With 15%: they fold away and the tank drives off.
  await page.evaluate(`${SCENE}.battery = 3`);
  const x0 = await read<number>(page, `${SCENE}.tank.x`);
  await page.keyboard.down('a');
  await page.waitForTimeout(1300);
  await page.keyboard.up('a');
  expect(await read<string>(page, `${SCENE}.solarState`)).toBe('stowed');
  expect(await read<number>(page, `${SCENE}.tank.x`)).toBeLessThan(x0 - 20);
});

test('the panels only come out when the tank is stopped, and F folds them', async ({ page }) => {
  await page.evaluate(`${SCENE}.tank.reset(${SCENE}.world.spawn.x, ${SCENE}.world.spawn.y)`);
  await page.keyboard.down('a');
  await page.waitForTimeout(300);
  await page.keyboard.press('f');
  expect(await read<string>(page, `${SCENE}.solarState`)).toBe('stowed');
  await page.keyboard.up('a');
  await page.waitForFunction(`${SCENE}.tank.speed < 1`, null, { timeout: 3000 });
  await page.keyboard.press('f');
  await page.waitForFunction(`${SCENE}.solarState === 'out'`, null, { timeout: 3000 });
  await page.keyboard.press('f');
  await page.waitForFunction(`${SCENE}.solarState === 'stowed'`, null, { timeout: 3000 });
  expect(await read<boolean>(page, `${SCENE}.panels.some((p) => p.visible)`)).toBe(false);
});

test('the battery is saved, and refilled by the ship and by a rescue', async ({ page }) => {
  await page.evaluate(`(() => { const s = ${SCENE}; s.battery = 7.5; s.fuel = 0; s.save(); })()`);
  await page.reload();
  await page.waitForFunction(`${SCENE}?.scene.isActive()`);
  expect(await read<number>(page, `${SCENE}.battery`)).toBe(7.5);
  expect(await read<number>(page, `${SCENE}.fuel`)).toBe(0);

  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('e');
  await page.waitForFunction(`${SCENE}.workshopOpen`, null, { timeout: 5000 });
  expect(await read<number>(page, `${SCENE}.battery`)).toBe(20);
  await page.keyboard.press('e');
  await page.waitForFunction(`${SCENE}.shipState === 'outside'`, null, { timeout: 5000 });

  await page.evaluate(`(() => { const s = ${SCENE}; s.battery = 2; s.rescue('destroyed'); })()`);
  expect(await read<number>(page, `${SCENE}.battery`)).toBe(20);
});
