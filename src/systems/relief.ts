import { fbm } from './noise';

// Rolling ground: a slow height field lit from the upper left (the way all
// the art is lit), so open ground swells into low dunes and hollows. Worked out
// on a coarse grid from world coordinates, so neighbouring chunks meet exactly.

const SALT = 46;
/** Grid spacing, px. */
export const RELIEF_STEP = 4;
const SCALE = 340; // px across the broadest swells
const SLOPE = 5.5; // brightness per unit of height change across a node
const HOLLOW = 0.2; // low ground a little darker, crests a little lighter
/** Brightness levels are this far apart; pixels dither between neighbours. */
export const RELIEF_LEVEL = 0.035;

const height = (seed: number, x: number, y: number) => fbm(seed + SALT, x, y, SCALE, 3);

/** The ground's brightness at a grid node, around 1 (roughly 0.85..1.15). */
export function reliefAt(seed: number, x: number, y: number): number {
  const s = RELIEF_STEP;
  const h = height(seed, x, y);
  // Ground rising toward the lower right faces the light.
  const slope = height(seed, x + s, y + s) - height(seed, x - s, y - s);
  return 1 + SLOPE * slope + HOLLOW * (h - 0.5);
}

/**
 * Brightness at every RELIEF_STEP node of a `size` px square starting at
 * (x0, y0), including the far edge: (size / RELIEF_STEP + 1) nodes a side.
 */
export function reliefGrid(seed: number, x0: number, y0: number, size: number): Float32Array {
  const s = RELIEF_STEP;
  const n = size / s + 1;
  // Heights with a one-node border, so each slope reuses its neighbours.
  const m = n + 2;
  const h = new Float32Array(m * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) h[j * m + i] = height(seed, x0 + (i - 1) * s, y0 + (j - 1) * s);
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = h[(j + 1) * m + i + 1];
      const slope = h[(j + 2) * m + i + 2] - h[j * m + i];
      out[j * n + i] = 1 + SLOPE * slope + HOLLOW * (c - 0.5);
    }
  }
  return out;
}

/** Bilinear brightness at a pixel inside the grid (px, py relative to its origin). */
export function sampleRelief(grid: Float32Array, size: number, px: number, py: number): number {
  const s = RELIEF_STEP;
  const n = size / s + 1;
  const gx = px / s;
  const gy = py / s;
  const i = Math.min(n - 2, Math.floor(gx));
  const j = Math.min(n - 2, Math.floor(gy));
  const tx = gx - i;
  const ty = gy - j;
  const a = grid[j * n + i];
  const b = grid[j * n + i + 1];
  const c = grid[(j + 1) * n + i];
  const d = grid[(j + 1) * n + i + 1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Snaps a brightness to its level, dithering by `u` (0..1) toward the next one up. */
export function quantize(k: number, u: number): number {
  const v = k / RELIEF_LEVEL;
  const base = Math.floor(v);
  return (u < v - base ? base + 1 : base) * RELIEF_LEVEL;
}
