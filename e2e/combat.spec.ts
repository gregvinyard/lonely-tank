import { expect, test } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(`${SCENE}?.scene.isActive()`);
});

test('holding the mouse fires shells that destroy a drone and leave salvage', async ({ page }) => {
  // Park the tank 120px left of a drone that drops scrap, with the turret pointed at it.
  const drone = (await page.evaluate(`(() => {
    const s = ${SCENE};
    const d = [...s.drones.values()].find((d) => d.placement.drop > 0);
    // Freeze it so the test doesn't depend on patrol timing.
    d.update = () => d.sprite.body.setVelocity(0, 0);
    d.sprite.body.setVelocity(0, 0);
    // Pick an approach direction with no rock near the line of fire.
    const clear = (a) => s.world.rocks.every((r) => {
      for (let t = 0; t <= 1; t += 0.05) {
        const px = d.x - Math.cos(a) * 120 * t, py = d.y - Math.sin(a) * 120 * t;
        if (Math.hypot(r.x - px, r.y - py) < 40) return false;
      }
      return true;
    });
    const a = [0, Math.PI / 2, Math.PI, -Math.PI / 2].find(clear);
    s.tank.reset(d.x - Math.cos(a) * 120, d.y - Math.sin(a) * 120);
    s.tank.turret.setRotation(a);
    s.tank.update = () => {}; // keep aim fixed
    return { id: d.placement.id, drop: d.placement.drop };
  })()`)) as { id: string; drop: number };

  await page.mouse.down();
  await page.waitForFunction(`!${SCENE}.drones.has('${drone.id}')`, null, { timeout: 5000 });
  await page.mouse.up();

  expect(await page.evaluate(`${SCENE}.resources.has('${drone.id}-drop')`)).toBe(true);
});

test('fire rate is limited by the cooldown', async ({ page }) => {
  await page.evaluate(`(() => { const s = ${SCENE}; s.tank.update = () => {}; s.tank.turret.setRotation(-Math.PI / 2); })()`);
  await page.mouse.move(640, 100);
  const before = (await page.evaluate(`${GAME}.loop.time`)) as number;
  let shots = 0;
  await page.exposeFunction('countShot', () => shots++);
  await page.evaluate(`(() => {
    const s = ${SCENE};
    const orig = s.fire.bind(s);
    s.fire = (t) => { window.countShot(); orig(t); };
  })()`);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
  const elapsed = ((await page.evaluate(`${GAME}.loop.time`)) as number) - before;
  // 420ms cooldown: at most ceil(elapsed / 420) + 1 shots.
  expect(shots).toBeGreaterThanOrEqual(2);
  expect(shots).toBeLessThanOrEqual(Math.ceil(elapsed / 420) + 1);
});

test('a drone ramming a nearly destroyed tank triggers a rescue with salvage loss', async ({ page }) => {
  const result = (await page.evaluate(`(async () => {
    const s = ${SCENE};
    s.inventory = { scrap: 8, crystal: 4, circuit: 4 };
    s.hull = 5;
    const d = [...s.drones.values()][0];
    s.tank.reset(d.x + 20, d.y);
    await new Promise((r) => setTimeout(r, 500));
    return { hull: s.hull, inventory: s.inventory, x: s.tank.x, y: s.tank.y, spawn: s.world.spawn };
  })()`)) as { hull: number; inventory: { scrap: number; crystal: number }; x: number; y: number; spawn: { x: number; y: number } };

  expect(result.hull).toBe(100);
  expect(result.inventory).toEqual({ scrap: 6, crystal: 3, circuit: 3 });
  expect(Math.hypot(result.x - result.spawn.x, result.y - result.spawn.y)).toBeLessThan(4);
  expect(await page.evaluate(`${GAME}.scene.getScene('Hud').banner.visible`)).toBe(true);
});

test('drones never enter the safe zone', async ({ page }) => {
  // Lure a drone at the zone edge, then sit inside: it must stay out.
  const inside = (await page.evaluate(`(async () => {
    const s = ${SCENE};
    const c = s.world.center;
    const d = [...s.drones.values()][0];
    const a = Math.atan2(d.y - c.y, d.x - c.x);
    d.sprite.body.reset(c.x + Math.cos(a) * 240, c.y + Math.sin(a) * 240);
    d.brain = { ...d.brain, mode: 'chase' };
    s.tank.reset(c.x + Math.cos(a) * 150, c.y + Math.sin(a) * 150);
    let minDist = Infinity;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 25));
      minDist = Math.min(minDist, Math.hypot(d.x - c.x, d.y - c.y));
    }
    return minDist;
  })()`)) as number;
  expect(inside).toBeGreaterThanOrEqual(200);
});

test('resizing the window keeps one pixel grid and the HUD on screen', async ({ page }) => {
  for (const [w, h, zoom] of [[1920, 1080, 3], [800, 600, 2], [1280, 720, 2]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(200);
    const s = (await page.evaluate(`(() => {
      const g = ${GAME};
      const hud = g.scene.getScene('Hud');
      return { zoom: g.scale.zoom, width: g.scale.width, height: g.scale.height, hintY: hud.hint.y };
    })()`)) as { zoom: number; width: number; height: number; hintY: number };
    expect(s.zoom).toBe(zoom);
    expect(s.width).toBe(Math.ceil(w / zoom));
    expect(s.height).toBe(Math.ceil(h / zoom));
    expect(s.hintY).toBeLessThan(s.height);
  }
});
