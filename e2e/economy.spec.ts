import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;
const HUD = `${GAME}.scene.getScene('Hud')`;
const SALVAGE_MS = 4 * 60_000;
const DRONE_MS = 5 * 60_000;

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);
});

test('collected salvage regrows after a while, but not next to the tank', async ({ page }) => {
  const id = await read<string>(
    page,
    `(() => {
      const s = ${SCENE};
      const n = s.world.resources[0];
      s.tank.reset(n.x - 20, n.y);
      s.collect(s.resources.get(n.id).node);
      return n.id;
    })()`,
  );
  // Time is up, but the tank is right there.
  await page.evaluate(`(() => { const s = ${SCENE}; s.playTimeMs += ${SALVAGE_MS}; s.respawn(); })()`);
  expect(await read<boolean>(page, `${SCENE}.resources.has('${id}')`)).toBe(false);

  // Drive off (teleport back to the ship) and it comes back.
  await page.evaluate(`(() => { const s = ${SCENE}; s.tank.reset(s.world.spawn.x, s.world.spawn.y); s.respawn(); })()`);
  expect(await read<boolean>(page, `${SCENE}.resources.has('${id}')`)).toBe(true);
  expect(await read<boolean>(page, `${SCENE}.collected.has('${id}')`)).toBe(false);
});

test('a destroyed drone returns home later', async ({ page }) => {
  const id = await read<string>(page, `(() => { const s = ${SCENE}; const d = [...s.drones.values()][0]; s.destroyDrone(d); return d.placement.id; })()`);
  await page.evaluate(`(() => { const s = ${SCENE}; s.playTimeMs += ${DRONE_MS - 1000}; s.respawn(); })()`);
  expect(await read<boolean>(page, `${SCENE}.drones.has('${id}')`)).toBe(false);
  await page.evaluate(`(() => { const s = ${SCENE}; s.playTimeMs += 1000; s.respawn(); })()`);
  const back = await read<{ alive: boolean; x: number; y: number; hx: number; hy: number }>(
    page,
    `(() => { const s = ${SCENE}; const d = s.drones.get('${id}'); return { alive: !!d, x: d.placement.x, y: d.placement.y, hx: d.brain.home.x, hy: d.brain.home.y }; })()`,
  );
  expect(back.alive).toBe(true);
  expect([back.hx, back.hy]).toEqual([back.x, back.y]);

  // Killing it again leaves fresh drops with new ids.
  const ids = await read<string[]>(page, `(() => { const s = ${SCENE}; s.destroyDrone(s.drones.get('${id}')); return [...s.resources.keys()].filter((k) => k.startsWith('${id}@')); })()`);
  expect(ids.length).toBeGreaterThanOrEqual(1);
});

test('respawn timers survive a reload', async ({ page }) => {
  const id = await read<string>(
    page,
    `(() => {
      const s = ${SCENE};
      const n = s.world.resources[1];
      s.collect(s.resources.get(n.id).node);
      s.playTimeMs += ${SALVAGE_MS - 60_000}; // a minute to go
      s.save();
      return n.id;
    })()`,
  );
  await page.reload();
  await page.waitForFunction(`${SCENE}?.scene.isActive()`);
  await page.evaluate(`${SCENE}.respawn()`);
  expect(await read<boolean>(page, `${SCENE}.resources.has('${id}')`)).toBe(false);
  await page.evaluate(`(() => { const s = ${SCENE}; s.playTimeMs += 60_000; s.respawn(); })()`);
  expect(await read<boolean>(page, `${SCENE}.resources.has('${id}')`)).toBe(true);
});

test('play time stops while paused', async ({ page }) => {
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const before = await read<number>(page, `${SCENE}.playTimeMs`);
  await page.waitForTimeout(600);
  expect(await read<number>(page, `${SCENE}.playTimeMs`)).toBe(before);
});
