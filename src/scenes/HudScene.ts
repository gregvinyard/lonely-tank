import * as Phaser from 'phaser';

// Screen-space interface drawn over the Game scene, unaffected by camera zoom.
export class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  create() {
    this.add.text(12, 12, 'WASD drive  ·  mouse aim', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#f3e3c3',
      backgroundColor: '#00000066',
      padding: { x: 6, y: 4 },
    });
  }
}
