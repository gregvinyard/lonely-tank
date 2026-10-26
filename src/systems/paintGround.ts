import { BIOMES, MATERIAL_TILES, type BiomeId } from '../data/biomes';
import { PLANET } from '../data/tuning';
import { nearestSites, warp } from './biome';
import { hash3, rand01, valueNoise } from './noise';
import { blobDepth, canyonDepth, featuresIn, type Blob, type Canyon, type Feature } from './terrain';

// Paints one chunk of ground into an RGBA buffer: biome ground with dithered
// borders, then mesas (top, cliff face, shadow), canyons (north wall, dark
// depths) and lakes (foam, shallows, wet shore). Pure: the same inputs always
// paint the same pixels, and the shapes match collision exactly because both
// use the same distance functions.

export interface Material {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export interface Materials {
  /** The home sand, already laid out with flips (repeats every `w` px). */
  flats: Material;
  /** The 16 tiles of ground_tiles.png, each 32x32. */
  tiles: Material[];
  /** The biome grounds of ground_large.png, each 128x128. */
  large: Material[];
  /** The liquid tiles recoloured for ichor lakes. */
  ichor: Material[];
}

const SIZE = PLANET.chunkSize;
const BLOCK = 8; // biome lookups every 8 px
const SALT_DITHER = 41;
const SALT_TILE = 42;
const SALT_SHADE = 43;
const SALT_FLIP = 44;
const SALT_MIX = 45;
const ACID_DEEP = [14, 78, 30];
const ICHOR_DEEP = [70, 24, 92];

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** A deterministic per-pixel value in [0, 1). */
const dither = (x: number, y: number) => rand01(SALT_DITHER, x >> 1, y >> 1);

export function paintChunk(seed: number, cx: number, cy: number, features: readonly Feature[], m: Materials): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  const x0 = cx * SIZE;
  const y0 = cy * SIZE;

  // Biome per 8 px block (sampled at the block's centre).
  const nb = SIZE / BLOCK;
  const blockBiome: BiomeId[] = [];
  const blockOther: BiomeId[] = [];
  const blockEdge = new Float32Array(nb * nb);
  const blockShade = new Float32Array(nb * nb);
  for (let by = 0; by < nb; by++) {
    for (let bx = 0; bx < nb; bx++) {
      const wx = x0 + bx * BLOCK + BLOCK / 2;
      const wy = y0 + by * BLOCK + BLOCK / 2;
      const p = warp(seed, wx, wy);
      const s = nearestSites(seed, p.x, p.y);
      const k = by * nb + bx;
      blockBiome[k] = s.biome;
      blockOther[k] = s.other;
      blockEdge[k] = s.edge;
      blockShade[k] = 0.93 + 0.14 * valueNoise(seed + SALT_SHADE, wx, wy, 220);
    }
  }
  // Which of two offset copies of the ground texture each 4 px spot shows. The
  // copies meet along wandering lines, which breaks up both the tile's repeat
  // and its seams.
  const nm = SIZE / 4;
  const mix = new Float32Array(nm * nm);
  for (let my = 0; my < nm; my++) {
    for (let mx = 0; mx < nm; mx++) mix[my * nm + mx] = valueNoise(seed + SALT_MIX, x0 + mx * 4 + 2, y0 + my * 4 + 2, 72);
  }

  // Each 32 px cell flips its tile at random, so the repeat doesn't line up into a grid.
  const tileAt = (tile: number, x: number, y: number, o: number[], flipY = true) => {
    const t = m.tiles[tile];
    const h = hash3(seed + SALT_FLIP, x >> 5, y >> 5);
    let tx = mod(x, 32);
    let ty = mod(y, 32);
    if (h & 2) tx = 31 - tx;
    if (flipY && h & 4) ty = 31 - ty;
    const i = (ty * 32 + tx) * 4;
    o[0] = t.data[i];
    o[1] = t.data[i + 1];
    o[2] = t.data[i + 2];
  };
  const variant = (pair: readonly [number, number] | readonly number[], x: number, y: number) =>
    pair[hash3(seed + SALT_TILE, Math.floor(x / 32), Math.floor(y / 32)) & 1];

  const c = [0, 0, 0];
  const groundColor = (biome: BiomeId, x: number, y: number) => {
    const g = BIOMES[biome].ground;
    if (g === -1) {
      const f = m.flats;
      const i = (mod(y, f.h) * f.w + mod(x, f.w)) * 4;
      c[0] = f.data[i];
      c[1] = f.data[i + 1];
      c[2] = f.data[i + 2];
      return;
    }
    const t = m.large[g];
    const n = mix[((mod(y, SIZE) >> 2) * (SIZE >> 2)) + (mod(x, SIZE) >> 2)];
    // A grainy edge where the two copies meet, in 2 px steps.
    const second = n + (dither(x, y) - 0.5) * 0.08 > 0.5;
    const i = second ? (mod(y + 71, 128) * 128 + mod(x + 45, 128)) * 4 : (mod(y, 128) * 128 + mod(x, 128)) * 4;
    // A slow light and dark drift hides the repeat further.
    const k = blockShade[((mod(y, SIZE) / BLOCK) | 0) * nb + ((mod(x, SIZE) / BLOCK) | 0)];
    c[0] = t.data[i] * k;
    c[1] = t.data[i + 1] * k;
    c[2] = t.data[i + 2] * k;
  };

  const blobs = features.filter((f): f is Blob => f.kind !== 'canyon');
  const canyons = features.filter((f): f is Canyon => f.kind === 'canyon');
  const H = PLANET.mesaHeight;
  const W = PLANET.canyonWall;

