import { BIOMES, type BiomeId, type FeatureKind } from '../data/biomes';
import { PLANET, WORLD_SIZE } from '../data/tuning';
import { biomeAt } from './biome';
import { cellSeed } from './noise';
import { createRng, randRange, type Rng } from './rng';

// The planet's impassable ground: mesas (raised plateaus with a cliff face),
// canyons (long chasms) and lakes of alien liquid. Each feature cell holds at
// most one group, kept inside the cell with a gap all round, and every shape
// is star-shaped (blobs) or a band along a gentle curve (canyons). So no two
// features ever touch, and no open ground is ever walled in.

export interface Blob {
  kind: 'mesa' | 'lake';
  x: number;
  y: number;
  r: number;
  /** Shape wobble: r(θ) = r (1 + Σ a cos(kθ + p)). */
  waves: { a: number; k: number; p: number }[];
  liquid: 'acid' | 'ichor';
  box: Box;
}

export interface Canyon {
  kind: 'canyon';
  /** Centre line, every CANYON_STEP px. */
  pts: { x: number; y: number }[];
  /** Half width at each point (tapers to 0 at the ends). */
  half: number[];
  box: Box;
}

export type Feature = Blob | Canyon;
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const SALT_FEATURE = 21;
const CANYON_STEP = 16;
/** Most a blob's edge reaches past its base radius. */
const WOBBLE = 0.32;

const cellCache = new Map<string, Feature[]>();

/** Feature cells covering the planet. */
export function featureCellRange() {
  const c = PLANET.featureCell;
  return { min: Math.floor(PLANET.bounds.min / c), max: Math.ceil(PLANET.bounds.max / c) - 1 };
}

/** The features in feature cell (i, j). Deterministic and cached. */
export function featuresInCell(seed: number, i: number, j: number): Feature[] {
  const key = `${seed}:${i},${j}`;
  const hit = cellCache.get(key);
  if (hit) return hit;
  const out = buildCell(seed, i, j);
  if (cellCache.size > 2048) cellCache.clear();
  cellCache.set(key, out);
  return out;
}

function buildCell(seed: number, i: number, j: number): Feature[] {
  const range = featureCellRange();
  if (i < range.min || i > range.max || j < range.min || j > range.max) return [];
  const c = PLANET.featureCell;
  const inner: Box = { x0: i * c + PLANET.featureInset, y0: j * c + PLANET.featureInset, x1: (i + 1) * c - PLANET.featureInset, y1: (j + 1) * c - PLANET.featureInset };
  const rng = createRng(cellSeed(seed, SALT_FEATURE, i, j));
  const cx = (i + 0.5) * c;
  const cy = (j + 0.5) * c;
  const biome = biomeAt(seed, cx, cy).biome;
  const kind = pickFeature(rng(), biome);
  if (!kind) return [];
  const liquid = BIOMES[biome].liquid;
  let out: Feature[] = [];
  if (kind === 'canyon') {
    const canyon = makeCanyon(rng, inner, biome);
    if (canyon) out = [canyon];
  } else {
    out = makeBlobGroup(rng, inner, kind, biome, liquid);
  }
  // The home square (and a margin round it) stays as it always was.
  const k = PLANET.homeKeepOut;
  const home: Box = { x0: -k, y0: -k, x1: WORLD_SIZE + k, y1: WORLD_SIZE + k };
  return out.filter((f) => !overlaps(f.box, home));
}

function pickFeature(u: number, biome: BiomeId): FeatureKind | undefined {
  for (const [kind, p] of Object.entries(BIOMES[biome].features) as [FeatureKind, number][]) {
    u -= p;
    if (u < 0) return kind;
  }
  return undefined;
}

function blobBox(x: number, y: number, r: number, kind: Blob['kind']): Box {
  const e = r * (1 + WOBBLE);
  const up = kind === 'mesa' ? PLANET.mesaHeight : 0;
  return { x0: x - e, y0: y - e - up, x1: x + e, y1: y + e };
}

