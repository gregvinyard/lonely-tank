import * as Phaser from 'phaser';
import type { BiomeId } from '../data/biomes';
import type { Wind } from '../systems/sky';

// Things in the air: sand and grit blowing on the wind (more in the gusts),
// each biome's own drift (glass glints, bloom spores, mire vapour, city ash),
// glints on lakes, and now and then a dust devil wandering across the flats.
// A fixed pool of tiny sprites, recycled.

type Kind = 'grit' | 'streak' | 'glint' | 'spore' | 'wisp' | 'ash' | 'sparkle' | 'swirl';

interface Mote {
  img: Phaser.GameObjects.Image;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  alpha: number;
  /** Per-mote wobble phase. */
  seed: number;
  devil?: Devil;
  /** Swirl: angle round the devil, and height up it. */
  a: number;
  h: number;
}

interface Devil {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

interface Drift {
  /** Motes per second over a 640x400 view, at full gust. */
  rate: number;
  /** ... and in a calm. */
  calm: number;
  kinds: Kind[];
  colors: number[];
  alpha: number;
  /** How much the wind carries it (1 = at wind speed). */
  carry: number;
  /** Rises (-) or sinks (+), px/s. */
  lift: number;
  life: [number, number];
  /** Glows (drawn additively, over the night). */
  glow?: boolean;
}

const DRIFT: Record<BiomeId, Drift> = {
  flats: { rate: 70, calm: 6, kinds: ['grit', 'grit', 'streak'], colors: [0xf0d6a8, 0xe0bc88, 0xfff0d0], alpha: 0.7, carry: 1.6, lift: 0, life: [1.4, 3] },
  badlands: { rate: 70, calm: 6, kinds: ['grit', 'grit', 'streak'], colors: [0xe09a6a, 0xc8774a, 0xf4c49a], alpha: 0.7, carry: 1.6, lift: 0, life: [1.4, 3] },
  glass: { rate: 24, calm: 14, kinds: ['glint'], colors: [0xe0ffff, 0xa8f4ff, 0xffffff], alpha: 0.9, carry: 0.25, lift: -2, life: [0.8, 2], glow: true },
  bloom: { rate: 20, calm: 16, kinds: ['spore'], colors: [0xc89cff, 0xe0b8ff, 0x9cf0d0], alpha: 0.85, carry: 0.25, lift: -7, life: [3, 6], glow: true },
  mire: { rate: 16, calm: 12, kinds: ['wisp'], colors: [0xa6e070, 0xc8f0a0], alpha: 0.32, carry: 0.35, lift: -9, life: [2.5, 5] },
  ruins: { rate: 26, calm: 8, kinds: ['ash', 'ash', 'grit'], colors: [0xbab3a8, 0x8f8a84, 0xd8d2c8], alpha: 0.65, carry: 0.8, lift: 6, life: [2, 4.5] },
};

const POOL = 320;
const DEPTH = 12.6;
const GLOW_DEPTH = 16.5; // over the light map, so it shines at night
const DEVIL_CHANCE = 1 / 50; // per second, in the open country by day
const DEVIL_PUFFS = 150; // swirling motes per second

export interface AirContext {
  wind: Wind;
  /** The biome at a point (for spawning the right kind of drift). */
  biomeAt: (x: number, y: number) => BiomeId;
  /** Lake surface under a point? (for glints) */
  liquidAt?: (x: number, y: number) => boolean;
  /** 0 by day, 1 at night. */
  night: number;
  /** Dust devils only start where this says (e.g. open ground). */
  openAt?: (x: number, y: number) => boolean;
}

export class Motes {
  private readonly motes: Mote[] = [];
  /** One dust devil at a time, with one shadow sprite kept for it. */
  private devil?: Devil;
  private readonly devilShadow: Phaser.GameObjects.Image;
  private debt = 0;
  private glintDebt = 0;
  /** Lets a test or the title screen switch dust devils off. */
  devilsEnabled = true;

