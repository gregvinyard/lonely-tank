import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;
const HUD = `${GAME}.scene.getScene('Hud')`;

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

test.beforeEach(async ({ page }) => {
  await page.goto('/?play&newgame');
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
});

test('the cargo door opens as the tank comes near and shuts when it leaves', async ({ page }) => {
  // The tank starts just outside the door: it's open.
  await page.waitForFunction(`${SCENE}.doorOpen === 1`);
  // West along the ship's tail, out of range.
  await page.evaluate(`${SCENE}.tank.reset(${SCENE}.world.spawn.x - 160, ${SCENE}.world.spawn.y + 20)`);
  await page.waitForFunction(`${SCENE}.doorOpen === 0`, null, { timeout: 3000 });
  expect(await read<boolean>(page, `${SCENE}.door.visible`)).toBe(true);
  await page.evaluate(`${SCENE}.tank.reset(${SCENE}.world.spawn.x, ${SCENE}.world.spawn.y)`);
  await page.waitForFunction(`${SCENE}.doorOpen === 1`, null, { timeout: 3000 });
  expect(await read<boolean>(page, `${SCENE}.door.visible`)).toBe(false);
});

test('driving into the door takes the tank inside, opens the menu and calms the drones', async ({ page }) => {
  // A drone hunting the tank from right outside.
  await page.evaluate(`(() => {
    const s = ${SCENE};
    const d = [...s.drones.values()][0];
    d.sprite.body.reset(s.world.spawn.x + 120, s.world.spawn.y + 60);
    d.alert();
  })()`);
  await page.keyboard.down('w');
  await page.waitForFunction(`${SCENE}.shipState !== 'outside'`, null, { timeout: 4000 });
  await page.keyboard.up('w');
  // Nothing can touch it on the way in, either.
  expect(await read<number>(page, `(() => { const s = ${SCENE}; const h = s.hull; s.damageTank(50, s.tank); return s.hull - h; })()`)).toBe(0);
  await page.waitForFunction(`${SCENE}.workshopOpen && ${HUD}.workshop.visible`, null, { timeout: 4000 });
  const r = await read<Record<string, unknown>>(
    page,
    `(() => {
      const s = ${SCENE};
      const c = s.world.center;
      const rel = { x: s.tank.x - c.x, y: s.tank.y - c.y };
      const parked = Math.abs(rel.x - s.shipLayout.hold.x) < 1 && Math.abs(rel.y - s.shipLayout.hold.y) < 1;
      return { state: s.shipState, menu: ${HUD}.workshop.visible, parked, doorShut: s.doorOpen === 0, body: s.tank.hull.body.enable, drone: [...s.drones.values()][0].brain.mode };
    })()`,
  );
  expect(r).toEqual({ state: 'inside', menu: true, parked: true, doorShut: true, body: false, drone: 'return' });
});

test('leaving the menu drives the tank back out, facing away from the ship', async ({ page }) => {
  await page.keyboard.press('e');
  await page.waitForFunction(`${SCENE}.workshopOpen && ${HUD}.workshop.visible`, null, { timeout: 5000 });
  const z = await read<number>(page, `${GAME}.scale.zoom`);
  const box = (await page.locator('canvas').boundingBox())!;
  const shells = await read<number>(page, `${SCENE}.shells.getLength()`);
  // The Leave ship button, with the mouse.
  const b = await read<{ centerX: number; centerY: number }>(page, `(() => { const b = ${HUD}.workshop.exitButton.bg.getBounds(); return { centerX: b.centerX, centerY: b.centerY }; })()`);
  await page.mouse.click(box.x + b.centerX * z, box.y + b.centerY * z);
  await page.waitForFunction(`${SCENE}.shipState === 'outside'`, null, { timeout: 5000 });
  const out = await read<{ x: number; y: number; rot: number; spawn: { x: number; y: number }; body: boolean }>(
    page,
    `(() => { const s = ${SCENE}; return { x: s.tank.x, y: s.tank.y, rot: s.tank.hull.rotation, spawn: s.world.spawn, body: s.tank.hull.body.enable }; })()`,
  );
  expect(Math.hypot(out.x - out.spawn.x, out.y - out.spawn.y)).toBeLessThan(2);
  expect(out.rot).toBeCloseTo(Math.PI / 2, 1); // facing south, away from the door
  expect(out.body).toBe(true);
  // The click didn't fire the cannon on the way out.
  expect(await read<number>(page, `${SCENE}.shells.getLength()`)).toBe(shells);
  // Back in control.
  await page.keyboard.down('a');
  await page.waitForTimeout(500);
  await page.keyboard.up('a');
  expect(await read<number>(page, `${SCENE}.tank.x`)).toBeLessThan(out.x - 20);
});

