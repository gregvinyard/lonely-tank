import * as Phaser from 'phaser';
import { skyColor, type Sky, type Wind } from '../systems/sky';

// The light over the world: a texture the size of the view, filled with the
// sky's colour, darkened where clouds pass and brightened where lamps shine,
// then multiplied over everything below it. A second texture adds halos round
// things that glow. Both sit in the world (not on the screen), so they move
// with the camera exactly, shake included.

export interface Light {
  x: number;
  y: number;
  radius: number;
  color: number;
  /** 0..1 */
  intensity: number;
  /** A beam pointing this way (radians) instead of a round glow. */
  beam?: number;
  /**
   * How much it also glows on top (0..1). Light alone can only bring back
   * the daytime colours; a glow adds a halo that shines past them.
   */
  glow?: number;
}

export type LightSource = (add: (l: Light) => void) => void;

interface Flash extends Light {
  born: number;
  ms: number;
}

interface Cloud {
  key: string;
  /** Position in the repeating cloud field (px). */
  x: number;
  y: number;
}

const DEPTH = 16;
const MARGIN = 48; // px of light map round the view, so a moving camera never shows its edge
/** Clouds repeat over a square this big round the camera, wrapping out of sight. */
const FIELD = 1600;
const CLOUD_KEYS = ['cloud_0', 'cloud_1', 'cloud_2'];
const CLOUDS = 5;
/** Clouds drift at this fraction of the wind (they're high up, and big). */
const CLOUD_DRIFT = 0.5;
const ROUND_R = 64; // radius of the round light texture
/** Lamps light up once it's this dark (sky.night). */
const LAMPS_ON = 0.1;
const CLOUD_W = 256;
const CLOUD_H = 176;

export class Atmosphere {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly glowRt: Phaser.GameObjects.RenderTexture;
  private readonly clouds: Cloud[] = [];
  private flashes: Flash[] = [];
  private drift = { x: 0, y: 0 };
  /** The last sky drawn (for tests). */
  sky?: Sky;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly lights: LightSource,
  ) {
    makeTextures(scene);
    const cam = scene.cameras.main;
    this.rt = scene.add.renderTexture(0, 0, cam.width + MARGIN * 2, cam.height + MARGIN * 2).setOrigin(0, 0);
    this.rt.setDepth(DEPTH).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.glowRt = scene.add.renderTexture(0, 0, cam.width + MARGIN * 2, cam.height + MARGIN * 2).setOrigin(0, 0);
    this.glowRt.setDepth(DEPTH + 0.1).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < CLOUDS; i++) {
      this.clouds.push({ key: CLOUD_KEYS[i % CLOUD_KEYS.length], x: Math.random() * FIELD, y: Math.random() * FIELD });
    }
  }

  /** A short burst of light (muzzle flash, explosion). */
  flash(x: number, y: number, radius: number, color: number, ms: number) {
    this.flashes.push({ x, y, radius, color, intensity: 1, born: this.scene.time.now, ms });
  }

  update(sky: Sky, wind: Wind, dtMs: number) {
    this.sky = sky;
    const cam = this.scene.cameras.main;
    const w = cam.width + MARGIN * 2;
    const h = cam.height + MARGIN * 2;
    for (const t of [this.rt, this.glowRt]) if (t.width !== w || t.height !== h) t.resize(w, h, false);
    // Last frame's view: the follow moves it a pixel or two at most, well inside the margin.
    const ox = Math.floor(cam.worldView.x) - MARGIN;
    const oy = Math.floor(cam.worldView.y) - MARGIN;
    this.rt.setPosition(ox, oy);
    this.glowRt.setPosition(ox, oy);

    // Cloud shadows, drifting with the wind: just the ones over the view.
    const dt = Math.min(dtMs, 250) / 1000;
    this.drift.x += wind.x * CLOUD_DRIFT * dt;
    this.drift.y += wind.y * CLOUD_DRIFT * dt;
    const left = cam.worldView.centerX - FIELD / 2;
    const top = cam.worldView.centerY - FIELD / 2;
    const clouds: { key: string; x: number; y: number }[] = [];
    for (const c of this.clouds) {
      const x = Math.round(left + mod(c.x + this.drift.x - left, FIELD) - ox);
      const y = Math.round(top + mod(c.y + this.drift.y - top, FIELD) - oy);
      if (x + CLOUD_W / 2 > 0 && y + CLOUD_H / 2 > 0 && x - CLOUD_W / 2 < w && y - CLOUD_H / 2 < h) clouds.push({ key: c.key, x, y });
    }

    // Lamps and glows, only once the light starts to go; flashes any time.
    const lamps: { l: Light; x: number; y: number; alpha: number; halo: number }[] = [];
    const add = (l: Light) => {
      const r = l.beam === undefined ? l.radius : l.radius * 1.2;
      if (l.x + r < ox || l.y + r < oy || l.x - r > ox + w || l.y - r > oy + h) return;
      const alpha = Math.min(1, l.intensity);
      if (alpha > 0.02) lamps.push({ l, x: Math.round(l.x - ox), y: Math.round(l.y - oy), alpha, halo: alpha * (l.glow ?? 0) });
    };
    if (sky.night > LAMPS_ON) this.lights((l) => add({ ...l, intensity: l.intensity * sky.night }));
    const now = this.scene.time.now;
    this.flashes = this.flashes.filter((f) => now - f.born < f.ms);
    for (const f of this.flashes) add({ ...f, intensity: (1 - (now - f.born) / f.ms) * (0.25 + 0.75 * sky.night), glow: 0.5 });

    const stamp = (target: Phaser.GameObjects.RenderTexture, p: (typeof lamps)[number], alpha: number) => {
      const { l, x, y } = p;
      if (l.beam === undefined) {
        target.stamp('light_round', undefined, x, y, { scale: l.radius / ROUND_R, tint: l.color, alpha, blendMode: Phaser.BlendModes.ADD });
      } else {
        target.stamp('light_beam', undefined, x, y, { scale: l.radius / 128, rotation: l.beam, originX: 0, originY: 0.5, tint: l.color, alpha, blendMode: Phaser.BlendModes.ADD });
      }
    };

    // Under a clear noon sky with no cloud overhead there is nothing to multiply
    // by, and an empty glow layer adds nothing: skip them (each costs a full-view pass).
    const color = skyColor(sky);
    const rt = this.rt;
    rt.setVisible(color !== 0xffffff || clouds.length > 0);
    if (rt.visible) {
      rt.fill(color);
      for (const c of clouds) rt.stamp(c.key, undefined, c.x, c.y, { tint: 0x000000, alpha: sky.clouds });
      for (const p of lamps) stamp(rt, p, p.alpha);
      rt.render();
    }
    const halos = lamps.filter((p) => p.halo > 0.02);
    const glow = this.glowRt;
    glow.setVisible(halos.length > 0);
    if (glow.visible) {
      glow.clear();
      for (const p of halos) stamp(glow, p, p.halo);
      glow.render();
    }
  }

  destroy() {
    this.rt.destroy();
    this.glowRt.destroy();
  }
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

