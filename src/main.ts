import * as Phaser from 'phaser';
import { sfx } from './audio/sfx';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { PALETTE, zoomForViewport } from './data/tuning';

// Pixel lock: the whole game renders at a low virtual resolution and the
// canvas is scaled up by a whole number, so world art, particles and HUD all
// share one pixel grid.
// The scale is a whole number of *device* pixels, so it stays crisp with
// Windows/OS display scaling (devicePixelRatio 1.25, 1.5, ...).
function virtualSize() {
  const dpr = window.devicePixelRatio || 1;
  const devicePixelsPerPixel = zoomForViewport(window.innerHeight * dpr);
  return {
    zoom: devicePixelsPerPixel / dpr, // CSS px per game pixel
    width: Math.ceil((window.innerWidth * dpr) / devicePixelsPerPixel),
    height: Math.ceil((window.innerHeight * dpr) / devicePixelsPerPixel),
  };
}
const initial = virtualSize();

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: PALETTE.background,
  pixelArt: true,
  render: {
    // Workaround for a Phaser 4.2.1 multi-texture batching bug seen under
    // software WebGL (SwiftShader): a rotated sprite batched with a different
    // texture (turret over hull) sampled the wrong texture on one triangle.
    // Not reproduced on a real GPU, but one texture per batch costs us nothing.
    // Guarded by e2e/render.spec.ts.
    maxTextures: 1,
  },
  scale: {
    mode: Phaser.Scale.NONE,
    width: initial.width,
    height: initial.height,
    zoom: initial.zoom,
  },
  physics: {
    default: 'arcade',
    // Step physics with each rendered frame instead of a fixed 60 Hz, so motion
    // stays smooth on high-refresh displays. Movement code is delta-time based.
    arcade: { debug: false, fixedStep: false },
  },
  scene: [BootScene, GameScene, HudScene],
});

window.addEventListener('resize', () => {
  const { zoom, width, height } = virtualSize();
  game.scale.setZoom(zoom);
  game.scale.resize(width, height);
});

// Browsers only allow audio after a user gesture.
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => sfx.unlock(), { passive: true });

// Exposed for automated browser smoke tests and debugging.
(window as unknown as { __LT_GAME__: Phaser.Game }).__LT_GAME__ = game;
