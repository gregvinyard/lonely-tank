import * as Phaser from 'phaser';
import { WORLD_SIZE } from '../data/tuning';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'terrain_ground').setOrigin(0, 0);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    cam.centerOn(WORLD_SIZE / 2, WORLD_SIZE / 2);

    this.add
      .text(WORLD_SIZE / 2, WORLD_SIZE / 2, 'LONELY TANK', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#f3e3c3',
      })
      .setOrigin(0.5);
  }
}