function makeBlob(rng: Rng, x: number, y: number, r: number, kind: Blob['kind'], liquid: Blob['liquid']): Blob {
  // Wobble amplitudes add up to at most WOBBLE, so the shape stays star-shaped
  // around its centre (no holes, no pockets).
  const n = 3 + Math.floor(rng() * 3);
  const waves = [];
  let left = WOBBLE;
  for (let w = 0; w < n; w++) {
    const a = w === n - 1 ? left * rng() : left * (0.25 + 0.5 * rng());
    left -= a;
    waves.push({ a, k: 2 + Math.floor(rng() * 3) + w, p: rng() * Math.PI * 2 });
  }
  return { kind, x, y, r, waves, liquid, box: blobBox(x, y, r, kind) };
}

function makeBlobGroup(rng: Rng, inner: Box, kind: 'mesa' | 'lake', biome: BiomeId, liquid: Blob['liquid']): Feature[] {
  const big = biome === 'badlands' || biome === 'mire';
  const maxR = Math.min((inner.x1 - inner.x0) / 2, (inner.y1 - inner.y0) / 2) / (1 + WOBBLE) - PLANET.mesaHeight;
  const r = Math.min(maxR, big ? randRange(rng, 200, 520) : randRange(rng, 110, 300));
  // Room to slide the main blob around inside the cell.
  const slack = Math.max(0, (inner.x1 - inner.x0) / 2 - r * (1 + WOBBLE) - PLANET.mesaHeight);
  const mx = (inner.x0 + inner.x1) / 2 + randRange(rng, -slack, slack);
  const my = (inner.y0 + inner.y1) / 2 + randRange(rng, -slack, slack);
  const blobs: Blob[] = [makeBlob(rng, mx, my, r, kind, liquid)];
  // Smaller buttes or ponds round it, never touching each other: the gap
  // between any two is wider than the tank.
  const satellites = Math.floor(rng() * (big ? 5 : 3));
  for (let s = 0; s < satellites * 6 && blobs.length <= satellites; s++) {
    const sr = randRange(rng, 50, Math.max(60, r * 0.4));
    const x = randRange(rng, inner.x0, inner.x1);
    const y = randRange(rng, inner.y0, inner.y1);
    const b = blobBox(x, y, sr, kind);
    if (!inside(b, inner)) continue;
    if (blobs.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + sr) * (1 + WOBBLE) + PLANET.mesaHeight + 70)) continue;
    blobs.push(makeBlob(rng, x, y, sr, kind, liquid));
  }
  return blobs;
}

function makeCanyon(rng: Rng, inner: Box, biome: BiomeId): Canyon | undefined {
  const angle = rng() * Math.PI;
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const perp = { x: -dir.y, y: dir.x };
  const waves = [0, 1].map(() => ({ a: randRange(rng, 30, 130), l: randRange(rng, 140, 320), p: rng() * Math.PI * 2 }));
  const widthWave = { l: randRange(rng, 120, 260), p: rng() * Math.PI * 2 };
  const baseHalf = biome === 'badlands' ? randRange(rng, 30, 48) : randRange(rng, 24, 38);
  const cx = (inner.x0 + inner.x1) / 2 + randRange(rng, -200, 200);
  const cy = (inner.y0 + inner.y1) / 2 + randRange(rng, -200, 200);
  let length = randRange(rng, 800, 1700);
  for (let tries = 0; tries < 6; tries++, length *= 0.8) {
    const pts: { x: number; y: number }[] = [];
    const half: number[] = [];
    const n = Math.floor(length / CANYON_STEP);
    const taper = 140;
    for (let s = 0; s <= n; s++) {
      const t = s * CANYON_STEP;
      // A perpendicular wiggle of a straight line: the centre line is a graph
      // over its axis, so it can never loop back on itself.
      const off = waves.reduce((sum, w) => sum + w.a * Math.sin(t / w.l + w.p), 0);
      const along = t - length / 2;
      pts.push({ x: cx + dir.x * along + perp.x * off, y: cy + dir.y * along + perp.y * off });
      const end = Math.min(t, length - t);
      const tip = Math.min(1, end / taper);
      half.push(Math.max(4, baseHalf * (0.8 + 0.25 * Math.sin(t / widthWave.l + widthWave.p)) * Math.sqrt(tip)));
    }
    const pad = baseHalf * 1.1;
    const box: Box = {
      x0: Math.min(...pts.map((p) => p.x)) - pad,
      y0: Math.min(...pts.map((p) => p.y)) - pad,
      x1: Math.max(...pts.map((p) => p.x)) + pad,
      y1: Math.max(...pts.map((p) => p.y)) + pad,
    };
    if (inside(box, inner)) return { kind: 'canyon', pts, half, box };
  }
  return undefined;
}