  /** `depth`: draw everything at this depth (the title screen), instead of over the world. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth?: number,
  ) {
    makeTextures(scene);
    this.devilShadow = scene.add.image(0, 0, 'shadow').setDepth(1.6).setScale(0.8, 0.9).setVisible(false);
    for (let i = 0; i < POOL; i++) {
      const img = scene.add.image(0, 0, 'motes', 'mote').setVisible(false);
      this.motes.push({ img, kind: 'grit', x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, alpha: 0, seed: 0, a: 0, h: 0 });
    }
  }

  get active() {
    return this.motes.filter((m) => m.img.visible).length;
  }

  get devilCount() {
    return this.devil ? 1 : 0;
  }

  /** Starts a dust devil at a world point (replacing any other). */
  spawnDevil(x: number, y: number) {
    this.devil = { x, y, vx: 0, vy: 0, age: 0, life: 14 + Math.random() * 10 };
    this.devilShadow.setPosition(x, y).setAlpha(0).setVisible(true);
  }

  update(dtMs: number, ctx: AirContext) {
    const dt = Math.min(dtMs, 100) / 1000;
    const view = this.scene.cameras.main.worldView;
    const { wind } = ctx;
    const area = (view.width * view.height) / (640 * 400);

    // New drift: spawn anywhere in view (plus a margin upwind), fading in.
    const here = ctx.biomeAt(view.centerX, view.centerY);
    const d = DRIFT[here];
    this.debt += (d.calm + (d.rate - d.calm) * wind.gust) * area * dt;
    while (this.debt >= 1) {
      this.debt--;
      const x = view.x - wind.x * 0.5 + Math.random() * view.width;
      const y = view.y - wind.y * 0.5 + Math.random() * view.height;
      this.spawnDrift(DRIFT[ctx.biomeAt(x, y)], x, y, wind);
    }

    // Glints on lakes.
    if (ctx.liquidAt) {
      this.glintDebt += 40 * area * dt;
      while (this.glintDebt >= 1) {
        this.glintDebt--;
        const x = view.x + Math.random() * view.width;
        const y = view.y + Math.random() * view.height;
        if (ctx.liquidAt(x, y)) this.spawn('sparkle', x, y, 0, 0, 0.35 + Math.random() * 0.4, 0xffffff, 0.9, true);
      }
    }

    // Dust devils.
    if (this.devilsEnabled && ctx.openAt && !this.devil && ctx.night < 0.3 && Math.random() < DEVIL_CHANCE * dt) {
      const x = view.x + view.width * (0.2 + Math.random() * 0.6);
      const y = view.y + view.height * (0.2 + Math.random() * 0.6);
      const b = ctx.biomeAt(x, y);
      if ((b === 'flats' || b === 'badlands') && ctx.openAt(x, y)) this.spawnDevil(x, y);
    }
    const v = this.devil;
    if (v) {
      v.age += dt;
      // Drifts with the wind, wandering.
      v.vx += (wind.x * 0.45 - v.vx) * dt + Math.sin(v.age * 1.3) * 14 * dt;
      v.vy += (wind.y * 0.45 - v.vy) * dt + Math.cos(v.age * 1.1) * 14 * dt;
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      const strength = Math.min(1, v.age / 2, (v.life - v.age) / 2.5);
      this.devilShadow.setPosition(v.x + 2, v.y + 1).setAlpha(0.7 * Math.max(0, strength));
      if (v.age >= v.life || (ctx.openAt && !ctx.openAt(v.x, v.y))) {
        this.devilShadow.setVisible(false);
        this.devil = undefined;
      }
      let puffs = DEVIL_PUFFS * strength * dt;
      while (puffs > 0 && (puffs >= 1 || Math.random() < puffs)) {
        puffs--;
        const colors = DRIFT[ctx.biomeAt(v.x, v.y)].colors;
        const m = this.spawn(Math.random() < 0.3 ? 'streak' : 'swirl', v.x, v.y, 0, 0, 1.8 + Math.random() * 1.4, colors[Math.floor(Math.random() * colors.length)], 0.95, false);
        if (m) {
          m.devil = v;
          m.a = Math.random() * Math.PI * 2;
          m.h = Math.random() * 4;
        }
      }
    }

    // Move everything.
    for (const m of this.motes) {
      if (!m.img.visible) continue;
      m.age += dt;
      if (m.age >= m.life) {
        m.img.setVisible(false);
        m.devil = undefined;
        continue;
      }
      const t = m.age / m.life;
      let fade = Math.min(1, t * 5, (1 - t) * 4);
      if (m.devil) {
        // Up and round, widening as it climbs.
        m.a += (7 - m.h * 0.05) * dt;
        m.h += (16 + m.h * 0.35) * dt;
        const r = 3 + m.h * 0.4;
        m.x = m.devil.x + Math.cos(m.a) * r;
        m.y = m.devil.y + Math.sin(m.a) * r * 0.35 - m.h;
        fade *= Math.min(1, Math.max(0, 1 - m.h / 95));
      } else {
        const wobble = Math.sin(m.age * 3 + m.seed) * (m.kind === 'spore' || m.kind === 'ash' ? 6 : 2);
        m.x += (m.vx + wobble * 0.5) * dt;
        m.y += (m.vy + wobble) * dt;
        if (m.kind === 'glint' || m.kind === 'sparkle') fade *= 0.5 + 0.5 * Math.sin(m.age * 9 + m.seed);
        if (m.kind === 'spore') fade *= 0.6 + 0.4 * ctx.night;
      }
      m.img.setPosition(Math.round(m.x), Math.round(m.y)).setAlpha(m.alpha * Math.max(0, fade));
    }
  }

