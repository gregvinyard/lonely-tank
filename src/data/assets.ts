import type * as Phaser from 'phaser';
import { PALETTE } from './tuning';
import { createRng } from '../systems/rng';
import type { RockSize } from '../systems/worldgen';

// Centralized asset manifest.
//
// Every texture the game uses is listed here under a stable key. If `file` is
// set, the PNG under public/assets/ is loaded; otherwise (or if loading fails)
// the `placeholder` function draws a stand-in texture at the same size.
// Gameplay code only ever refers to the key, so art can be swapped freely.

export interface AssetDef {
  key: string;
  width: number;
  height: number;
  /** Path relative to the site root, e.g. 'assets/tank_hull.png'. */
  file?: string;
  /** A sheet of square frames this size, numbered left to right. */
  frameSize?: number;
  placeholder: (g: Phaser.GameObjects.Graphics, w: number, h: number) => void;
}

/** Boulder art by size; the canvas is square with the rock centered. */
export const ROCK_VARIANTS: Record<RockSize, { keys: string[]; size: number }> = {
  small: { keys: ['rock_s1', 'rock_s2'], size: 32 },
  medium: { keys: ['rock', 'rock_2', 'rock_3'], size: 64 },
  large: { keys: ['rock_l1', 'rock_l2'], size: 96 },
};

function drawRockPlaceholder(g: Phaser.GameObjects.Graphics, w: number) {
  const k = w / 64;
  g.fillStyle(0x000000, 0.25).fillEllipse(34 * k, 38 * k, 52 * k, 40 * k);
  g.fillStyle(0x5a4a5e).fillCircle(32 * k, 32 * k, 24 * k);
  g.fillStyle(0x705d73).fillCircle(28 * k, 27 * k, 17 * k);
  g.fillStyle(0x8a7590).fillCircle(24 * k, 22 * k, 7 * k);
}