function inside(b: Box, outer: Box) {
  return b.x0 >= outer.x0 && b.y0 >= outer.y0 && b.x1 <= outer.x1 && b.y1 <= outer.y1;
}

export function overlaps(a: Box, b: Box) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/** Every feature whose box meets the given box. */
export function featuresIn(seed: number, box: Box): Feature[] {
  const c = PLANET.featureCell;
  const out: Feature[] = [];
  for (let j = Math.floor(box.y0 / c); j <= Math.floor(box.y1 / c); j++) {
    for (let i = Math.floor(box.x0 / c); i <= Math.floor(box.x1 / c); i++) {
      for (const f of featuresInCell(seed, i, j)) if (overlaps(f.box, box)) out.push(f);
    }
  }
  return out;
}

const LUT_SIZE = 720;
const luts = new WeakMap<Blob, Float32Array>();

/** The blob's edge radius round the full circle, so lookups need no trig series. */
function blobLut(b: Blob): Float32Array {
  let lut = luts.get(b);
  if (lut) return lut;
  lut = new Float32Array(LUT_SIZE + 1);
  for (let i = 0; i <= LUT_SIZE; i++) {
    const th = (i / LUT_SIZE) * Math.PI * 2 - Math.PI;
    let k = 1;
    for (const w of b.waves) k += w.a * Math.cos(w.k * th + w.p);
    lut[i] = b.r * k;
  }
  luts.set(b, lut);
  return lut;
}

/** Signed distance into a blob's base outline at a point: > 0 inside (approximate, px). */
export function blobDepth(b: Blob, x: number, y: number): number {
  const dx = x - b.x;
  const dy = y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const e = b.r * (1 + WOBBLE);
  if (d > e + 64) return e - d; // far outside: no need to be exact
  const lut = blobLut(b);
  const f = ((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * LUT_SIZE;
  const i = Math.floor(f);
  const r = lut[i] + (lut[Math.min(LUT_SIZE, i + 1)] - lut[i]) * (f - i);
  return r - d;
}

const BUCKET = 64;
const buckets = new WeakMap<Canyon, Map<number, number[]>>();
const bucketKey = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);

/** Canyon segments grouped by 64 px cell (each listed in every cell it comes near). */
function canyonBuckets(c: Canyon): Map<number, number[]> {
  let m = buckets.get(c);
  if (m) return m;
  m = new Map();
  for (let s = 0; s < c.pts.length - 1; s++) {
    const a = c.pts[s];
    const b = c.pts[s + 1];
    const pad = Math.max(c.half[s], c.half[s + 1]) + 4;
    for (let j = Math.floor((Math.min(a.y, b.y) - pad) / BUCKET); j <= Math.floor((Math.max(a.y, b.y) + pad) / BUCKET); j++) {
      for (let i = Math.floor((Math.min(a.x, b.x) - pad) / BUCKET); i <= Math.floor((Math.max(a.x, b.x) + pad) / BUCKET); i++) {
        const k = bucketKey(i, j);
        const list = m.get(k);
        if (list) list.push(s);
        else m.set(k, [s]);
      }
    }
  }
  buckets.set(c, m);
  return m;
}

/** Signed distance into a canyon at a point: > 0 inside (px). Only exact within a few px of it. */
export function canyonDepth(c: Canyon, x: number, y: number): number {
  const list = canyonBuckets(c).get(bucketKey(Math.floor(x / BUCKET), Math.floor(y / BUCKET)));
  if (!list) return -BUCKET;
  let best = -BUCKET;
  for (const s of list) {
    const a = c.pts[s];
    const b = c.pts[s + 1];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len2 = ex * ex + ey * ey;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / len2));
    const qx = x - (a.x + ex * t);
    const qy = y - (a.y + ey * t);
    const h = c.half[s] + (c.half[s + 1] - c.half[s]) * t;
    const v = h - Math.sqrt(qx * qx + qy * qy);
    if (v > best) best = v;
  }
  return best;
}

