import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;
const HUD = `${GAME}.scene.getScene('Hud')`;
const RESPAWN_MS = 5 * 60_000;

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

test.beforeEach(async ({ page }) => {
  await page.goto('/?play&newgame');
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);
});

// Parks the tank 110 px from the first burrower with a rock-free line of fire,
// turret on target, and holds the burrower still in `mode`.
async function lineUp(page: Page, mode: 'lurk' | 'up') {
  return read<string>(
    page,
    `(() => {
      const s = ${SCENE};
      const b = [...s.burrowers.values()][0];
      b.update = () => undefined;
      b.brain = { ...b.brain, mode: '${mode}', timerMs: 1e9 };
      const R = { small: 12, medium: 22, large: 36 };
      const clear = (a) => s.world.rocks.every((r) => {
        for (let t = 0; t <= 1; t += 0.05) {
          const px = b.x - Math.cos(a) * 110 * t, py = b.y - Math.sin(a) * 110 * t;
          if (Math.hypot(r.x - px, r.y - py) < R[r.size] + 24) return false;
        }
        return true;
      });
      const a = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -3 * Math.PI / 4].find(clear);
      s.tank.reset(b.x - Math.cos(a) * 110, b.y - Math.sin(a) * 110);
      s.tank.turret.setRotation(a);
      s.tank.update = () => {};
      for (const d of s.drones.values()) d.update = () => d.sprite.body.setVelocity(0, 0);
      return b.placement.id;
    })()`,
  );
}

test('shells fly over a buried burrower', async ({ page }) => {
  const id = await lineUp(page, 'lurk');
  let shells = 0;
  await page.exposeFunction('countShot', () => shells++);
  await page.evaluate(`(() => { const s = ${SCENE}; const f = s.fire.bind(s); s.fire = (t) => { window.countShot(); f(t); }; })()`);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  expect(shells).toBeGreaterThanOrEqual(2);
  expect(await read<number>(page, `${SCENE}.burrowers.get('${id}').hp`)).toBe(2);
});

test('a surfaced burrower can be shot and drops crystal', async ({ page }) => {
  const id = await lineUp(page, 'up');
  await page.mouse.down();
  await page.waitForFunction(`!${SCENE}.burrowers.has('${id}')`, null, { timeout: 5000 });
  await page.mouse.up();
  const drop = await read<{ kind: string; amount: number } | null>(
    page,
    `(() => { const r = [...${SCENE}.resources.values()].find((r) => r.node.id.startsWith('${id}@')); return r ? { kind: r.node.kind, amount: r.node.amount } : null; })()`,
  );
  expect(drop?.kind).toBe('crystal');
  expect(drop?.amount).toBeGreaterThanOrEqual(1);
});

test('it only bites after surfacing', async ({ page }) => {
  const r = await read<{ buried: number; atWarn: number | null; after: number; max: number }>(
    page,
    `(async () => {
      const s = ${SCENE};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const b = [...s.burrowers.values()][0];
      for (const d of s.drones.values()) d.update = () => d.sprite.body.setVelocity(0, 0);
      // Sit right on top of it while it is held underground.
      const update = b.update;
      b.update = () => undefined;
      s.tank.reset(b.x, b.y);
      s.tank.update = () => {};
      await wait(500);
      const buried = s.hull;
      // Let it go: it feels the tank, warns, then bursts out.
      b.update = update;
      let atWarn = null;
      for (let i = 0; i < 80 && b.brain.mode !== 'up'; i++) {
        await wait(25);
        if (b.brain.mode === 'warn' && atWarn === null) atWarn = s.hull;
      }
      await wait(50);
      return { buried, atWarn, after: s.hull, max: s.maxHull };
    })()`,
  );
  expect(r.buried).toBe(r.max);
  expect(r.atWarn).toBe(r.max);
  expect(r.after).toBeLessThan(r.max);
});

test('the tunnel trail fades away', async ({ page }) => {
  const r = await read<{ peak: number; later: number }>(
    page,
    `(async () => {
      const s = ${SCENE};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const b = [...s.burrowers.values()][0];
      s.hull = 9999;
      s.tank.reset(b.x + 200, b.y);
      s.tank.update = () => {};
      Object.defineProperty(s.tank, 'speed', { get: () => 50, configurable: true });
      let peak = 0;
      for (let i = 0; i < 40 && peak < 6; i++) { await wait(50); peak = Math.max(peak, b.trailVisible); }
      b.update = () => undefined; // stop where it is
      await wait(3600);
      return { peak, later: b.trailVisible };
    })()`,
  );
  expect(r.peak).toBeGreaterThanOrEqual(6);
  expect(r.later).toBe(0);
});

test('a destroyed burrower stays gone across a reload, then returns', async ({ page }) => {
  const id = await read<string>(
    page,
    `(() => { const s = ${SCENE}; const b = [...s.burrowers.values()][0]; s.destroyBurrower(b); s.save(); return b.placement.id; })()`,
  );
  await page.reload();
  await page.waitForFunction(`${SCENE}?.scene.isActive()`);
  expect(await read<boolean>(page, `${SCENE}.burrowers.has('${id}')`)).toBe(false);
  expect(await read<number>(page, `${SCENE}.burrowers.size`)).toBe(4);
  await page.evaluate(`(() => { const s = ${SCENE}; s.playTimeMs += ${RESPAWN_MS}; s.tank.reset(s.world.spawn.x, s.world.spawn.y); s.respawn(); })()`);
  expect(await read<boolean>(page, `${SCENE}.burrowers.has('${id}')`)).toBe(true);
});