test('the hull is solid everywhere but the door', async ({ page }) => {
  // Drive east into the ship's left wing and on toward the fuselage.
  await page.evaluate(`${SCENE}.tank.reset(${SCENE}.world.center.x - 190, ${SCENE}.world.center.y + 20)`);
  await page.keyboard.down('d');
  await page.waitForTimeout(1500);
  await page.keyboard.up('d');
  const after = await read<{ overlaps: number; state: string }>(
    page,
    `(() => {
      const s = ${SCENE};
      const c = s.world.center;
      const hull = s.shipLayout.hull;
      const rel = { x: s.tank.x - c.x, y: s.tank.y - c.y };
      return { overlaps: hull.filter((h) => Math.hypot(rel.x - h.x, rel.y - h.y) < h.r + 20 - 2).length, state: s.shipState };
    })()`,
  );
  expect(after).toEqual({ overlaps: 0, state: 'outside' });
});

test('an old save with the tank parked where the ship now is loads it outside', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const none = { plating: 0, fuelTanks: 0, engine: 0, autoloader: 0, barrel: 0, apShells: 0, scanner: 0, repairKit: 0 };
    localStorage.setItem(
      'lonely-tank.save',
      JSON.stringify({
        version: 2,
        seed: 1337,
        playTimeMs: 1000,
        tank: { x: 1024, y: 1134, hull: 80, fuel: 60 },
        inventory: { scrap: 3, crystal: 1, circuit: 0 },
        collected: [],
        destroyed: [],
        drops: [],
        upgrades: none,
      }),
    );
  });
  await page.goto('/?play');
  await page.waitForFunction(`${SCENE}?.scene.isActive()`);
  const r = await read<{ x: number; y: number; spawn: { x: number; y: number }; hull: number }>(
    page,
    `(() => { const s = ${SCENE}; return { x: s.tank.x, y: s.tank.y, spawn: s.world.spawn, hull: s.hull }; })()`,
  );
  expect(r.hull).toBe(80);
  // Saved before the hybrid drive: the battery starts full.
  expect(await read<number>(page, `${SCENE}.battery`)).toBe(20);
  expect(Math.hypot(r.x - r.spawn.x, r.y - r.spawn.y)).toBeLessThan(2);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  expect(await read<number>(page, `${SCENE}.tank.x`)).toBeGreaterThan(r.x + 20);
});

test('saving from inside the ship stores the spot outside the door', async ({ page }) => {
  await page.keyboard.press('e');
  await page.waitForFunction(`${SCENE}.workshopOpen && ${HUD}.workshop.visible`, null, { timeout: 5000 });
  const r = await read<{ saved: { x: number; y: number }; spawn: { x: number; y: number } }>(
    page,
    `(() => { const s = ${SCENE}; s.save(); return { saved: JSON.parse(localStorage.getItem('lonely-tank.save')).tank, spawn: s.world.spawn }; })()`,
  );
  expect([r.saved.x, r.saved.y]).toEqual([r.spawn.x, r.spawn.y]);
});