/** What the ground is at a point, for drawing and for collision. */
export type GroundKind = 'open' | 'liquid' | 'canyon' | 'mesaTop' | 'mesaFace';

export interface GroundSample {
  kind: GroundKind;
  /** px inside the feature (for shading the edges). */
  depth: number;
  feature?: Feature;
}

const OPEN: GroundSample = { kind: 'open', depth: 0 };

/**
 * The ground at a point. A mesa's top is its outline lifted by mesaHeight;
 * between the top and the base outline is the cliff face.
 */
export function groundAt(features: readonly Feature[], x: number, y: number): GroundSample {
  for (const f of features) {
    if (x < f.box.x0 || x > f.box.x1 || y < f.box.y0 || y > f.box.y1) continue;
    if (f.kind === 'canyon') {
      const d = canyonDepth(f, x, y);
      if (d > 0) return { kind: 'canyon', depth: d, feature: f };
    } else if (f.kind === 'lake') {
      const d = blobDepth(f, x, y);
      if (d > 0) return { kind: 'liquid', depth: d, feature: f };
    } else {
      const top = blobDepth(f, x, y + PLANET.mesaHeight);
      if (top > 0) return { kind: 'mesaTop', depth: top, feature: f };
      const base = blobDepth(f, x, y);
      if (base > 0) return { kind: 'mesaFace', depth: base, feature: f };
    }
  }
  return OPEN;
}

/** True where nothing can drive. */
export function blockedAt(features: readonly Feature[], x: number, y: number): boolean {
  return groundAt(features, x, y).kind !== 'open';
}

/** True if a circle is clear of impassable ground (checked round its rim and at its centre). */
export function circleClear(features: readonly Feature[], x: number, y: number, r: number): boolean {
  if (blockedAt(features, x, y)) return false;
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    if (blockedAt(features, x + Math.cos(th) * r, y + Math.sin(th) * r)) return false;
  }
  return true;
}

/**
 * How far to move a circle so it no longer overlaps impassable ground, or
 * undefined if it doesn't. Pushes away from the blocked part of its rim.
 */
export function pushOut(features: readonly Feature[], x: number, y: number, r: number): { x: number; y: number } | undefined {
  if (circleClear(features, x, y, r)) return undefined;
  let px = 0;
  let py = 0;
  for (let a = 0; a < 24; a++) {
    const th = (a / 24) * Math.PI * 2;
    if (blockedAt(features, x + Math.cos(th) * r, y + Math.sin(th) * r)) {
      px -= Math.cos(th);
      py -= Math.sin(th);
    }
  }
  const len = Math.hypot(px, py);
  if (len < 1e-6) return { x: 0, y: 0 };
  const ux = px / len;
  const uy = py / len;
  for (let step = 1; step <= 40; step++) {
    if (circleClear(features, x + ux * step, y + uy * step, r)) return { x: ux * step, y: uy * step };
  }
  return { x: ux * 40, y: uy * 40 };
}
