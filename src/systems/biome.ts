import { BIOMES, BIOME_IDS, type BiomeId } from '../data/biomes';
import { PLANET, WORLD_SIZE } from '../data/tuning';
import { fbm, rand01 } from './noise';

// Biomes are the Voronoi cells of a jittered grid of sites, with the query
// point warped by noise first so borders wander like coastlines. Each site
// picks its biome from weighted odds; sites near the ship are always dust flats.

const CENTER = WORLD_SIZE / 2;
const SALT_SITE = 11;
const SALT_KIND = 12;
const SALT_WARP = 13;

export interface BiomeSample {
  /** The biome at this point. */
  biome: BiomeId;
  /** The nearest other biome, and how far (px, approx.) the point is from that border. */
  other: BiomeId;
  edge: number;
}

interface Site {
  x: number;
  y: number;
  biome: BiomeId;
}

const siteCache = new Map<string, Site>();

/** The biome site in grid cell (i, j). */
export function siteAt(seed: number, i: number, j: number): Site {
  const key = `${seed}:${i},${j}`;
  let s = siteCache.get(key);
  if (s) return s;
  const cell = PLANET.biomeCell;
  const x = (i + 0.15 + 0.7 * rand01(seed + SALT_SITE, i, j)) * cell;
  const y = (j + 0.15 + 0.7 * rand01(seed + SALT_SITE, j, i + 7919)) * cell;
  s = { x, y, biome: pickBiome(rand01(seed + SALT_KIND, i, j), Math.hypot(x - CENTER, y - CENTER)) };
  if (siteCache.size > 4096) siteCache.clear();
  siteCache.set(key, s);
  return s;
}

/** Weighted pick among the biomes allowed this far out. */
export function pickBiome(u: number, distance: number): BiomeId {
  if (distance < PLANET.homeFlats) return 'flats';
  const allowed = BIOME_IDS.filter((b) => distance >= BIOMES[b].minDistance);
  const total = allowed.reduce((s, b) => s + BIOMES[b].weight, 0);
  let t = u * total;
  for (const b of allowed) {
    t -= BIOMES[b].weight;
    if (t < 0) return b;
  }
  return allowed[allowed.length - 1];
}

/** The warped position used for the biome lookup. */
export function warp(seed: number, x: number, y: number): { x: number; y: number } {
  const w = PLANET.biomeWarp;
  const s = PLANET.biomeWarpScale;
  return {
    x: x + (fbm(seed + SALT_WARP, x, y, s, 3) - 0.5) * 2 * w,
    y: y + (fbm(seed + SALT_WARP + 50, x, y, s, 3) - 0.5) * 2 * w,
  };
}

/** The biome at a world point, with the nearest neighbouring biome and the distance to that border. */
export function biomeAt(seed: number, x: number, y: number): BiomeSample {
  const p = warp(seed, x, y);
  return nearestSites(seed, p.x, p.y);
}

/** The biome lookup after warping (split out so renderers can warp at a coarser grid). */
export function nearestSites(seed: number, px: number, py: number): BiomeSample {
  const cell = PLANET.biomeCell;
  const ci = Math.floor(px / cell);
  const cj = Math.floor(py / cell);
  let best: Site | undefined;
  let bestD = Infinity;
  const near: { s: Site; d: number }[] = [];
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const s = siteAt(seed, ci + di, cj + dj);
      const d = Math.hypot(px - s.x, py - s.y);
      near.push({ s, d });
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
  }
  // Distance to the border with the closest site of a different biome:
  // (d2^2 - d1^2) / (2 |s2 - s1|) is the distance to their bisector.
  let other: BiomeId = best!.biome;
  let edge = Infinity;
  for (const { s, d } of near) {
    if (s.biome === best!.biome) continue;
    const sep = Math.hypot(s.x - best!.x, s.y - best!.y);
    const e = (d * d - bestD * bestD) / (2 * sep);
    if (e < edge) {
      edge = e;
      other = s.biome;
    }
  }
  return { biome: best!.biome, other, edge };
}
