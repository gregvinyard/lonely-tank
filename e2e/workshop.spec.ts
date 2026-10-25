import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;
const HUD = `${GAME}.scene.getScene('Hud')`;
const RICH = `{ scrap: 500, crystal: 500, circuit: 500 }`;

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

async function press(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
}

/** Screen position (CSS px) of a HUD object's center. */
async function screenCenter(page: Page, expr: string) {
  const box = (await page.locator('canvas').boundingBox())!;
  const c = await read<{ x: number; y: number }>(
    page,
    `(() => { const b = ${expr}.getBounds(); const z = ${GAME}.scale.zoom; return { x: b.centerX * z, y: b.centerY * z }; })()`,
  );
  return { x: box.x + c.x, y: box.y + c.y };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
});

test('services: E opens the workshop, 1 refuels, 2 repairs', async ({ page }) => {
  expect(await read<string>(page, `${HUD}.promptText.text`)).toBe('[E] OPEN WORKSHOP');
  await press(page, 'e');
  expect(await read<boolean>(page, `${HUD}.workshop.visible`)).toBe(true);
  await page.evaluate(`(() => { const s = ${SCENE}; s.fuel = 40; s.hull = 50; s.inventory = { scrap: 4, crystal: 0, circuit: 0 }; })()`);
  await press(page, '1');
  await press(page, '2');
  expect(await read(page, `(() => { const s = ${SCENE}; return [s.fuel, s.hull, s.inventory.scrap]; })()`)).toEqual([100, 75, 1]);
});

test('keyboard: select a card and build it with Space', async ({ page }) => {
  await press(page, 'e');
  await page.evaluate(`${SCENE}.inventory = { scrap: 8, crystal: 2, circuit: 0 }`);
  await press(page, 'Space'); // plating is selected first
  const r = await read<Record<string, unknown>>(
    page,
    `(() => { const s = ${SCENE}; return { plating: s.levels.plating, maxHull: s.maxHull, hull: s.hull, inventory: s.inventory, banner: ${HUD}.banner.visible && ${HUD}.bannerText.text, goal: ${HUD}.goal.text.text }; })()`,
  );
  expect(r).toMatchObject({ plating: 1, maxHull: 125, hull: 125, inventory: { scrap: 0, crystal: 0, circuit: 0 } });
  expect(r.banner).toContain('REINFORCED PLATING 1 BUILT');
  expect(r.goal).toBe('GOAL: REACH TIER 2 IN ANY UPGRADE');
  expect(await read<string>(page, `${HUD}.toast.visible && ${HUD}.toast.text.text`)).toBe('GOAL COMPLETE!');

  // Not enough for tier 2: nothing is spent.
  await press(page, 'Space');
  expect(await read<number>(page, `${SCENE}.levels.plating`)).toBe(1);
  expect(await read<string>(page, `${HUD}.workshopMessage.text`)).toContain('NEED 14 SCRAP');
});

test('a locked line explains its requirement', async ({ page }) => {
  await press(page, 'e');
  await page.evaluate(`${SCENE}.inventory = ${RICH}`);
  // AP shells: second row, second column.
  await press(page, 'ArrowDown');
  await press(page, 'ArrowRight');
  expect(await read<string>(page, `${HUD}.workshop.cards[${HUD}.workshop.selected].def.id`)).toBe('apShells');
  await press(page, 'Space');
  expect(await read<number>(page, `${SCENE}.levels.apShells`)).toBe(0);
  expect(await read<string>(page, `${HUD}.workshopMessage.text`)).toBe('NEEDS AUTOLOADER 1');
});

test('mouse: click a card, then Build, without firing the cannon', async ({ page }) => {
  await press(page, 'e');
  await page.evaluate(`${SCENE}.inventory = ${RICH}`);
  const shells = await read<number>(page, `${SCENE}.shells.getLength()`);
  const card = await screenCenter(page, `${HUD}.workshop.cards[2].bg`); // engine
  await page.mouse.click(card.x, card.y);
  await page.waitForTimeout(80);
  expect(await read<number>(page, `${HUD}.workshop.selected`)).toBe(2);
  const build = await screenCenter(page, `${HUD}.workshop.buildButton.bg`);
  await page.mouse.click(build.x, build.y);
  await page.waitForTimeout(120);
  expect(await read<number>(page, `${SCENE}.levels.engine`)).toBe(1);
  expect(await read<number>(page, `${SCENE}.shells.getLength()`)).toBe(shells);
});

