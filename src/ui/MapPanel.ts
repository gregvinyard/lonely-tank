import * as Phaser from 'phaser';
import { BIOMES, BIOME_IDS } from '../data/biomes';
import { PLANET } from '../data/tuning';
import { biomeAt } from '../systems/biome';
import { chunkKey, chunkOf } from '../systems/chunks';
import { featuresIn, groundAt } from '../systems/terrain';
import type { GameScene } from '../scenes/GameScene';
import { toFontText } from '../data/pixelFont';
import { UI_TEXT, frame, label } from './widgets';

// The planet map: what the tank has seen, coloured by biome, with lakes,
// canyons and mesas marked, centred on the tank. Unexplored ground is fogged.

/** Largest map, in game pixels; smaller when the screen is. */
const MAX_W = 400;
const MAX_H = 250;
/** World px per map pixel. */
const SCALE = 96;
const PAD = 8;
const TOP = 20;
const LEGEND_W = 92;
const FOG = [0x17, 0x13, 0x18];

const GROUND_COLOR = { liquid: { acid: 0x56c43c, ichor: 0x8a3cc0 }, canyon: 0x140c10, mesaTop: 0xd88a4a, mesaFace: 0x6a3a22 } as const;

export class MapPanel extends Phaser.GameObjects.Container {
  private tex!: Phaser.Textures.CanvasTexture;
  private marks!: Phaser.GameObjects.Graphics;
  private legend!: Phaser.GameObjects.Container;
  private title!: Phaser.GameObjects.BitmapText;
  private mw = 0;
  private mh = 0;
  /** Map colours already worked out, by world cell. */
  private readonly cache = new Map<number, number>();

  constructor(
    scene: Phaser.Scene,
    private readonly game_: GameScene,
  ) {
    super(scene, 0, 0);
    scene.add.existing(this);
  }

  /** Sizes the panel to fit a screen this big (rebuilding it if that changed). */
  private fit(screenW: number, screenH: number) {
    const mw = Math.max(120, Math.min(MAX_W, screenW - 16 - PAD * 2 - LEGEND_W) & ~1);
    const mh = Math.max(80, Math.min(MAX_H, screenH - 16 - TOP - PAD) & ~1);
    if (mw === this.mw && mh === this.mh) return;
    this.mw = mw;
    this.mh = mh;
    const sc = this.scene;
    this.removeAll(true);
    const w = PAD * 2 + mw + LEGEND_W;
    const h = TOP + mh + PAD;
    if (sc.textures.exists('planet_map')) sc.textures.remove('planet_map');
    this.tex = sc.textures.createCanvas('planet_map', mw, mh)!;
    this.title = label(sc, PAD, 7, 'Map', UI_TEXT.accent);
    const close = label(sc, 0, 7, '[Tab] close', UI_TEXT.dim);
    close.setX(w - PAD - Math.round(close.width));
    this.marks = sc.add.graphics();
    this.legend = sc.add.container(PAD * 2 + mw - 2, TOP);
    this.add([frame(sc, 'ui_panel', 0, 0, w, h), this.title, close, sc.add.image(PAD, TOP, 'planet_map').setOrigin(0, 0), this.marks, this.legend]);
    this.setSize(w, h);
  }