  for (let py = 0; py < SIZE; py++) {
    const y = y0 + py;
    for (let px = 0; px < SIZE; px++) {
      const x = x0 + px;
      const k = ((py / BLOCK) | 0) * nb + ((px / BLOCK) | 0);
      let biome = blockBiome[k];
      const edge = blockEdge[k];
      if (edge < PLANET.biomeBlend && dither(x, y) < 0.5 * (1 - edge / PLANET.biomeBlend)) biome = blockOther[k];
      groundColor(biome, x, y);
      let r = c[0];
      let g = c[1];
      let b = c[2];

      for (const f of blobs) {
        if (x < f.box.x0 - 16 || x > f.box.x1 + 16 || y < f.box.y0 - 16 || y > f.box.y1 + 16) continue;
        if (f.kind === 'lake') {
          const d = blobDepth(f, x, y);
          if (d > 0) {
            // Bright shallows near the shore, darker liquid farther out.
            const tiles = f.liquid === 'acid' ? [m.tiles[MATERIAL_TILES.liquid[0]], m.tiles[MATERIAL_TILES.liquid[1]]] : m.ichor;
            const src = tiles[d < 10 ? 0 : 1];
            const i = (mod(y, 32) * 32 + mod(x, 32)) * 4;
            const lr = src.data[i] * 0.88;
            const lg = src.data[i + 1] * 0.88;
            const lb = src.data[i + 2] * 0.88;
            if (d < 1.5) {
              // Foam line at the shore.
              r = lr * 0.4 + 230 * 0.6;
              g = lg * 0.4 + 240 * 0.6;
              b = lb * 0.4 + 220 * 0.6;
            } else if (d < 7) {
              // Shallows: the liquid over the shore.
              r = lr * 0.6 + r * 0.25;
              g = lg * 0.6 + g * 0.25;
              b = lb * 0.6 + b * 0.25;
            } else {
              // Calm the repeating ripples out toward the middle.
              const deep = 1 - Math.min(0.35, d / 300);
              const calm = Math.min(0.55, d / 120);
              const base = f.liquid === 'acid' ? ACID_DEEP : ICHOR_DEEP;
              r = (lr * (1 - calm) + base[0] * calm) * deep;
              g = (lg * (1 - calm) + base[1] * calm) * deep;
              b = (lb * (1 - calm) + base[2] * calm) * deep;
            }
            break;
          } else if (d > -5) {
            // Wet shore.
            r *= 0.72;
            g *= 0.72;
            b *= 0.7;
          }
        } else {
          const top = blobDepth(f, x, y + H);
          if (top > 0) {
            tileAt(variant(MATERIAL_TILES.mesaTop, x, y), x, y, c, false);
            r = c[0];
            g = c[1];
            b = c[2];
            if (top < 1.2) {
              r = 40;
              g = 22;
              b = 20;
            } else if (top < 3.5) {
              r = Math.min(255, r * 1.25);
              g = Math.min(255, g * 1.2);
              b = Math.min(255, b * 1.15);
            }
            break;
          }
          const base = blobDepth(f, x, y);
          if (base > 0) {
            tileAt(variant(MATERIAL_TILES.cliff, x, y), x, y, c, false);
            // Darker toward the foot of the cliff.
            const foot = Math.max(0, Math.min(1, 1 - base / H));
            const k2 = 0.95 - 0.3 * foot;
            r = c[0] * k2;
            g = c[1] * k2;
            b = c[2] * k2;
            if (base < 1.2) {
              r = 40;
              g = 22;
              b = 20;
            }
            break;
          }
          // The mesa's shadow, cast down and to the right.
          if (blobDepth(f, x - 10, y - 4) > 0) {
            r *= 0.68;
            g *= 0.66;
            b *= 0.72;
          }
        }
      }

      for (const f of canyons) {
        if (x < f.box.x0 - 4 || x > f.box.x1 + 4 || y < f.box.y0 - 4 || y > f.box.y1 + 4) continue;
        const d = canyonDepth(f, x, y);
        if (d > 0) {
          if (d < 1.2) {
            r = 30;
            g = 18;
            b = 18;
          } else if (canyonDepth(f, x, y - W) <= 0) {
            // The north wall faces us: lit rock, darkening as it drops.
            tileAt(variant(MATERIAL_TILES.cliff, x, y), x, y, c, false);
            let down = 0;
            for (let s = 1; s <= W; s++) if (canyonDepth(f, x, y - s) > 0) down++;
            const k3 = 0.85 - 0.5 * (down / W);
            r = c[0] * k3;
            g = c[1] * k3;
            b = c[2] * k3;
          } else {
            // The depths.
            const fade = Math.max(0, 1 - d / 10);
            r = 14 + 26 * fade;
            g = 10 + 14 * fade;
            b = 16 + 14 * fade;
          }
          break;
        } else if (d > -2) {
          // Lit lip of the far rim.
          r = Math.min(255, r * 1.18);
          g = Math.min(255, g * 1.15);
          b = Math.min(255, b * 1.1);
        }
      }

      const o = (py * SIZE + px) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Paints a chunk, working out its features first. */
export function paintGroundChunk(seed: number, cx: number, cy: number, m: Materials): Uint8ClampedArray {
  const features = featuresIn(seed, { x0: cx * SIZE - 64, y0: cy * SIZE - 64, x1: (cx + 1) * SIZE + 64, y1: (cy + 1) * SIZE + 64 });
  return paintChunk(seed, cx, cy, features, m);
}