test('upgrades change how the tank drives and shoots', async ({ page }) => {
  await page.evaluate(`(() => {
    const s = ${SCENE};
    s.inventory = ${RICH};
    for (const id of ['engine', 'engine', 'engine', 'autoloader', 'barrel', 'autoloader', 'apShells', 'apShells']) s.buildUpgrade(id);
    s.tank.reset(s.world.spawn.x, s.world.spawn.y);
  })()`);
  const st = await read<Record<string, number>>(page, `${SCENE}.stats`);
  expect(st.damage).toBe(3);
  expect(st.cooldownMs).toBe(Math.round(420 * 0.7));

  // Full throttle reaches the upgraded top speed (driving away from the ship, inside the rock-free clearing).
  await page.keyboard.down('s');
  await page.waitForTimeout(600);
  const speed = await read<number>(page, `${SCENE}.tank.speed`);
  await page.keyboard.up('s');
  expect(speed).toBeGreaterThan(200);

  // One AP shell destroys a drone (3 hp).
  const id = await read<string>(page, `(() => { const s = ${SCENE}; const d = [...s.drones.values()][0]; s.onShellHit({ active: true, x: d.x, y: d.y, destroy() {} }, d); return d.placement.id; })()`);
  expect(await read<boolean>(page, `${SCENE}.drones.has('${id}')`)).toBe(false);
  expect(await read<boolean>(page, `[...${SCENE}.resources.keys()].some((k) => k.startsWith('${id}@') && k.endsWith('-chip'))`)).toBe(true);
});

test('field repair mends the hull at rest, after a calm period', async ({ page }) => {
  await page.evaluate(`(() => { const s = ${SCENE}; s.inventory = ${RICH}; s.buildUpgrade('plating'); s.buildUpgrade('repairKit'); s.buildUpgrade('repairKit'); s.hull = 50; })()`);
  await page.waitForTimeout(1500);
  expect(await read<number>(page, `${SCENE}.hull`)).toBeGreaterThan(51);
});

test('the whole tree can be built to the top of the goal ladder', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const built = await read<number>(
    page,
    `(() => {
      const s = ${SCENE};
      s.inventory = { scrap: 9999, crystal: 9999, circuit: 9999 };
      let n = 0;
      // Keep building until nothing more can be built (respects requirements by retrying).
      for (let pass = 0; pass < 5; pass++) for (const id of Object.keys(s.levels)) while (s.levels[id] < 3) { const before = s.levels[id]; s.buildUpgrade(id); if (s.levels[id] === before) break; n++; }
      return n;
    })()`,
  );
  await page.waitForTimeout(100);
  expect(built).toBe(20);
  expect(await read<string>(page, `${HUD}.goal.text.text`)).toBe('FULLY UPGRADED · EXPLORE FREELY');
  expect(await read<Record<string, number>>(page, `${SCENE}.stats`)).toMatchObject({ maxHull: 175, maxFuel: 220, damage: 3, scanner: 2 });
  expect(errors).toEqual([]);
});

test('clicks where the closed workshop buttons were do nothing', async ({ page }) => {
  await press(page, 'e');
  const spots = [
    await screenCenter(page, `${HUD}.workshop.buildButton.bg`),
    await screenCenter(page, `${HUD}.workshop.services[0].bg`),
  ];
  await press(page, 'e');
  await page.evaluate(`(() => { const s = ${SCENE}; s.inventory = ${RICH}; s.fuel = 30; s.tank.reset(s.world.center.x + 170, s.world.center.y); })()`);
  await page.waitForTimeout(100);
  for (const p of spots) await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(100);
  expect(await read<number>(page, `Object.values(${SCENE}.levels).reduce((a, b) => a + b, 0)`)).toBe(0);
  expect(await read<number>(page, `${SCENE}.fuel`)).toBe(30);
});