  /** Redraws the map round the tank. */
  refresh(screenW: number, screenH: number) {
    this.fit(screenW, screenH);
    const MAP_W = this.mw;
    const MAP_H = this.mh;
    const g = this.game_;
    const seed = g.world.seed;
    const ox = Math.floor(g.tank.x / SCALE) - MAP_W / 2;
    const oy = Math.floor(g.tank.y / SCALE) - MAP_H / 2;
    const ctx = this.tex.getContext();
    const img = ctx.createImageData(MAP_W, MAP_H);
    const B = PLANET.bounds;
    for (let j = 0; j < MAP_H; j++) {
      const wy = (oy + j) * SCALE + SCALE / 2;
      // Features along this row, looked up once.
      const row = featuresIn(seed, { x0: ox * SCALE, y0: wy - 1, x1: (ox + MAP_W) * SCALE, y1: wy + 1 });
      for (let i = 0; i < MAP_W; i++) {
        const wx = (ox + i) * SCALE + SCALE / 2;
        const o = (j * MAP_W + i) * 4;
        let rgb: number[];
        if (wx < B.min || wy < B.min || wx > B.max || wy > B.max) rgb = [6, 5, 8];
        else if (!g.explored.has(chunkKey(chunkOf(wx, wy).cx, chunkOf(wx, wy).cy))) {
          // Fog, with a faint grain so it doesn't read as a hole.
          const n = ((i * 7 + j * 13) % 5) - 2;
          rgb = [FOG[0] + n, FOG[1] + n, FOG[2] + n];
        } else {
          const key = (ox + i) * 100003 + (oy + j);
          let c = this.cache.get(key);
          if (c === undefined) {
            c = BIOMES[biomeAt(seed, wx, wy).biome].mapColor;
            const ground = groundAt(row, wx, wy);
            if (ground.kind === 'liquid' && ground.feature?.kind === 'lake') c = GROUND_COLOR.liquid[ground.feature.liquid];
            else if (ground.kind === 'canyon') c = GROUND_COLOR.canyon;
            else if (ground.kind === 'mesaTop') c = GROUND_COLOR.mesaTop;
            else if (ground.kind === 'mesaFace') c = GROUND_COLOR.mesaFace;
            this.cache.set(key, c);
          }
          rgb = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
        }
        img.data[o] = rgb[0];
        img.data[o + 1] = rgb[1];
        img.data[o + 2] = rgb[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.tex.refresh();

    // Markers: the ship, landmarks found, and the tank in the middle.
    const m = this.marks.clear();
    const at = (x: number, y: number) => ({ x: PAD + Math.floor(x / SCALE) - ox, y: TOP + Math.floor(y / SCALE) - oy });
    const inside = (p: { x: number; y: number }) => p.x >= PAD && p.y >= TOP && p.x < PAD + MAP_W && p.y < TOP + MAP_H;
    const ship = at(g.world.center.x, g.world.center.y);
    if (inside(ship)) {
      m.fillStyle(0x0d0b10).fillRect(ship.x - 3, ship.y - 3, 7, 7);
      m.fillStyle(UI_TEXT.accent).fillRect(ship.x - 2, ship.y - 2, 5, 5);
    }
    for (const lm of g.foundLandmarks) {
      const p = at(lm.x, lm.y);
      if (!inside(p)) continue;
      m.fillStyle(0x0d0b10).fillRect(p.x - 2, p.y - 2, 5, 5);
      m.fillStyle(0xf3e3c3).fillRect(p.x - 1, p.y - 1, 3, 3);
    }
    const t = at(g.tank.x, g.tank.y);
    m.fillStyle(0x0d0b10).fillRect(t.x - 2, t.y - 2, 5, 5);
    m.fillStyle(UI_TEXT.fuel).fillRect(t.x - 1, t.y - 1, 3, 3);

    // Legend: the biomes found so far.
    this.legend.removeAll(true);
    let y = 0;
    for (const id of BIOME_IDS) {
      if (!g.discovered.has(`biome:${id}`)) continue;
      const sw = this.scene.add.rectangle(0, y + 1, 7, 7, BIOMES[id].mapColor).setOrigin(0, 0).setStrokeStyle(1, 0x0d0b10);
      this.legend.add([sw, label(this.scene, 11, y, BIOMES[id].name, UI_TEXT.text)]);
      y += 12;
    }
    y += 4;
    const keys: [number, string][] = [
      [UI_TEXT.accent, 'Ship'],
      [UI_TEXT.fuel, 'You'],
      [0xf3e3c3, 'Landmark'],
    ];
    for (const [c, s] of keys) {
      this.legend.add([this.scene.add.rectangle(1, y + 2, 5, 5, c).setOrigin(0, 0), label(this.scene, 11, y, s, UI_TEXT.dim)]);
      y += 12;
    }
    const found = BIOME_IDS.filter((id) => g.discovered.has(`biome:${id}`)).length;
    this.title.setText(toFontText(`Map · ${found}/${BIOME_IDS.length} biomes found · ${g.foundLandmarks.length} landmarks`));
  }
}
