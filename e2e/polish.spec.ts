import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;
const HUD = `${GAME}.scene.getScene('Hud')`;

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
});

test('Esc pauses everything and resumes', async ({ page }) => {
  // Out in the open with a drone chasing, so there's something to freeze.
  await page.evaluate(`(() => {
    const s = ${SCENE};
    const d = [...s.drones.values()][0];
    s.tank.reset(d.x + 120, d.y);
  })()`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  expect(await read<boolean>(page, `${HUD}.pauseMenu.visible`)).toBe(true);

  const snap = `(() => { const s = ${SCENE}; const d = [...s.drones.values()][0]; return { fuel: s.fuel, tx: s.tank.x, ty: s.tank.y, dx: d.x, dy: d.y }; })()`;
  const before = await read<Record<string, number>>(page, snap);
  await page.keyboard.down('d');
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  expect(await read(page, snap)).toEqual(before);

  // E does nothing while paused, even pressed in the same frame as Esc.
  await page.keyboard.press('e');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  expect(await read<boolean>(page, `${HUD}.pauseMenu.visible`)).toBe(false);
  expect(await read<boolean>(page, `${SCENE}.scene.isActive()`)).toBe(true);

  // Drive toward the middle of the map, where there's room.
  const toward = before.tx > 1024 ? 'a' : 'd';
  await page.keyboard.down(toward);
  await page.waitForTimeout(400);
  await page.keyboard.up(toward);
  expect(Math.abs((await read<number>(page, `${SCENE}.tank.x`)) - before.tx)).toBeGreaterThan(10);
});

test('Esc with the workshop open only closes the workshop', async ({ page }) => {
  await page.keyboard.press('e');
  await page.waitForTimeout(80);
  expect(await read<boolean>(page, `${SCENE}.workshopOpen`)).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  expect(await read<boolean>(page, `${SCENE}.workshopOpen`)).toBe(false);
  expect(await read<boolean>(page, `${HUD}.paused`)).toBe(false);
  expect(await read<boolean>(page, `${HUD}.pauseMenu.visible`)).toBe(false);
});

test('mute is remembered across reloads', async ({ page }) => {
  await page.keyboard.press('m');
  expect(await page.evaluate(() => localStorage.getItem('lonely-tank.muted'))).toBe('1');
  await page.reload();
  await page.waitForFunction(`${HUD}?.scene.isActive()`);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('m');
  expect(await page.evaluate(() => localStorage.getItem('lonely-tank.muted'))).toBe('0');
});

test('ground and rock art load from files and rocks collide where they are drawn', async ({ page }) => {
  const r = await read<{ sources: string[]; variants: string[]; offCenter: number }>(
    page,
    `(() => {
      const s = ${SCENE};
      const src = (k) => s.textures.get(k).getSourceImage();
      const rocks = [...s.physics.world.staticBodies].filter((b) => b.gameObject.texture.key.startsWith('rock'));
      return {
        // Loaded PNGs are images; placeholders are canvases drawn at boot.
        sources: ['terrain_ground', 'rock', 'rock_2', 'rock_3'].map((k) => (src(k) instanceof HTMLImageElement ? 'png' : 'placeholder')),
        variants: [...new Set(rocks.map((b) => b.gameObject.texture.key))].sort(),
        offCenter: Math.max(...rocks.map((b) => Math.hypot(b.center.x - b.gameObject.x, b.center.y - b.gameObject.y))),
      };
    })()`,
  );
  expect(r.sources).toEqual(['png', 'png', 'png', 'png']);
  expect(r.variants).toEqual(['rock', 'rock_2', 'rock_3']);
  expect(r.offCenter).toBeLessThan(0.5);
});
