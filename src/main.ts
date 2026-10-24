import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { PALETTE } from './data/tuning';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: PALETTE.background,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, GameScene],
});

// Exposed for automated browser smoke tests and debugging.
(window as unknown as { __LT_GAME__: Phaser.Game }).__LT_GAME__ = game;
