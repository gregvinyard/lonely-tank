import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;
const HUD = `${GAME}.scene.getScene('Hud')`;

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

async function press(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
}

async function start(page: Page, query = '/?play&newgame') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(query);
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  return errors;
}

/** Puts the tank beside a crew cache and waits for the ground there. */
async function goToCache(page: Page, i: number) {
  await page.evaluate(`(() => {
    const s = ${SCENE};
    const c = s.caches[${i}];
    s.tank.reset(c.x - 30, c.y);
    s.cameras.main.centerOn(c.x - 30, c.y);
  })()`);
  await page.waitForFunction(`${SCENE}.planet.groundReady`, null, { timeout: 10000 });
  await page.waitForTimeout(150);
}

test('the first cache calls from the start; playing its log points to the next', async ({ page }) => {
  const errors = await start(page);
  // The beacon is out there, with an arrow and distance on the HUD.
  expect(await read<number | undefined>(page, `${SCENE}.signal?.index`)).toBe(0);
  expect(await read<string>(page, `${HUD}.signalLabel.visible && ${HUD}.signalLabel.text.text`)).toMatch(/^SIGNAL \d+M$/);
  expect(await read<boolean[]>(page, `${SCENE}.caches.map((c) => c.visible)`)).toEqual([true, false, false, false, false, false]);

  await goToCache(page, 0);
  expect(await read<string>(page, `${HUD}.promptText.text`)).toBe('[E] PLAY CREW LOG 1/6');
  await press(page, 'e');
  expect(await read<boolean>(page, `${HUD}.logOpen && ${HUD}.logPanel.visible`)).toBe(true);
  // The game waits while the log plays.
  const t = await read<number>(page, `${SCENE}.playTimeMs`);
  await page.waitForTimeout(300);
  expect(await read<number>(page, `${SCENE}.playTimeMs`)).toBe(t);
  expect(await read<boolean>(page, `${HUD}.logPanel.done`)).toBe(false);
  await page.screenshot({ path: 'test-results/story-log.png' });
  await press(page, 'e');
  expect(await read<boolean>(page, `${HUD}.logPanel.done`)).toBe(true);
  await press(page, 'e');
  expect(await read<boolean>(page, `${HUD}.logOpen`)).toBe(false);
  expect(await read<string>(page, `${HUD}.toast.visible && ${HUD}.toast.text.text`)).toBe('NEW SIGNAL · CACHE 2/6');
  expect(await read<number>(page, `${SCENE}.signal.index`)).toBe(1);
  expect(await read<number>(page, `${SCENE}.logs`)).toBe(1);

  // Heard logs can be played again, and the map shows the trail.
  expect(await read<string>(page, `${HUD}.promptText.text`)).toBe('[E] REPLAY CREW LOG 1/6');
  await press(page, 'Tab');
  expect(await read<boolean>(page, `${HUD}.mapOpen`)).toBe(true);
  await page.screenshot({ path: 'test-results/story-map.png' });
  await press(page, 'Tab');

  // Progress is saved.
  await page.evaluate(`${SCENE}.save()`);
  await start(page, '/?play');
  expect(await read<number>(page, `${SCENE}.logs`)).toBe(1);
  expect(await read<boolean[]>(page, `${SCENE}.caches.map((c) => c.visible)`)).toEqual([true, true, false, false, false, false]);
  expect(errors).toEqual([]);
});

test('rare materials lie in their biomes and are announced the first time', async ({ page }) => {
  const errors = await start(page);
  // The third cache is in the glass fields, where prisms grow.
  await page.evaluate(`(() => { const s = ${SCENE}; s.discovered.add('log:0').add('log:1'); })()`);
  await goToCache(page, 2);
  await page.waitForFunction(`[...${SCENE}.resources.values()].some((r) => r.node.kind === 'prism')`, null, { timeout: 10000 });
  const amount = await read<number>(
    page,
    `(() => { const s = ${SCENE}; const r = [...s.resources.values()].find((r) => r.node.kind === 'prism'); s.collect(r.node); return r.node.amount; })()`,
  );
  expect(await read<number>(page, `${SCENE}.inventory.prism`)).toBe(amount);
  expect(await read<string>(page, `${HUD}.discovery.visible && ${HUD}.discovery.text.text`)).toContain('NEW MATERIAL: PRISM SHARD');
  // The HUD's row of rare materials appears.
  await page.waitForTimeout(100);
  expect(await read<boolean>(page, `${HUD}.counts.prism.visible`)).toBe(true);
  await page.screenshot({ path: 'test-results/story-prism.png' });
  expect(errors).toEqual([]);
});

test('the top scanner tier finds rare materials first', async ({ page }) => {
  const errors = await start(page);
  await page.evaluate(`(() => { const s = ${SCENE}; s.levels = { ...s.levels, scanner: 3 }; s.stats = { ...s.stats, scanner: 3 }; s.discovered.add('log:0').add('log:1'); })()`);
  await goToCache(page, 2);
  await page.waitForFunction(`[...${SCENE}.resources.values()].some((r) => r.node.kind === 'prism')`, null, { timeout: 10000 });
  await page.waitForTimeout(100);
  expect(await read<string>(page, `${SCENE}.nearestSalvage.kind`)).toBe('prism');
  expect(errors).toEqual([]);
});
