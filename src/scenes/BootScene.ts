import * as Phaser from 'phaser';
import { ASSETS } from '../data/assets';

// Loads any supplied PNGs from the manifest, then generates placeholder
// textures for everything that is missing.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    for (const a of ASSETS) {
      if (a.file) this.load.image(a.key, a.file);
    }
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`Asset failed to load, using placeholder: ${file.key}`);
    });
  }

  create() {
    for (const a of ASSETS) {
      if (this.textures.exists(a.key)) continue;
      const g = this.make.graphics({}, false);
      a.placeholder(g, a.width, a.height);
      g.generateTexture(a.key, a.width, a.height);
      g.destroy();
    }
    this.scene.start('Game');
  }
}
