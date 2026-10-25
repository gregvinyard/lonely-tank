import { expect, test, type Page } from '@playwright/test';

// Reads tank state straight out of the running Phaser game.
async function tankState(page: Page) {
  return page.evaluate(() => {
    const scene = (window as any).__LT_GAME__.scene.getScene('Game');
    const t = scene.tank;
    return { x: t.hull.x, y: t.hull.y, hullRot: t.hull.rotation, turretRot: t.turret.rotation };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__LT_GAME__?.scene.isActive('Game'));
  await page.locator('canvas').click({ position: { x: 640, y: 360 } });
});

test('WASD drives the tank and the hull turns to face travel', async ({ page }) => {
  const start = await tankState(page);

  await page.keyboard.down('s');
  await page.waitForTimeout(700);
  await page.keyboard.up('s');
  await page.waitForTimeout(400);

  const end = await tankState(page);
  expect(end.y - start.y).toBeGreaterThan(50);
  expect(Math.abs(end.x - start.x)).toBeLessThan(2);
  expect(end.hullRot).toBeCloseTo(Math.PI / 2, 1);
  await page.screenshot({ path: 'test-results/drive.png' });
});

test('turret aims at the mouse independently of the hull', async ({ page }) => {
  // Tank starts centered on screen; put the cursor straight above it.
  await page.mouse.move(640, 100);
  await page.waitForTimeout(500);
  const s = await tankState(page);
  expect(s.turretRot).toBeCloseTo(-Math.PI / 2, 1);
  expect(s.hullRot).toBeCloseTo(0, 5);
});

test('rocks block the tank', async ({ page }) => {
  // Drive toward the nearest rock and confirm we stop short of its center.
  const target = await page.evaluate(() => {
    const scene = (window as any).__LT_GAME__.scene.getScene('Game');
    const t = scene.tank.hull;
    const rocks = Array.from(scene.physics.world.staticBodies as Set<any>)
      .filter((b: any) => b.gameObject.texture.key.startsWith('rock'))
      .map((b: any) => ({ x: b.center.x, y: b.center.y, radius: b.radius }));
    rocks.sort((a: any, b: any) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y));
    const r = rocks[0];
    // Teleport onto a straight horizontal line 120px left of the rock.
    t.body.reset(r.x - 120, r.y);
    return r;
  });

  await page.keyboard.down('d');
  await page.waitForTimeout(2000);
  await page.keyboard.up('d');

  const s = await tankState(page);
  // Rock radius + tank radius 20 => centers can't get much closer than that.
  expect(target.x - s.x).toBeGreaterThan(target.radius + 20 - 4);
});
