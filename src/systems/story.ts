import { LOGS, logId } from '../data/story';
import { PLANET, WORLD_SIZE } from '../data/tuning';
import { biomeAt, siteAt } from './biome';
import { circleClear, featuresIn } from './terrain';

// Where the crew left their caches. Each one sits in a region of its biome
// near the ship and leaning toward the cache before it, so together they make
// a trail out across the planet. Deterministic for a seed.

const CENTER = WORLD_SIZE / 2;
/** Caches keep this far from the ship and from the planet's edge. */
const MIN_FROM_SHIP = 3000;
const EDGE = 1500;
/** Room kept clear round a cache. */
export const CACHE_CLEAR = 48;

export interface CacheSite {
  index: number;
  x: number;
  y: number;
}

const cache = new Map<number, CacheSite[]>();

/** Every cache's position, in log order. */
export function cacheSites(seed: number): CacheSite[] {
  let sites = cache.get(seed);
  if (!sites) {
    sites = findSites(seed);
    cache.set(seed, sites);
  }
  return sites;
}

function findSites(seed: number): CacheSite[] {
  const cell = PLANET.biomeCell;
  const B = PLANET.bounds;
  const lo = Math.floor(B.min / cell);
  const hi = Math.floor(B.max / cell);
  // Every biome site on the planet, far enough from the ship and the edge.
  const all: { x: number; y: number; biome: string }[] = [];
  for (let j = lo; j <= hi; j++) {
    for (let i = lo; i <= hi; i++) {
      const s = siteAt(seed, i, j);
      if (s.x < B.min + EDGE || s.y < B.min + EDGE || s.x > B.max - EDGE || s.y > B.max - EDGE) continue;
      if (Math.hypot(s.x - CENTER, s.y - CENTER) < MIN_FROM_SHIP) continue;
      all.push(s);
    }
  }
  const out: CacheSite[] = [];
  let from = { x: CENTER, y: CENTER };
  const used = new Set<object>();
  LOGS.forEach((log, index) => {
    const prev = from;
    // Mostly near the ship (so every trip stays drivable), a little toward the last cache.
    const dist = (s: { x: number; y: number }) => Math.hypot(s.x - CENTER, s.y - CENTER) + 0.35 * Math.hypot(s.x - prev.x, s.y - prev.y);
    // Nearest site of the right biome; if the planet has none, the nearest unused one.
    const pool = all.filter((s) => !used.has(s));
    const match = pool.filter((s) => s.biome === log.biome);
    const sorted = (match.length ? match : pool).sort((a, b) => dist(a) - dist(b));
    for (const s of sorted) {
      const spot = openSpotNear(seed, s.x, s.y, s.biome);
      if (!spot) continue;
      used.add(s);
      out.push({ index, ...spot });
      from = spot;
      return;
    }
    // Nowhere at all (never seen): fall back to beside the ship.
    out.push({ index, x: CENTER, y: CENTER + 400 + index * 40 });
  });
  return out;
}

/** Open ground in the biome, spiralling out from a site; whole pixels, kept off chunk edges. */
function openSpotNear(seed: number, x: number, y: number, biome: string): { x: number; y: number } | undefined {
  const s = PLANET.chunkSize;
  for (let r = 0; r <= 1600; r += 96) {
    const steps = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 96);
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * r);
      const py = Math.round(y + Math.sin(a) * r);
      // Not on a chunk border, so the cache's clearing belongs to one chunk.
      const lx = ((px % s) + s) % s;
      const ly = ((py % s) + s) % s;
      if (lx < 64 || ly < 64 || lx > s - 64 || ly > s - 64) continue;
      if (Math.hypot(px - CENTER, py - CENTER) < MIN_FROM_SHIP) continue;
      if (biomeAt(seed, px, py).biome !== biome) continue;
      const features = featuresIn(seed, { x0: px - 200, y0: py - 200, x1: px + 200, y1: py + 200 });
      if (!circleClear(features, px, py, 90)) continue;
      return { x: px, y: py };
    }
  }
  return undefined;
}

/** How many logs have been read (they're read in order). */
export function logsRead(discovered: ReadonlySet<string>): number {
  let n = 0;
  while (n < LOGS.length && discovered.has(logId(n))) n++;
  return n;
}

/** The cache whose beacon is calling, or undefined once every log is read. */
export function activeCache(seed: number, discovered: ReadonlySet<string>): CacheSite | undefined {
  const n = logsRead(discovered);
  return n < LOGS.length ? cacheSites(seed)[n] : undefined;
}

/** Caches sitting in a chunk (for keeping props off them). */
export function cachesInChunk(seed: number, cx: number, cy: number): CacheSite[] {
  const s = PLANET.chunkSize;
  return cacheSites(seed).filter((c) => Math.floor(c.x / s) === cx && Math.floor(c.y / s) === cy);
}
