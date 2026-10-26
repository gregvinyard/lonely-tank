import { expect, test, type Page } from '@playwright/test';

const GAME = `window.__LT_GAME__`;
const SCENE = `${GAME}.scene.getScene('Game')`;
const HUD = `${GAME}.scene.getScene('Hud')`;

const read = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

test.beforeEach(async ({ page }) => {
  await page.goto('/?newgame');
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${HUD}?.scene.isActive()`);
  await page.locator('canvas').click({ position: { x: 5, y: 5 } });
});

/** Teleports the tank and waits for the ground round it. */
async function goTo(page: Page, x: number, y: number) {
  await page.evaluate(`(() => { const s = ${SCENE}; s.tank.reset(${x}, ${y}); s.cameras.main.centerOn(${x}, ${y}); })()`);
  await page.waitForFunction(`${SCENE}.planet.groundReady && ${SCENE}.planet.isLoaded(Math.floor(${x} / 512), Math.floor(${y} / 512))`, null, { timeout: 10000 });
}

test('cliffs, canyons and lakes stop the tank', async ({ page }) => {
  // Drive at each kind of feature from just outside it; the tank must never end up on it.
  const near: Record<string, [number, number]> = { mesa: [-2524, 2846], lake: [-1529, -1324], canyon: [3187, 3110] };
  for (const kind of ['mesa', 'lake', 'canyon']) {
    await goTo(page, ...near[kind]);
    // Walk south from the middle of the nearest one until the ground is open, then back off a little.
    const target = await page.evaluate(`(() => {
      const s = ${SCENE};
      const f = s.planet.features.filter((f) => f.kind === '${kind}')
        .sort((a, b) => Math.hypot(a.box.x0 - s.tank.x, a.box.y0 - s.tank.y) - Math.hypot(b.box.x0 - s.tank.x, b.box.y0 - s.tank.y))[0];
      if (!f) return undefined;
      const mid = f.kind === 'canyon' ? f.pts[Math.floor(f.pts.length / 2)] : f;
      let y = mid.y;
      while (s.planet.ground(mid.x, y).kind === 'open') y -= 2; // canyon centre lines are inside; blobs start inside
      while (s.planet.ground(mid.x, y).kind !== 'open') y += 2;
      return { x: Math.round(mid.x), y: Math.round(y + 70) };
    })()`);
    expect(target, kind).toBeTruthy();
    const t = target as { x: number; y: number };
    await goTo(page, t.x, t.y);
    await page.keyboard.down('w');
    let onIt = false;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(150);
      onIt ||= await read<boolean>(page, `${SCENE}.planet.ground(${SCENE}.tank.x, ${SCENE}.tank.y).kind !== 'open'`);
    }
    await page.keyboard.up('w');
    const [x, y] = await read<number[]>(page, `[${SCENE}.tank.x, ${SCENE}.tank.y]`);
    expect(onIt, kind).toBe(false);
    expect(y, kind).toBeLessThan(t.y - 20); // it drove up to the edge
    // Where the edge is slanted it slides along it; head-on, it stops there.
    if (Math.abs(x - t.x) < 8) expect(y, kind).toBeGreaterThan(t.y - 75);
  }
});

test('the planet streams in and out without piling up objects', async ({ page }) => {
  const spots = [
    [-6000, 4000],
    [9000, -3000],
    [-12000, -12000],
    [20000, 15000],
    [3000, 9000],
    [-18000, 6000],
    [1024, 1400],
  ];
  // After each lap, back home: a leak would grow lap on lap.
  const counts: number[] = [];
  for (let lap = 0; lap < 3; lap++) {
    for (const [x, y] of spots) await goTo(page, x, y);
    await page.waitForTimeout(300);
    // Burrower trail mounds come and go on their own; count everything else.
    counts.push(await read<number>(page, `${SCENE}.children.list.filter((c) => c.texture?.key !== 'mound_trail').length + ${SCENE}.textures.getTextureKeys().length`));
  }
  expect(counts[2]).toBe(counts[0]);
  expect(await read<number>(page, `${SCENE}.planet.loadedCount`)).toBeLessThanOrEqual(49);
});

test('a save far out on the planet (negative coordinates) loads back there', async ({ page }) => {
  await goTo(page, -9000, 4200);
  const pos = await page.evaluate(`(() => {
    const s = ${SCENE};
    // Nudge to open ground if needed.
    let y = 4200;
    while (s.planet.ground(-9000, y).kind !== 'open') y += 40;
    s.tank.reset(-9000, y);
    s.save();
    return { x: -9000, y };
  })()`);
  await page.reload();
  await page.waitForFunction(`${SCENE}?.scene.isActive() && ${SCENE}.planet?.groundReady`);
  const p = pos as { x: number; y: number };
  // Right there (give or take a nudge off anything it was touching).
  expect(Math.abs((await read<number>(page, `${SCENE}.tank.x`)) - p.x)).toBeLessThan(30);
  expect(Math.abs((await read<number>(page, `${SCENE}.tank.y`)) - p.y)).toBeLessThan(30);
  expect(await read<boolean>(page, `${SCENE}.explored.size > 0`)).toBe(true);
});

test('crossing into a new biome is announced, and the map shows where you have been', async ({ page }) => {
  // Glass country north-east of the ship.
  await goTo(page, 1792, -3840);
  await page.waitForFunction(`${SCENE}.biome === 'glass'`, null, { timeout: 3000 });
  await page.waitForFunction(`${HUD}.discovery.visible`, null, { timeout: 3000 });
  expect(await read<string>(page, `${HUD}.discovery.text.text`)).toContain('GLASS FIELDS');
  expect(await read<boolean>(page, `${SCENE}.discovered.has('biome:glass')`)).toBe(true);

  await page.keyboard.press('Tab');
  await page.waitForFunction(`${HUD}.mapOpen && ${HUD}.map.visible`);
  const x = await read<number>(page, `${SCENE}.playTimeMs`);
  await page.waitForTimeout(400);
  // The game waits while the map is up.
  expect(await read<number>(page, `${SCENE}.playTimeMs`)).toBe(x);
  expect(await read<string>(page, `${HUD}.map.list[1].text`)).toContain('2/6 BIOMES');
  await page.keyboard.press('Tab');
  await page.waitForFunction(`!${HUD}.mapOpen && !${HUD}.map.visible`);
});

test('a fuel seep tops up the tanks', async ({ page }) => {
  await goTo(page, -2816, 8960);
  const seep = await page.evaluate(`(() => {
    const s = ${SCENE};
    const e = [...s.seeps.values()][0];
    return e && { x: e.seep.x, y: e.seep.y };
  })()`);
  expect(seep).toBeTruthy();
  const p = seep as { x: number; y: number };
  await page.evaluate(`(() => { const s = ${SCENE}; s.tank.reset(${p.x}, ${p.y} + 30); s.fuel = 10; })()`);
  await page.waitForFunction(`!!${SCENE}.nearbySeep && ${HUD}.promptText.text.includes('SIPHON FUEL')`);
  await page.keyboard.press('e');
  await page.waitForFunction(`${SCENE}.fuel > 40`);
  expect(await read<boolean>(page, `[...${SCENE}.collected.keys()].some((k) => k.startsWith('seep@'))`)).toBe(true);
});

test('the map fits a squarish window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1024 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForFunction(`${HUD}.mapOpen`);
  await page.waitForTimeout(100);
  const r = await read<{ x: number; y: number; w: number; h: number; sw: number; sh: number }>(
    page,
    `(() => { const h = ${HUD}; return { x: h.map.x, y: h.map.y, w: h.map.width, h: h.map.height, sw: h.scale.width, sh: h.scale.height }; })()`,
  );
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x + r.w).toBeLessThanOrEqual(r.sw);
  expect(r.y + r.h).toBeLessThanOrEqual(r.sh);
});
