import * as Phaser from 'phaser';
import { ASSETS } from '../data/assets';
import { FRAMES, ICONS, mapPixels } from '../data/uiKit';
import { createRng } from '../systems/rng';
import { CELL_H, CELL_W, FONT_CHARS, FONT_COLS, FONT_KEY, fontPixels } from '../data/pixelFont';

const TERRAIN_TILES = 8; // 256 px repeat
const TERRAIN_SEED = 4242;

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
    this.createTerrain();
    this.createUiKit();
    this.createPixelFont();
    this.scene.start('Game');
  }

  /** Lays the ground tile out with seeded flips so the repeat doesn't show. */
  private createTerrain() {
    const src = this.textures.get('terrain_ground').getSourceImage() as CanvasImageSource;
    const tile = 32;
    const n = TERRAIN_TILES;
    const tex = this.textures.createCanvas('terrain', tile * n, tile * n)!;
    const ctx = tex.getContext();
    const rng = createRng(TERRAIN_SEED);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const fx = rng() < 0.5 ? -1 : 1;
        const fy = rng() < 0.5 ? -1 : 1;
        ctx.setTransform(fx, 0, 0, fy, x * tile + (fx < 0 ? tile : 0), y * tile + (fy < 0 ? tile : 0));
        ctx.drawImage(src, 0, 0, tile, tile);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tex.refresh();
  }

  /** Draws the code-defined UI frames and icons into textures. */
  private createUiKit() {
    for (const { key, rows } of [...FRAMES, ...ICONS]) {
      const tex = this.textures.createCanvas(key, rows[0].length, rows.length)!;
      const ctx = tex.getContext();
      for (const [x, y, color] of mapPixels(rows)) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
      tex.refresh();
    }
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
