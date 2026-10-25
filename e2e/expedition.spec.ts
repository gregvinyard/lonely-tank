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

/** Presses a key and lets the game run a couple of frames. */
async function press(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
}

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
    s.inventory = { scrap: 4, crystal: 2 };
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
  expect(r.inventory).toEqual({ scrap: 3, crystal: 2 });
  expect(r.d).toBeLessThan(10);
  expect(r.text).toContain('OUT OF FUEL');
});

test('the workshop refuels, repairs and crafts the plating once', async ({ page }) => {
  await start(page);
  expect(await read<string>(page, `${HUD}.promptText.text`)).toBe('[E] OPEN WORKSHOP');
  await press(page, 'e');
  expect(await read<boolean>(page, `${SCENE}.workshopOpen`)).toBe(true);
  expect(await read<boolean>(page, `${HUD}.workshop.visible`)).toBe(true);

  await page.evaluate(`(() => { const s = ${SCENE}; s.fuel = 40; s.hull = 50; s.inventory = { scrap: 11, crystal: 2 }; })()`);
  await press(page, '1');
  expect(await read<number>(page, `${SCENE}.fuel`)).toBe(100);
  await press(page, '2');
  expect(await read(page, `(() => { const s = ${SCENE}; return [s.hull, s.inventory.scrap]; })()`)).toEqual([75, 8]);

  // Craft by clicking the plating row; the click must not fire the cannon.
  const shellsBefore = await read<number>(page, `${SCENE}.shells.getLength()`);
  const box = (await page.locator('canvas').boundingBox())!;
  const row = await read<{ x: number; y: number }>(page, `(() => {
    const b = ${HUD}.rows[2].bg.getBounds();
    const z = ${GAME}.scale.zoom;
    return { x: b.centerX * z, y: b.centerY * z };
  })()`);
  await page.mouse.click(box.x + row.x, box.y + row.y);
  await page.waitForTimeout(150);

  const after = await read<{ plating: boolean; maxHull: number; hull: number; inventory: object; shells: number; banner: string }>(
    page,
    `(() => { const s = ${SCENE}; return { plating: s.plating, maxHull: s.maxHull, hull: s.hull, inventory: s.inventory, shells: s.shells.getLength(), banner: ${HUD}.banner.visible && ${HUD}.bannerText.text }; })()`,
  );
  expect(after).toMatchObject({ plating: true, maxHull: 125, hull: 100, inventory: { scrap: 0, crystal: 0 }, shells: shellsBefore });
  expect(after.banner).toContain('REINFORCED PLATING INSTALLED');
  expect(await read<number>(page, `${HUD}.hullBar.bg.width`)).toBe(62); // 60 px bar + border
  expect(await read<string>(page, `${HUD}.goal.text.text`)).toContain('PLATING INSTALLED');

  await page.evaluate(`${SCENE}.inventory = { scrap: 20, crystal: 20 }`);
  await press(page, '3');
  expect(await read<string>(page, `${HUD}.workshopMessage.text`)).toBe('PLATING ALREADY INSTALLED');
  expect(await read<number>(page, `${SCENE}.inventory.scrap`)).toBe(20);

  await press(page, 'Escape');
  expect(await read<boolean>(page, `${SCENE}.workshopOpen`)).toBe(false);
});

test('the tank cannot drive while the workshop is open', async ({ page }) => {
  await start(page);
  await press(page, 'e');
  const before = await read<{ x: number; y: number }>(page, `({ x: ${SCENE}.tank.x, y: ${SCENE}.tank.y })`);
  await page.keyboard.down('s');
  await page.waitForTimeout(500);
  await page.keyboard.up('s');
  const after = await read<{ x: number; y: number }>(page, `({ x: ${SCENE}.tank.x, y: ${SCENE}.tank.y })`);
  expect(after).toEqual(before);
});

