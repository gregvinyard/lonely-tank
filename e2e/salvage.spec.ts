import { expect, test, type Page } from '@playwright/test';

const SCENE = `window.__LT_GAME__.scene.getScene('Game')`;

async function state(page: Page) {
  return page.evaluate(`(() => {
    const s = ${SCENE};
    const hud = window.__LT_GAME__.scene.getScene('Hud');
    return {
      inventory: s.inventory,
      remaining: s.resources.size,
      nearby: s.nearby && s.nearby.id,
      prompt: hud.prompt.visible ? hud.promptText.text : null,
      compass: hud.compassLabel.visible,
    };
  })()`) as Promise<{ inventory: { scrap: number; crystal: number }; remaining: number; nearby?: string; prompt: string | null; compass: boolean }>;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?play');
  await page.waitForFunction(`${SCENE}?.scene.isActive()`);
  await page.locator('canvas').click({ position: { x: 640, y: 360 } });
});

test('driving onto a resource and pressing E salvages it', async ({ page }) => {
  const start = await state(page);
  expect(start.inventory).toEqual({ scrap: 0, crystal: 0, circuit: 0, prism: 0, spore: 0, salt: 0, relic: 0 });
  // By the ship's door the only prompt is to go in.
  expect(start.prompt).toBe('[E] ENTER SHIP · OR DRIVE IN');

  for (const kind of ['scrap', 'crystal'] as const) {
    // Park the tank just left of the first node of this kind, then drive onto it.
    const node = (await page.evaluate(`(() => {
      const s = ${SCENE};
      const n = [...s.resources.values()].map((r) => r.node).find((n) => n.kind === '${kind}');
      s.tank.hull.body.reset(n.x - 90, n.y);
      return n;
    })()`)) as { id: string; amount: number };

    await page.keyboard.down('d');
    await page.waitForFunction(`${SCENE}.nearby?.id === '${node.id}'`);
    await page.keyboard.up('d');
    // The HUD reads Game state on its own update, so give it a frame.
    await page.waitForFunction(`window.__LT_GAME__.scene.getScene('Hud').prompt.visible`);

    const before = await state(page);
    expect(before.prompt).toContain('[E] SALVAGE');

    await page.keyboard.press('e');
    await page.waitForTimeout(100);
    const after = await state(page);
    expect(after.inventory[kind]).toBe(before.inventory[kind] + node.amount);
    expect(after.remaining).toBe(before.remaining - 1);
    expect(await page.evaluate(`${SCENE}.resources.has('${node.id}')`)).toBe(false);
  }
});

test('pressing E away from the ship with nothing nearby does nothing', async ({ page }) => {
  // Open ground beside the ship, well away from its door.
  await page.evaluate(`${SCENE}.tank.hull.body.reset(${SCENE}.world.spawn.x - 150, ${SCENE}.world.spawn.y + 30)`);
  await page.waitForTimeout(50);
  expect((await state(page)).prompt).toBeNull();
  await page.keyboard.press('e');
  await page.waitForTimeout(50);
  const s = await state(page);
  expect(s.inventory).toEqual({ scrap: 0, crystal: 0, circuit: 0, prism: 0, spore: 0, salt: 0, relic: 0 });
  expect(await page.evaluate(`${SCENE}.workshopOpen`)).toBe(false);
  expect(await page.evaluate(`${SCENE}.shipState`)).toBe('outside');
});

test('compass shows far from the ship and hides near it', async ({ page }) => {
  expect((await state(page)).compass).toBe(false);

  await page.evaluate(`${SCENE}.tank.hull.body.reset(150, 150)`);
  await page.waitForTimeout(1500); // let the camera catch up
  const far = await state(page);
  expect(far.compass).toBe(true);
  await page.screenshot({ path: 'test-results/compass.png' });

  const c = (await page.evaluate(`${SCENE}.world.center`)) as { x: number; y: number };
  await page.evaluate(`${SCENE}.tank.hull.body.reset(${c.x}, ${c.y + 110})`);
  await page.waitForTimeout(1500);
  expect((await state(page)).compass).toBe(false);
});
