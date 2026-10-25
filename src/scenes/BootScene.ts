import * as Phaser from 'phaser';
import { ASSETS } from '../data/assets';
import { CELL_H, CELL_W, FONT_CHARS, FONT_COLS, FONT_KEY, fontPixels } from '../data/pixelFont';

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
    this.createPixelFont();
    this.scene.start('Game');
  }

  private createPixelFont() {
    const { width, height, pixels } = fontPixels();
    const tex = this.textures.createCanvas(FONT_KEY, width, height)!;
    const ctx = tex.getContext();
    ctx.fillStyle = '#ffffff';
    for (const [x, y] of pixels) ctx.fillRect(x, y, 1, 1);
    tex.refresh();
    const font = Phaser.GameObjects.RetroFont.Parse(this, {
      image: FONT_KEY,
      width: CELL_W,
      height: CELL_H,
      chars: FONT_CHARS,
      charsPerRow: FONT_COLS,
      'offset.x': 0,
      'offset.y': 0,
      'spacing.x': 0,
      'spacing.y': 0,
      lineSpacing: 2,
    });
    this.cache.bitmapFont.add(FONT_KEY, font);
  }
}