test('progress survives a reload', async ({ page }) => {
  await start(page);
  const setup = await read<{ node: string; picked: string; left: { id: string; x: number; y: number } }>(
    page,
    `(() => {
      const s = ${SCENE};
      const [a, b] = [...s.drones.values()].filter((d) => d.placement.drop > 0);
      s.destroyDrone(a);
      s.destroyDrone(b);
      const node = s.world.resources[0];
      s.collect(s.resources.get(node.id).node);
      s.collect(s.resources.get(a.placement.id + '-drop').node);
      const left = s.resources.get(b.placement.id + '-drop').node;
      // Enough salvage for the plating, plus a bit.
      s.inventory = { scrap: 9, crystal: 3 };
      return { node: node.id, picked: a.placement.id, left: { id: left.id, x: left.x, y: left.y, a: a.placement.id, b: b.placement.id } };
    })()`,
  );
  // Crafting at the workshop saves.
  await press(page, 'e');
  await press(page, '3');
  expect(await read<boolean>(page, `${SCENE}.plating`)).toBe(true);
  await press(page, 'e');

  // Leave the ship; closing the page saves the tank where it is.
  await page.evaluate(`(() => { const s = ${SCENE}; s.tank.reset(700, 820); s.hull = 64; s.fuel = 37.5; })()`);
  await page.waitForTimeout(100);
  await page.reload();
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);

  const r = await read<Record<string, unknown>>(
    page,
    `(() => {
      const s = ${SCENE};
      const left = s.resources.get('${setup.left.id}');
      return {
        node: s.resources.has('${setup.node}'),
        pickedDrop: s.resources.has('${setup.picked}-drop'),
        pickedDrone: s.drones.has('${setup.picked}'),
        leftDrop: left ? { x: left.node.x, y: left.node.y } : null,
        leftDrone: s.drones.has('${setup.left.id.replace('-drop', '')}'),
        drones: s.drones.size,
        plating: s.plating,
        maxHull: s.maxHull,
        hull: s.hull,
        fuel: s.fuel,
        inventory: s.inventory,
        x: Math.round(s.tank.x),
        y: Math.round(s.tank.y),
        goal: ${HUD}.goal.text.text,
      };
    })()`,
  );
  expect(r).toEqual({
    node: false,
    pickedDrop: false,
    pickedDrone: false,
    leftDrop: { x: setup.left.x, y: setup.left.y },
    leftDrone: false,
    drones: 8,
    plating: true,
    maxHull: 125,
    hull: 64,
    fuel: 37.5,
    inventory: { scrap: 1, crystal: 1 },
    x: 700,
    y: 820,
    goal: 'PLATING INSTALLED · EXPLORE FREELY',
  });
});

test('a corrupted save is ignored and a fresh game starts', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('lonely-tank.save', '{"version":1,"seed":"oops"');
      sessionStorage.setItem('seeded', '1');
    }
  });
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  page.on('pageerror', (e) => warnings.push(`ERROR ${e.message}`));
  await start(page);

  const r = await read<Record<string, unknown>>(
    page,
    `(() => { const s = ${SCENE}; return { inventory: s.inventory, resources: s.resources.size === s.world.resources.length, drones: s.drones.size, plating: s.plating, maxHull: s.maxHull, fuel: s.fuel }; })()`,
  );
  expect(r).toEqual({ inventory: { scrap: 0, crystal: 0 }, resources: true, drones: 10, plating: false, maxHull: 100, fuel: 100 });
  expect(warnings.some((w) => w.includes('unreadable save'))).toBe(true);
  expect(warnings.some((w) => w.startsWith('ERROR'))).toBe(false);
  // Docking at the start replaced the garbage with a valid save.
  expect(await read<number>(page, `JSON.parse(localStorage.getItem('lonely-tank.save')).version`)).toBe(1);
});

test('?newgame wipes the save', async ({ page }) => {
  await start(page);
  await page.evaluate(`(() => { const s = ${SCENE}; s.inventory = { scrap: 8, crystal: 2 }; s.workshopAction('plating'); })()`);
  await start(page, '/?newgame');
  expect(await read<boolean>(page, `${SCENE}.plating`)).toBe(false);
  expect(new URL(page.url()).search).toBe('');
});
