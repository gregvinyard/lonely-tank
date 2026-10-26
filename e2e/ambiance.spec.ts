import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

async function start(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?play&newgame${query}`);
  await page.waitForFunction(`${SCENE}?.scene.isActive()`);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  return errors;
}

/** Mean brightness of the middle of the screen. */
async function brightness(page: Page) {
  const png = await page.screenshot({ clip: { x: 340, y: 160, width: 600, height: 400 } });
  return page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    return sum / (d.length / 4);
  }, png.toString('base64'));
}

test('night falls and the lamps come on', async ({ page }) => {
  const errors = await start(page);
  // A new game starts in daylight.
  expect(await read<number>(page, `${SCENE}.atmosphere.sky.night`)).toBeLessThan(0.1);
  await page.evaluate(`${SCENE}.phaseOverride = 0.5`);
  await page.waitForTimeout(300);
  const noon = await brightness(page);
  await page.evaluate(`${SCENE}.phaseOverride = 0`);
  await page.waitForTimeout(300);
  expect(await read<number>(page, `${SCENE}.atmosphere.sky.night`)).toBeCloseTo(1);
  const midnight = await brightness(page);
  expect(midnight).toBeLessThan(noon * 0.85);
  // Still readable.
  expect(midnight).toBeGreaterThan(noon * 0.3);
  // Firing at night lights things up without errors.
  await page.mouse.move(900, 360);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  expect(errors).toEqual([]);
});

test('?time= sets the hour a game starts at', async ({ page }) => {
  const errors = await start(page, '&time=0.95');
  await page.waitForTimeout(200);
  expect(await read<number>(page, `${SCENE}.atmosphere.sky.night`)).toBeGreaterThan(0.9);
  expect(errors).toEqual([]);
});

test('the tank leaves tracks and casts a shadow; dust blows and devils wander', async ({ page }) => {
  const errors = await start(page);
  expect(await read<number>(page, `${SCENE}.shadows.count`)).toBeGreaterThan(10);
  await page.keyboard.down('s');
  await page.waitForTimeout(900);
  await page.keyboard.up('s');
  expect(await read<number>(page, `${SCENE}.tracks.visibleCount`)).toBeGreaterThan(20);

  // Somewhere open and quiet, away from the ship.
  await page.evaluate(`(() => { const s = ${SCENE}; s.tank.reset(700, 1500); s.cameras.main.centerOn(700, 1500); s.motes.spawnDevil(800, 1500); })()`);
  await page.waitForTimeout(1500);
  expect(await read<number>(page, `${SCENE}.motes.active`)).toBeGreaterThan(10);
  expect(await read<number>(page, `${SCENE}.motes.devilCount`)).toBe(1);
  expect(errors).toEqual([]);
});

test('shadows go with their chunks', async ({ page }) => {
  const errors = await start(page);
  const before = await read<number>(page, `${SCENE}.shadows.count`);
  // Far out and back: every chunk's shadows are built and torn down again.
  for (const [x, y] of [
    [9000, -9000],
    [1024, 1300],
  ]) {
    await page.evaluate(`(() => { const s = ${SCENE}; s.tank.reset(${x}, ${y}); s.cameras.main.centerOn(${x}, ${y}); })()`);
    await page.waitForFunction(`${SCENE}.planet.isLoaded(${Math.floor(x / 512)}, ${Math.floor(y / 512)}) && ${SCENE}.planet.groundReady`, null, { timeout: 10000 });
  }
  expect(await read<number>(page, `${SCENE}.planet.loadedCount`)).toBe(25);
  expect(await read<number>(page, `${SCENE}.shadows.count`)).toBe(before);
  expect(errors).toEqual([]);
});