  private spawnDrift(d: Drift, x: number, y: number, wind: Wind) {
    const kind = d.kinds[Math.floor(Math.random() * d.kinds.length)];
    const carry = d.carry * (0.75 + Math.random() * 0.5);
    const life = d.life[0] + Math.random() * (d.life[1] - d.life[0]);
    const color = d.colors[Math.floor(Math.random() * d.colors.length)];
    const m = this.spawn(kind, x, y, wind.x * carry, wind.y * carry + d.lift, life, color, d.alpha, !!d.glow);
    if (m && kind === 'streak') m.img.setRotation(wind.angle);
  }

  private spawn(kind: Kind, x: number, y: number, vx: number, vy: number, life: number, color: number, alpha: number, glow: boolean): Mote | undefined {
    const m = this.motes.find((o) => !o.img.visible);
    if (!m) return undefined;
    const frame = kind === 'streak' ? 'streak' : kind === 'spore' || kind === 'wisp' ? 'soft' : kind === 'sparkle' || kind === 'glint' ? 'glint' : 'mote';
    m.img.setFrame(frame).setTint(color).setVisible(true).setAlpha(0).setRotation(0);
    m.img.setDepth(this.depth ?? (glow ? GLOW_DEPTH : DEPTH)).setBlendMode(glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    Object.assign(m, { kind, x, y, vx, vy, age: 0, life, alpha, seed: Math.random() * 10, devil: undefined, a: 0, h: 0 });
    return m;
  }

  destroy() {
    for (const m of this.motes) m.img.destroy();
    this.devilShadow.destroy();
    this.devil = undefined;
    this.motes.length = 0;
  }
}

/** All the mote shapes on one small texture, so they draw in a single batch. */
function makeTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('motes')) return;
  const g = scene.make.graphics({}, false);
  // mote: a single grain
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1);
  // streak: a grain with a fading tail
  g.fillStyle(0xffffff, 1).fillRect(4, 0, 2, 1);
  g.fillStyle(0xffffff, 0.5).fillRect(2, 0, 2, 1);
  // soft: a spore or a puff of vapour
  g.fillStyle(0xffffff, 0.45).fillRect(7, 1, 3, 1).fillRect(8, 0, 1, 3);
  g.fillStyle(0xffffff, 1).fillRect(8, 1, 1, 1);
  // glint: a little star
  g.fillStyle(0xffffff, 0.6).fillRect(11, 1, 3, 1).fillRect(12, 0, 1, 3);
  g.fillStyle(0xffffff, 1).fillRect(12, 1, 1, 1);
  g.generateTexture('motes', 16, 3);
  g.destroy();
  const t = scene.textures.get('motes');
  t.add('mote', 0, 0, 0, 1, 1);
  t.add('streak', 0, 2, 0, 4, 1);
  t.add('soft', 0, 7, 0, 3, 3);
  t.add('glint', 0, 11, 0, 3, 3);
}