export const ASSETS: AssetDef[] = [
  {
    // One seamless sand tile; BootScene lays it out with seeded flips into the
    // larger 'terrain' texture so the repeat isn't noticeable.
    key: 'terrain_ground',
    width: 32,
    height: 32,
    file: 'assets/terrain_ground.png',
    placeholder: (g, w, h) => {
      g.fillStyle(PALETTE.sand).fillRect(0, 0, w, h);
      const rng = createRng(99);
      for (let i = 0; i < 14; i++) {
        const c = rng() < 0.5 ? PALETTE.sandDark : PALETTE.sandLight;
        g.fillStyle(c).fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 1 + Math.floor(rng() * 2), 1);
      }
    },
  },
  {
    // Forward = +X (right). Rotation pivot = canvas center.
    key: 'tank_hull',
    width: 64,
    height: 64,
    file: 'assets/tank_hull.png',
    placeholder: (g) => {
      // Treads
      g.fillStyle(PALETTE.metalDark).fillRect(12, 14, 40, 9).fillRect(12, 41, 40, 9);
      g.fillStyle(0x2c2e31);
      for (let x = 14; x < 52; x += 5) g.fillRect(x, 14, 2, 9).fillRect(x, 41, 2, 9);
      // Body
      g.fillStyle(PALETTE.rust).fillRect(16, 22, 34, 20);
      g.fillStyle(0xb5603a).fillRect(18, 24, 30, 16);
      // Front plate highlight (points right)
      g.fillStyle(PALETTE.sandLight).fillRect(46, 25, 3, 14);
      g.fillStyle(PALETTE.teal).fillRect(20, 30, 3, 4);
    },
  },
  {
    // Barrel along +X from canvas center.
    key: 'tank_turret',
    width: 64,
    height: 64,
    file: 'assets/tank_turret.png',
    placeholder: (g) => {
      g.fillStyle(PALETTE.metal).fillRect(32, 30, 24, 4);
      g.fillStyle(PALETTE.metalDark).fillRect(54, 29, 4, 6);
      g.fillStyle(PALETTE.metalDark).fillCircle(32, 32, 10);
      g.fillStyle(PALETTE.metal).fillCircle(32, 32, 8);
      g.fillStyle(PALETTE.teal).fillRect(28, 30, 3, 4);
    },
  },
  // Boulders, lit from the top-left like the other sprites, so they're only
  // ever flipped, never rotated. The variant is picked per rock from its seed.
  ...Object.values(ROCK_VARIANTS).flatMap(({ keys, size }) =>
    keys.map(
      (key): AssetDef => ({
        key,
        width: size,
        height: size,
        file: `assets/${key}.png`,
        placeholder: drawRockPlaceholder,
      }),
    ),
  ),
  {
    // Crashed ship, nose up, open cargo bay at the bottom center (the door is
    // a separate sprite). Collision is a set of circles in SHIP.layout.
    key: 'spaceship',
    file: 'assets/spaceship.png',
    width: 320,
    height: 256,
    placeholder: (g) => {
      g.fillStyle(0x45484d).fillRoundedRect(110, 12, 100, 232, 30).fillTriangle(110, 100, 44, 160, 110, 170).fillTriangle(210, 100, 276, 160, 210, 170);
      g.fillStyle(0x9aa0a6).fillRoundedRect(116, 18, 88, 220, 26);
      g.fillStyle(0x100c0d).fillRect(133, 195, 55, 45);
      g.fillStyle(PALETTE.teal).fillRect(146, 34, 28, 20);
    },
  },
  {
    // Cargo bay floor (the opening is cut out of the ship) plus the loading
    // ramp below it. Drawn under the tank, so the tank drives onto it.
    key: 'ship_bay',
    file: 'assets/ship_bay.png',
    width: 55,
    height: 67,
    placeholder: (g) => {
      g.fillStyle(0x1c1a1e).fillRect(0, 0, 55, 49);
      g.fillStyle(0x5c5b64).fillRect(0, 49, 55, 16);
    },
  },
  {
    // One solar panel, hinge along its bottom edge (toward the tank). The
    // tank slides one out each side; the other is flipped.
    key: 'solar_panel',
    file: 'assets/solar_panel.png',
    width: 30,
    height: 25,
    placeholder: (g) => {
      g.fillStyle(0x0d0b10).fillRect(0, 0, 30, 23);
      g.fillStyle(0x1c2a5c).fillRect(1, 1, 28, 21);
      g.fillStyle(0x6f7378).fillRect(11, 23, 8, 2);
    },
  },
  {
    // Cargo door shutter, 55x45, drawn over the bay opening; slides up to open.
    key: 'ship_door',
    file: 'assets/ship_door.png',
    width: 55,
    height: 45,
    placeholder: (g) => {
      g.fillStyle(0xc2940f).fillRect(0, 0, 55, 45);
      g.fillStyle(0x2d2a2c);
      for (let y = 4; y < 45; y += 8) g.fillRect(0, y, 55, 3);
    },
  },
  {
    // Pile of salvage metal.
    key: 'scrap',
    file: 'assets/scrap.png',
    width: 32,
    height: 32,
    placeholder: (g) => {
      g.fillStyle(0x000000, 0.25).fillEllipse(17, 19, 26, 18);
      g.fillStyle(PALETTE.metalDark).fillRect(6, 12, 14, 9);
      g.fillStyle(PALETTE.metal).fillRect(12, 8, 12, 8).fillTriangle(8, 22, 18, 18, 14, 26);
      g.fillStyle(PALETTE.rust).fillRect(18, 16, 8, 7).fillRect(9, 13, 4, 3);
      g.fillStyle(0xb8bcc0).fillRect(13, 9, 6, 2);
    },
  },
  {
    // Cluster of glowing energy crystals.
    key: 'crystal',
    file: 'assets/crystal.png',
    width: 32,
    height: 32,
    placeholder: (g) => {
      g.fillStyle(0x000000, 0.25).fillEllipse(16, 20, 22, 14);
      g.fillStyle(0x4b2f7a).fillTriangle(8, 22, 12, 8, 16, 22).fillTriangle(16, 23, 22, 6, 26, 21);
      g.fillStyle(PALETTE.violet).fillTriangle(10, 21, 12, 10, 15, 21).fillTriangle(18, 22, 22, 9, 24, 20);
      g.fillStyle(PALETTE.teal).fillTriangle(12, 24, 16, 12, 20, 24);
      g.fillStyle(0xa8f0e6).fillRect(15, 14, 2, 6);
    },
  },
  {
    // Soft pulsing halo under crystals so they read from a distance.
    key: 'glow',
    width: 64,
    height: 64,
    placeholder: (g) => {
      for (let r = 32; r > 0; r -= 4) g.fillStyle(r > 16 ? PALETTE.violet : PALETTE.teal, 0.1).fillCircle(32, 32, r);
    },
  },
  {
    // Hostile sentry drone: round and symmetric, so it never needs rotating.
    key: 'drone',
    width: 48,
    height: 48,
    file: 'assets/drone.png',
    placeholder: (g) => {
      for (const [cx, cy] of [[10, 10], [38, 10], [10, 38], [38, 38]]) {
        g.lineStyle(4, 0x2d283a).lineBetween(24, 24, cx, cy);
        g.fillStyle(0x2d283a).fillCircle(cx, cy, 7);
        g.fillStyle(0x464056).fillCircle(cx, cy, 5);
      }
      g.fillStyle(0x2d283a).fillCircle(24, 24, 12);
      g.fillStyle(0x544a68).fillCircle(24, 24, 10);
      g.fillStyle(PALETTE.violet).fillCircle(24, 24, 6);
      g.fillStyle(0xe6463c).fillCircle(24, 24, 4);
    },
  },
  {
    // Burrower bursting out of its hole (only shown while surfaced).
    key: 'burrower',
    width: 48,
    height: 48,
    file: 'assets/burrower.png',
    placeholder: (g) => {
      g.fillStyle(0x1e1416).fillCircle(24, 24, 16);
      g.fillStyle(0xc98a2a).fillCircle(24, 22, 10);
      g.fillStyle(PALETTE.violet).fillRect(26, 20, 2, 2);
    },
  },
  {
    // The sand mound over a buried burrower.
    key: 'mound',
    width: 32,
    height: 32,
    file: 'assets/mound.png',
    placeholder: (g) => {
      g.fillStyle(0x7a4f38).fillEllipse(17, 18, 24, 16);
      g.fillStyle(PALETTE.sandLight).fillEllipse(15, 15, 22, 14);
    },
  },
  {
    // Small mound left in a burrower's wake; fades out.
    key: 'mound_trail',
    width: 12,
    height: 8,
    placeholder: (g) => {
      g.fillStyle(0x8a5a40).fillEllipse(6.5, 4.5, 11, 7);
      g.fillStyle(0xd09a78).fillEllipse(5.5, 3.5, 9, 5);
      g.fillStyle(0xe2b294).fillRect(4, 2, 3, 1);
    },
  },
  {
    // Circuit board dropped by destroyed drones.
    key: 'circuit',
    width: 32,
    height: 32,
    file: 'assets/circuit.png',
    placeholder: (g) => {
      g.fillStyle(0x0d0b10).fillRect(8, 9, 16, 14);
      g.fillStyle(0x2f6b3a).fillRect(9, 10, 14, 12);
      g.fillStyle(0xd8b04a).fillRect(11, 12, 10, 1).fillRect(11, 19, 10, 1);
      g.fillStyle(0x3fb8a8).fillRect(14, 14, 4, 4);
    },
  },
  // Rare materials (v0.7), one per outer biome, and the crew's emergency cache.
  ...(
    [
      ['prism', 0x9ff6ff],
      ['spore', 0x2fa88a],
      ['salt', 0xc8f060],
      ['relic', 0xb07a30],
      ['cache', 0xe07a28],
    ] as const
  ).map(
    ([key, color]): AssetDef => ({
      key,
      width: 32,
      height: 32,
      file: `assets/${key}.png`,
      placeholder: (g) => {
        g.fillStyle(0x0d0b10).fillRect(8, 9, 16, 15);
        g.fillStyle(color).fillRect(9, 10, 14, 13);
      },
    }),
  ),
  // 32x32 upgrade icons for the workshop cards.
  ...['plating', 'fuel', 'engine', 'autoloader', 'barrel', 'ap', 'scanner', 'repair', 'power', 'transmitter'].map(
    (name): AssetDef => ({
      key: `up_${name}`,
      width: 32,
      height: 32,
      file: `assets/up_${name}.png`,
      placeholder: (g) => {
        g.fillStyle(0x0d0b10).fillRect(4, 4, 24, 24);
        g.fillStyle(0x5f636b).fillRect(5, 5, 22, 22);
        g.fillStyle(0x3fb8a8).fillRect(12, 12, 8, 8);
      },
    }),
  ),
  {
    // Soft ground shadow under hovering drones.
    key: 'shadow',
    width: 28,
    height: 10,
    placeholder: (g) => {
      g.fillStyle(0x000000, 0.28).fillEllipse(14, 5, 28, 10);
    },
  },
  {
    // Cannon shell, pointing +X.
    key: 'shell',
    width: 8,
    height: 4,
    placeholder: (g) => {
      g.fillStyle(0xf6d27a).fillRect(0, 1, 8, 2);
      g.fillStyle(0xfff4d6).fillRect(4, 0, 3, 4);
    },
  },
  {
    // Muzzle flash.
    key: 'flash',
    width: 10,
    height: 10,
    placeholder: (g) => {
      g.fillStyle(0xf6d27a).fillCircle(5, 5, 5);
      g.fillStyle(0xfff4d6).fillCircle(5, 5, 3);
    },
  },
  {
    // Impact and explosion spark.
    key: 'spark',
    width: 3,
    height: 3,
    placeholder: (g) => {
      g.fillStyle(0xf6a04a).fillRect(0, 0, 3, 3);
      g.fillStyle(0xfff4d6).fillRect(1, 1, 1, 1);
    },
  },
  {
    // Soft dust puff kicked up by the treads.
    key: 'dust',
    width: 10,
    height: 10,
    placeholder: (g) => {
      // Pale enough to read against the PixelLab sand.
      g.fillStyle(0xead6b8, 0.75).fillCircle(5, 5, 5);
      g.fillStyle(0xfaf0e0, 1).fillCircle(5, 5, 3);
    },
  },
  // v0.6 planet art (PixelLab), packed into sheets by the art pipeline.
  {
    // Seamless 32 px ground and material tiles; see MATERIAL_TILES and BIOMES.
    key: 'ground_tiles',
    width: 512,
    height: 32,
    file: 'assets/ground_tiles.png',
    placeholder: (g, w, h) => {
      const colors = [0x9c4a2a, 0x9c4a2a, 0xc9b6e8, 0xc9b6e8, 0x2c6e6a, 0x2c6e6a, 0x5d6b2c, 0x5d6b2c, 0x7a7090, 0x7a7090, 0xc0703a, 0xc0703a, 0x7fe050, 0x60c040, 0x6a4030, 0x6a4030];
      colors.forEach((c, i) => g.fillStyle(c).fillRect(i * 32, 0, 32, h));
      void w;
    },
  },
  {
    // Seamless 128 px biome grounds (badlands, glass, bloom, mire, ruins).
    key: 'ground_large',
    width: 640,
    height: 128,
    file: 'assets/ground_large.png',
    placeholder: (g, w, h) => {
      [0x9c4a2a, 0xc9b6e8, 0x2c6e6a, 0x5d6b2c, 0x7a7090].forEach((c, i) => g.fillStyle(c).fillRect(i * 128, 0, 128, h));
      void w;
    },
  },
  ...(
    [
      ['flora', 33 * 32, 32, 32],
      ['props', 30 * 64, 64, 64],
      ['seep', 4 * 32, 32, 32],
      ['landmarks', 4 * 128, 128, 128],
    ] as const
  ).map(
    ([key, width, height, frameSize]): AssetDef => ({
      key,
      width,
      height,
      frameSize,
      file: `assets/${key}.png`,
      placeholder: (g, w) => {
        for (let x = 0; x < w; x += frameSize) g.fillStyle(0x3fb8a8).fillCircle(x + frameSize / 2, frameSize / 2, frameSize / 3);
      },
    }),
  ),
  // Title screen (v0.7).
  {
    key: 'title_bg',
    width: 320,
    height: 180,
    file: 'assets/title_bg.png',
    placeholder: (g, w, h) => {
      g.fillStyle(0x2a1f3d).fillRect(0, 0, w, h);
      g.fillStyle(PALETTE.sandDark).fillRect(0, h * 0.65, w, h * 0.35);
    },
  },
  {
    key: 'title_logo',
    width: 140,
    height: 60,
    file: 'assets/title_logo.png',
    placeholder: (g, w, h) => {
      g.fillStyle(PALETTE.rust).fillRect(4, 4, w - 8, h / 2 - 6);
      g.fillStyle(PALETTE.teal).fillRect(24, h / 2 + 2, w - 48, h / 2 - 6);
    },
  },
];
