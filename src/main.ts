import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { PALETTE } from './data/tuning';

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
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, GameScene, HudScene],
});

// Exposed for automated browser smoke tests and debugging.
(window as unknown as { __LT_GAME__: Phaser.Game }).__LT_GAME__ = game;
