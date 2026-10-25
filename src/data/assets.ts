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
  {
    // Crashed ship, nose pointing up-right. Collision is a circle at the center.
    key: 'spaceship',
    file: 'assets/spaceship.png',
    width: 128,
    height: 128,
    placeholder: (g) => {
      // Scorched ground and skid
      g.fillStyle(0x000000, 0.22).fillEllipse(66, 70, 120, 96);
      g.fillStyle(0x3a2a22, 0.5).fillEllipse(40, 96, 50, 26);
      // Wings
      g.fillStyle(PALETTE.metalDark).fillTriangle(22, 58, 64, 40, 70, 82).fillTriangle(70, 82, 52, 112, 92, 76);
      g.fillStyle(PALETTE.metal).fillTriangle(28, 60, 62, 46, 66, 76).fillTriangle(72, 84, 58, 104, 88, 78);
      // Fuselage
      g.fillStyle(PALETTE.metalDark).fillEllipse(66, 62, 92, 40);
      g.fillStyle(0x9aa0a6).fillEllipse(66, 60, 84, 32);
      g.fillStyle(PALETTE.rust).fillRect(44, 54, 30, 12);
      // Cockpit and engines
      g.fillStyle(PALETTE.teal).fillEllipse(100, 58, 18, 12);
      g.fillStyle(0x2c2e31).fillRect(18, 52, 10, 8).fillRect(18, 64, 10, 8);
      g.fillStyle(PALETTE.violet).fillRect(16, 54, 3, 4).fillRect(16, 66, 3, 4);
      // Hull breach
      g.fillStyle(0x1a1210).fillTriangle(56, 66, 70, 62, 62, 74);
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
    width: 32,
    height: 32,
    placeholder: (g) => {
      for (let r = 16; r > 0; r -= 2) g.fillStyle(r > 8 ? PALETTE.violet : PALETTE.teal, 0.1).fillCircle(16, 16, r);
    },
  },
  {
    // Soft dust puff kicked up by the treads.
    key: 'dust',
    width: 8,
    height: 8,
    placeholder: (g) => {
      g.fillStyle(PALETTE.sandLight, 0.5).fillCircle(4, 4, 4);
      g.fillStyle(PALETTE.sandLight, 0.8).fillCircle(4, 4, 2);
    },
  },
];
