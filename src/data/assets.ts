import type * as Phaser from 'phaser';
import { PALETTE } from './tuning';
import { createRng } from '../systems/rng';

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
  placeholder: (g: Phaser.GameObjects.Graphics, w: number, h: number) => void;
}

export const ASSETS: AssetDef[] = [
  {
    key: 'terrain_ground',
    width: 32,
    height: 32,
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
    placeholder: (g) => {
      g.fillStyle(PALETTE.metal).fillRect(32, 30, 24, 4);
      g.fillStyle(PALETTE.metalDark).fillRect(54, 29, 4, 6);
      g.fillStyle(PALETTE.metalDark).fillCircle(32, 32, 10);
      g.fillStyle(PALETTE.metal).fillCircle(32, 32, 8);
      g.fillStyle(PALETTE.teal).fillRect(28, 30, 3, 4);
    },
  },
  {
    key: 'rock',
    width: 64,
    height: 64,
    placeholder: (g) => {
      g.fillStyle(0x000000, 0.25).fillEllipse(34, 38, 52, 40);
      g.fillStyle(0x5a4a5e).fillCircle(32, 32, 24);
      g.fillStyle(0x705d73).fillCircle(28, 27, 17);
      g.fillStyle(0x8a7590).fillCircle(24, 22, 7);
    },
  },
];