// 4x4 ordered dither, so soft light falls off in pixel-art steps.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const LEVELS = 6;

/** A greyscale texture from a brightness function (0..1), banded and dithered. */
function bake(scene: Phaser.Scene, key: string, w: number, h: number, f: (x: number, y: number) => number, alphaOnly = false) {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(1, f(x + 0.5, y + 0.5))) * LEVELS;
      const lo = Math.floor(v);
      const q = (BAYER[((y & 3) << 2) | (x & 3)] < v - lo ? lo + 1 : lo) / LEVELS;
      const i = (y * w + x) * 4;
      if (alphaOnly) {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(q * 255);
      } else {
        // Opaque: black adds nothing to the light map.
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(q * 255);
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, canvas);
}

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

function makeTextures(scene: Phaser.Scene) {
  const R = ROUND_R;
  bake(scene, 'light_round', R * 2, R * 2, (x, y) => {
    const d = Math.hypot(x - R, y - R) / R;
    return smooth(1 - d) ** 1.4;
  });
  // A headlight: brightest near the lamp, spreading into a soft-edged cone.
  // (It must fade out before the cone reaches the texture's edges.)
  bake(scene, 'light_beam', 128, 128, (x, y) => {
    const r = Math.hypot(x, y - 64) / 128;
    const a = Math.abs(Math.atan2(y - 64, x));
    const along = smooth(1 - r * 1.15) ** 1.3 * smooth(r * 6);
    const across = smooth((0.42 - a) / 0.26);
    return along * across;
  });
  // Cloud shadows: lumpy blobs with a dithered rim.
  const shapes: [number, number, number][][] = [
    [[60, 70, 50], [120, 60, 62], [185, 78, 48], [140, 100, 40], [90, 105, 34]],
    [[70, 60, 46], [130, 72, 58], [80, 100, 36], [180, 64, 34]],
    [[50, 80, 40], [100, 64, 52], [160, 80, 56], [210, 90, 34], [120, 110, 38]],
  ];
  shapes.forEach((blobs, i) => {
    bake(
      scene,
      CLOUD_KEYS[i],
      CLOUD_W,
      CLOUD_H,
      (x, y) => {
        let v = 0;
        for (const [cx, cy, r] of blobs) v = Math.max(v, 1 - Math.hypot(x - cx, (y - cy) * 1.25) / r);
        return smooth(v * 4);
      },
      true,
    );
  });
}
