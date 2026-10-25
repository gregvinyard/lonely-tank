import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;
const HUD = `${GAME}.scene.getScene('Hud')`;

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

async function start(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
}

async function press(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
}

test('progress survives a reload', async ({ page }) => {
  await start(page);
  const setup = await read<{ node: string; picked: string; left: string; chip: { x: number; y: number } }>(
    page,
    `(() => {
      const s = ${SCENE};
      const [a, b] = [...s.drones.values()].filter((d) => d.placement.drop > 0);
      s.destroyDrone(a);
      s.destroyDrone(b);
      const node = s.world.resources[0];
      s.collect(s.resources.get(node.id).node);
      s.collect(s.resources.get(a.placement.id + '-drop').node);
      s.collect(s.resources.get(a.placement.id + '-chip').node);
      const chip = s.resources.get(b.placement.id + '-chip').node;
      s.inventory = { scrap: 9, crystal: 3, circuit: 2 };
      return { node: node.id, picked: a.placement.id, left: b.placement.id, chip: { x: chip.x, y: chip.y } };
    })()`,
  );
  // Building at the workshop saves.
  await press(page, 'e');
  await press(page, 'Space');
  expect(await read<number>(page, `${SCENE}.levels.plating`)).toBe(1);
  await press(page, 'e');

  // Leave the dock (staying in the safe zone, away from drones); closing the page saves the tank where it is.
  const parked = await read<{ x: number; y: number }>(
    page,
    `(() => { const s = ${SCENE}; const p = { x: s.world.center.x + 170, y: s.world.center.y }; s.tank.reset(p.x, p.y); s.hull = 64; s.fuel = 37.5; return p; })()`,
  );
  await page.waitForTimeout(100);
  await page.reload();
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);

  const r = await read<Record<string, unknown>>(
    page,
    `(() => {
      const s = ${SCENE};
      const chip = s.resources.get('${setup.left}-chip');
      return {
        node: s.resources.has('${setup.node}'),
        pickedDrops: s.resources.has('${setup.picked}-drop') || s.resources.has('${setup.picked}-chip'),
        leftScrap: s.resources.has('${setup.left}-drop'),
        chip: chip ? { x: chip.node.x, y: chip.node.y, kind: chip.node.kind } : null,
        drones: s.drones.size,
        plating: s.levels.plating,
        maxHull: s.maxHull,
        hull: s.hull,
        fuel: s.fuel,
        inventory: s.inventory,
        x: Math.round(s.tank.x),
        y: Math.round(s.tank.y),
        playTime: s.playTimeMs > 0,
      };
    })()`,
  );
  expect(r).toEqual({
    node: false,
    pickedDrops: false,
    leftScrap: true,
    chip: { ...setup.chip, kind: 'circuit' },
    drones: 8,
    plating: 1,
    maxHull: 125,
    hull: 64,
    fuel: 37.5,
    inventory: { scrap: 1, crystal: 1, circuit: 2 },
    x: parked.x,
    y: parked.y,
    playTime: true,
  });
});

test('a v0.1 save is migrated', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'lonely-tank.save',
      JSON.stringify({
        version: 1,
        seed: 1337,
        tank: { x: 1194, y: 1024, hull: 90, fuel: 50 },
        inventory: { scrap: 5, crystal: 1 },
        collected: ['scrap-00', 'crystal-01'],
        destroyed: ['drone-03'],
        drops: [],
        upgrades: { plating: true },
      }),
    );
  });
  await start(page);
  const r = await read<Record<string, unknown>>(
    page,
    `(() => { const s = ${SCENE}; return { plating: s.levels.plating, maxHull: s.maxHull, hull: s.hull, inventory: s.inventory, scrap00: s.resources.has('scrap-00'), crystal01: s.resources.has('crystal-01'), drone03: s.drones.has('drone-03') }; })()`,
  );
  expect(r).toEqual({ plating: 1, maxHull: 125, hull: 90, inventory: { scrap: 5, crystal: 1, circuit: 0 }, scrap00: false, crystal01: false, drone03: false });
  // Saving writes the new format.
  await page.evaluate(`${SCENE}.save()`);
  expect(await read<number>(page, `JSON.parse(localStorage.getItem('lonely-tank.save')).version`)).toBe(2);
});

test('a corrupted save is ignored and a fresh game starts', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('lonely-tank.save', '{"version":2,"seed":"oops"');
      sessionStorage.setItem('seeded', '1');
    }
  });
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  page.on('pageerror', (e) => warnings.push(`ERROR ${e.message}`));
  await start(page);

  const r = await read<Record<string, unknown>>(
    page,
    `(() => { const s = ${SCENE}; return { inventory: s.inventory, resources: s.resources.size === s.world.resources.length, drones: s.drones.size, built: Object.values(s.levels).reduce((a, b) => a + b, 0), maxHull: s.maxHull, fuel: s.fuel }; })()`,
  );
  expect(r).toEqual({ inventory: { scrap: 0, crystal: 0, circuit: 0 }, resources: true, drones: 10, built: 0, maxHull: 100, fuel: 100 });
  expect(warnings.some((w) => w.includes('unreadable save'))).toBe(true);
  expect(warnings.some((w) => w.startsWith('ERROR'))).toBe(false);
  // Docking at the start replaced the garbage with a valid save.
  expect(await read<number>(page, `JSON.parse(localStorage.getItem('lonely-tank.save')).version`)).toBe(2);
});

test('?newgame wipes the save', async ({ page }) => {
  await start(page);
  await page.evaluate(`(() => { const s = ${SCENE}; s.inventory = { scrap: 8, crystal: 2, circuit: 0 }; s.buildUpgrade('plating'); })()`);
  await start(page, '/?newgame');
  expect(await read<number>(page, `${SCENE}.levels.plating`)).toBe(0);
  expect(new URL(page.url()).search).toBe('');
});
