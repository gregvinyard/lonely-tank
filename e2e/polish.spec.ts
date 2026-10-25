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

test('Esc in the ship leaves it instead of pausing', async ({ page }) => {
  await page.keyboard.press('e');
  await page.waitForFunction(`${SCENE}.workshopOpen && ${HUD}.workshop.visible`, null, { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  expect(await read<boolean>(page, `${SCENE}.workshopOpen`)).toBe(false);
  expect(await read<string>(page, `${SCENE}.shipState`)).toBe('exiting');
  expect(await read<boolean>(page, `${HUD}.paused`)).toBe(false);
  expect(await read<boolean>(page, `${HUD}.pauseMenu.visible`)).toBe(false);
  await page.waitForFunction(`${SCENE}.shipState === 'outside'`, null, { timeout: 5000 });
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
  const r = await read<{ sources: { count: number; placeholders: string[] }; variants: string[]; offCenter: number }>(
    page,
    `(() => {
      const s = ${SCENE};
      const src = (k) => s.textures.get(k).getSourceImage();
      const rocks = [...s.physics.world.staticBodies].filter((b) => b.gameObject.texture.key.startsWith('rock'));
      return {
        // Every manifest entry with a file must load as an image (placeholders are canvases drawn at boot).
        sources: (() => {
          const keys = s.textures.getTextureKeys().filter((k) => /^(terrain_ground|rock|up_|circuit|scrap|crystal|drone|spaceship|ship_door|ship_bay|solar_panel|tank_|burrower$|mound$)/.test(k));
          return { count: keys.length, placeholders: keys.filter((k) => !(src(k) instanceof HTMLImageElement)) };
        })(),
        variants: [...new Set(rocks.map((b) => b.gameObject.texture.key))].sort(),
        offCenter: Math.max(...rocks.map((b) => Math.hypot(b.center.x - b.gameObject.x, b.center.y - b.gameObject.y))),
      };
    })()`,
  );
  // One texture per PNG in public/assets, none of them a fallback placeholder.
  expect(r.sources).toEqual({ count: 28, placeholders: [] });
  expect(r.variants).toEqual(['rock', 'rock_2', 'rock_3', 'rock_l1', 'rock_l2', 'rock_s1', 'rock_s2']);
  expect(r.offCenter).toBeLessThan(0.5);
});

test('HUD widgets sit on whole pixels', async ({ page }) => {
  await page.keyboard.press('e'); // workshop open, prompt hidden
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const off = await read<string[]>(
    page,
    `(() => {
      const bad = [];
      const walk = (o, ox, oy, path) => {
        const x = ox + o.x, y = oy + o.y;
        if (o.visible && (!Number.isInteger(x) || !Number.isInteger(y))) bad.push(path + ' ' + x + ',' + y);
        if (o.list) o.list.forEach((c, i) => walk(c, x, y, path + '/' + (c.type || i)));
      };
      ${HUD}.children.list.forEach((o, i) => walk(o, 0, 0, o.type + i));
      return bad;
    })()`,
  );
  expect(off).toEqual([]);
});
