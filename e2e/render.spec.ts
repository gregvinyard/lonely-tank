import { expect, test, type Page } from '@playwright/test';

// Regression test for a Phaser 4.2.1 multi-texture batching bug where parts of
// the rotated turret went missing (see the maxTextures note in src/main.ts).
//
// With the scene paused mid-drive we take three screenshots of the tank:
//   full   – everything visible
//   turret – hull hidden
//   ground – hull and turret hidden
// Pixels where `turret` differs from `ground` belong to the turret. Since the
// turret is drawn on top, `full` must match `turret` at every one of them.

const game = `window.__LT_GAME__`;

async function shot(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  return (await page.screenshot({ clip })).toString('base64');
}

async function setVisible(page: Page, hull: boolean, turret: boolean) {
  await page.evaluate(
    ([h, t]) => {
      const s = (window as any).__LT_GAME__.scene.getScene('Game');
      s.tank.hull.setVisible(h);
      s.tank.turret.setVisible(t);
    },
    [hull, turret],
  );
  await page.waitForTimeout(80);
}

const POSES: { mouse: [number, number]; keys: string[] }[] = [
  { mouse: [900, 200], keys: ['d', 's'] },
  { mouse: [300, 600], keys: ['a'] },
  { mouse: [640, 50], keys: ['w', 'a'] },
  { mouse: [1100, 650], keys: ['w'] },
];

test('turret renders completely over the hull while driving', async ({ page }) => {
  await page.goto('/?play');
  await page.waitForFunction(`${game}?.scene.isActive('Game')`);

  for (const pose of POSES) {
    await page.mouse.move(...pose.mouse);
    for (const k of pose.keys) await page.keyboard.down(k);
    await page.waitForTimeout(800);
    // Pause the scene and the camera's follow smoothing (which runs even while paused).
    await page.evaluate(`${game}.scene.pause('Game'); ${game}.scene.getScene('Game').cameras.main.stopFollow()`);
    await page.waitForTimeout(80);

    const [sx, sy] = (await page.evaluate(`(() => {
      const s = ${game}.scene.getScene('Game'); const c = s.cameras.main;
      // Game pixels -> CSS pixels: the whole canvas is scaled by game.scale.zoom.
      const z = ${game}.scale.zoom;
      return [(s.tank.x - c.worldView.x) * z, (s.tank.y - c.worldView.y) * z];
    })()`)) as [number, number];
    const clip = { x: Math.round(sx) - 70, y: Math.round(sy) - 70, width: 140, height: 140 };

    const full = await shot(page, clip);
    await setVisible(page, false, true);
    const turret = await shot(page, clip);
    await setVisible(page, false, false);
    const ground = await shot(page, clip);
    await setVisible(page, true, true);

    const result = await page.evaluate(async ([a, b, c]) => {
      const decode = async (b64: string) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const cv = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = cv.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      };
      const [full, turret, ground] = await Promise.all([decode(a), decode(b), decode(c)]);
      const diff = (p: Uint8ClampedArray, q: Uint8ClampedArray, i: number) =>
        Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]);
      let turretPixels = 0;
      let mismatched = 0;
      for (let i = 0; i < full.length; i += 4) {
        if (diff(turret, ground, i) < 30) continue;
        turretPixels++;
        if (diff(full, turret, i) > 30) mismatched++;
      }
      return { turretPixels, mismatched };
    }, [full, turret, ground]);

    await page.evaluate(`(() => { const s = ${game}.scene.getScene('Game'); s.cameras.main.startFollow(s.tank.hull, true, 0.12, 0.12); ${game}.scene.resume('Game'); })()`);
    for (const k of pose.keys) await page.keyboard.up(k);

    expect(result.turretPixels, `pose ${JSON.stringify(pose)}`).toBeGreaterThan(300);
    // Allow a few edge pixels for sub-pixel sampling differences.
    expect(result.mismatched / result.turretPixels, `pose ${JSON.stringify(pose)}`).toBeLessThan(0.03);
  }
});
