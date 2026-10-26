import { BIOMES, type BiomeContents, type BiomeId } from '../data/biomes';
import { FLORA_FRAMES, LANDMARK_SHAPES, PROP_FRAMES, PROP_SHAPES } from '../data/propShapes';
import { BURROWERS, DRONES, OBSTACLES, PLANET, RESOURCES, SHIP, WORLD_SIZE } from '../data/tuning';
import { biomeAt } from './biome';
import type { BurrowerPlacement } from './burrower';
import type { DronePlacement } from './drone';
import { cellSeed } from './noise';
import type { ResourceNode } from './resources';
import { createRng, randRange, type Rng } from './rng';
import type { Circle } from './steer';
import { circleClear, featuresIn, type Feature } from './terrain';
import type { RockSize } from './worldgen';

// Everything that sits on one 512 px chunk of the planet outside the home
// square, rebuilt on demand from the seed and the chunk's coordinates. Ids
// carry the chunk (e.g. "scrap@12,-3#1"), so a collected node or a destroyed
// drone can always be traced back to where it came from.

export type PropFamily = 'rock' | 'fungus' | 'spire' | 'ruin' | 'landmark';

export interface Prop {
  family: PropFamily;
  /** Frame in the family's atlas (for rocks: the variant index). */
  frame: number;
  size?: RockSize;
  x: number;
  y: number;
  flip: boolean;
  tint: number;
  /** Collision, in world coordinates. */
  circles: Circle[];
}

export interface Decor {
  frame: number;
  x: number;
  y: number;
  flip: boolean;
}

export interface FuelSeep {
  id: string;
  x: number;
  y: number;
  frame: number;
  amount: number;
}

export type LandmarkKind = 'bones' | 'monolith' | 'saucer';

export interface Landmark {
  id: string;
  kind: LandmarkKind;
  name: string;
  frame: number;
  x: number;
  y: number;
}

export interface ChunkContent {
  cx: number;
  cy: number;
  biome: BiomeId;
  features: Feature[];
  props: Prop[];
  decor: Decor[];
  resources: ResourceNode[];
  seeps: FuelSeep[];
  drones: DronePlacement[];
  burrowers: BurrowerPlacement[];
  landmarks: Landmark[];
}

const SALT_CHUNK = 31;
const CENTER = WORLD_SIZE / 2;
/** Room left between solid things: wider than the tank, so nothing seals a gap. */
const PASSAGE = 2 * 23 + 4;
/** Hostiles and salvage keep this far from the ship. */
const HOSTILE_MIN = SHIP.clearRadius + 2400;

export const LANDMARKS: Record<LandmarkKind, { name: string; frames: number[]; solid: boolean }> = {
  bones: { name: 'Leviathan bones', frames: [0, 1], solid: false },
  monolith: { name: 'The Monolith', frames: [2], solid: true },
  saucer: { name: 'Fallen saucer', frames: [3], solid: true },
};

export const chunkKey = (cx: number, cy: number) => `${cx},${cy}`;

/** The chunk a world point is in. */
export function chunkOf(x: number, y: number) {
  return { cx: Math.floor(x / PLANET.chunkSize), cy: Math.floor(y / PLANET.chunkSize) };
}

/** The chunk an id was generated in, or undefined for home-square (legacy) ids. */
export function chunkOfId(id: string): { cx: number; cy: number } | undefined {
  const m = /@(-?\d+),(-?\d+)/.exec(id);
  return m ? { cx: Number(m[1]), cy: Number(m[2]) } : undefined;
}

/** The home square is the original hand-tuned map: no generated content there. */
export function isHomeChunk(cx: number, cy: number) {
  const n = WORLD_SIZE / PLANET.chunkSize;
  return cx >= 0 && cy >= 0 && cx < n && cy < n;
}

/** Chunks covering the planet. */
export function chunkRange() {
  const s = PLANET.chunkSize;
  return { min: Math.floor(PLANET.bounds.min / s), max: Math.ceil(PLANET.bounds.max / s) - 1 };
}

const cache = new Map<string, ChunkContent>();

/** The contents of a chunk. Deterministic; recently used chunks are cached. */
export function chunkContent(seed: number, cx: number, cy: number): ChunkContent {
  const key = `${seed}:${cx},${cy}`;
  const hit = cache.get(key);
  if (hit) {
    // Refresh its place in the LRU order.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const c = buildChunk(seed, cx, cy);
  cache.set(key, c);
  if (cache.size > 160) cache.delete(cache.keys().next().value as string);
  return c;
}

/** n = the expected count, rounded up or down at random. */
function count(rng: Rng, expected: number) {
  return Math.floor(expected) + (rng() < expected % 1 ? 1 : 0);
}

function buildChunk(seed: number, cx: number, cy: number): ChunkContent {
  const s = PLANET.chunkSize;
  const x0 = cx * s;
  const y0 = cy * s;
  const features = featuresIn(seed, { x0: x0 - 64, y0: y0 - 64, x1: x0 + s + 64, y1: y0 + s + 64 });
  const biome = biomeAt(seed, x0 + s / 2, y0 + s / 2).biome;
  const out: ChunkContent = { cx, cy, biome, features, props: [], decor: [], resources: [], seeps: [], drones: [], burrowers: [], landmarks: [] };
  const range = chunkRange();
  if (isHomeChunk(cx, cy) || cx < range.min || cx > range.max || cy < range.min || cy > range.max) return out;

  const rng = createRng(cellSeed(seed, SALT_CHUNK, cx, cy));
  const def = BIOMES[biome].contents;
  const solids: Circle[] = [];
  const fromShip = (x: number, y: number) => Math.hypot(x - CENTER, y - CENTER);
  /** A random spot in the chunk, kept `edge` px in from its sides. */
  const spot = (edge: number) => ({ x: Math.round(randRange(rng, x0 + edge, x0 + s - edge)), y: Math.round(randRange(rng, y0 + edge, y0 + s - edge)) });
  const local = (x: number, y: number) => biomeAt(seed, x, y).biome;
  /** Clear of impassable ground and of every solid placed so far. */
  const clear = (circles: Circle[], gap: number) =>
    circles.every((c) => circleClear(features, c.x, c.y, c.r + PLANET.terrainMargin)) &&
    circles.every((c) => solids.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= o.r + c.r + gap));
  const want = (k: keyof BiomeContents, x: number, y: number) => BIOMES[local(x, y)].contents[k] > 0;

  // A landmark first, so it gets the room it needs.
  if (rng() < def.landmark) {
    const kinds: LandmarkKind[] = biome === 'mire' ? ['saucer'] : biome === 'ruins' ? ['monolith', 'saucer'] : ['bones', 'monolith', 'saucer'];
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const L = LANDMARKS[kind];
    const frame = L.frames[Math.floor(rng() * L.frames.length)];
    const p = spot(96);
    const circles = LANDMARK_SHAPES[frame].map(([dx, dy, r]) => ({ x: p.x + dx, y: p.y + dy, r }));
    if (circleClear(features, p.x, p.y, 80) && fromShip(p.x, p.y) > HOSTILE_MIN) {
      out.landmarks.push({ id: `lm@${cx},${cy}`, kind, name: L.name, frame, x: p.x, y: p.y });
      if (L.solid) {
        out.props.push({ family: 'landmark', frame, x: p.x, y: p.y, flip: false, tint: 0xffffff, circles });
        solids.push(...circles);
      } else {
        // Driven over, but nothing else is placed on top of it.
        solids.push({ x: p.x, y: p.y, r: 40 });
      }
    }
  }

  // Ruins are laid out on a street grid; other props scatter.
  if (biome === 'ruins') {
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        if (rng() > 0.55) continue;
        const x = Math.round(x0 + 64 + gx * 128 + randRange(rng, -14, 14));
        const y = Math.round(y0 + 64 + gy * 128 + randRange(rng, -14, 14));
        placeProp(rng, 'ruin', x, y);
      }
    }
  } else {
    for (let n = count(rng, def.props), tries = 0; n > 0 && tries < 30; tries++) {
      const p = spot(48);
      const fam = local(p.x, p.y) === 'glass' ? 'spire' : local(p.x, p.y) === 'ruins' ? 'ruin' : 'fungus';
      if (!want('props', p.x, p.y)) continue;
      if (placeProp(rng, fam, p.x, p.y)) n--;
    }
  }
  function placeProp(r: Rng, family: 'fungus' | 'spire' | 'ruin', x: number, y: number) {
    const frames = PROP_FRAMES[family];
    const frame = frames[Math.floor(r() * frames.length)];
    const flip = family !== 'ruin' && r() < 0.5;
    const circles = PROP_SHAPES[frame].map(([dx, dy, rr]) => ({ x: x + (flip ? -dx : dx), y: y + dy, r: rr }));
    // Keep the whole sprite inside the chunk, so neighbouring chunks never crowd it.
    const inside = circles.every((c) => c.x - c.r >= x0 + 25 && c.y - c.r >= y0 + 25 && c.x + c.r <= x0 + s - 25 && c.y + c.r <= y0 + s - 25);
    if (!inside || !clear(circles, PASSAGE)) return false;
    out.props.push({ family, frame, x, y, flip, tint: 0xffffff, circles });
    solids.push(...circles);
    return true;
  }

  // Boulders, tinted to the local rock.
  const sizes: RockSize[] = ['small', 'medium', 'large'];
  for (let n = count(rng, def.rocks), tries = 0; n > 0 && tries < 30; tries++) {
    const size = sizes[Math.floor(rng() * 3)];
    const r = OBSTACLES.sizes[size].radius;
    const p = spot(r + 25);
    const circle = { x: p.x, y: p.y, r };
    const variant = rng();
    const flip = rng() < 0.5;
    if (!clear([circle], PASSAGE)) continue;
    out.props.push({ family: 'rock', frame: variant, size, x: p.x, y: p.y, flip, tint: BIOMES[local(p.x, p.y)].rockTint, circles: [circle] });
    solids.push(circle);
    n--;
  }

  // Ground scatter, drawn under the tank.
  for (let n = count(rng, def.decor), tries = 0; n > 0 && tries < 60; tries++) {
    const p = spot(16);
    const b = local(p.x, p.y);
    const frames = FLORA_FRAMES[b];
    const frame = frames[Math.floor(rng() * frames.length)];
    if (!circleClear(features, p.x, p.y, 10) || solids.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < o.r + 10)) continue;
    out.decor.push({ frame, x: p.x, y: p.y, flip: rng() < 0.5 });
    n--;
  }

  // Salvage: more of it, and richer, the farther out it lies.
  const bonus = Math.min(3, Math.floor(fromShip(x0 + s / 2, y0 + s / 2) / 7000));
  let index = 0;
  const kinds = [
    ['scrap', 1, 3],
    ['crystal', 1, 2],
    ['circuit', 1, 2],
  ] as const;
  for (const [kind, lo, hi] of kinds) {
    for (let n = count(rng, def[kind]), tries = 0; n > 0 && tries < 20; tries++) {
      const p = spot(32);
      if (fromShip(p.x, p.y) < HOSTILE_MIN || !circleClear(features, p.x, p.y, 26)) continue;
      if (solids.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < o.r + 30)) continue;
      if (out.resources.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < RESOURCES.minSpacing)) continue;
      const amount = lo + Math.floor(rng() * (hi - lo + 1)) + bonus;
      out.resources.push({ id: `${kind}@${cx},${cy}#${index++}`, kind, amount, x: p.x, y: p.y, angle: rng() * Math.PI * 2 });
      n--;
    }
  }
  for (let n = count(rng, def.seep), tries = 0; n > 0 && tries < 20; tries++) {
    const p = spot(32);
    if (fromShip(p.x, p.y) < HOSTILE_MIN || !circleClear(features, p.x, p.y, 26)) continue;
    if (solids.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < o.r + 30)) continue;
    out.seeps.push({ id: `seep@${cx},${cy}#${out.seeps.length}`, x: p.x, y: p.y, frame: Math.floor(rng() * 4), amount: 35 + 10 * bonus });
    n--;
  }

  // Hostiles get bolder farther out.
  const far = fromShip(x0 + s / 2, y0 + s / 2);
  const threat = 1 + far / 20000;
  if (far > HOSTILE_MIN) {
    for (let n = count(rng, def.drone * threat), tries = 0; n > 0 && tries < 10; tries++) {
      const p = spot(64);
      if (solids.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < o.r + DRONES.bodyRadius + 20)) continue;
      const drop = rng() < DRONES.scrapDropChance ? 1 + Math.floor(rng() * 2) : 0;
      out.drones.push({ id: `drone@${cx},${cy}#${out.drones.length}`, x: p.x, y: p.y, drop });
      n--;
    }
    for (let n = count(rng, def.burrower * threat), tries = 0; n > 0 && tries < 10; tries++) {
      const p = spot(80);
      if (!circleClear(features, p.x, p.y, BURROWERS.roamRadius / 2)) continue;
      if (solids.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < o.r + BURROWERS.rockClearance + BURROWERS.bodyRadius)) continue;
      const drop = 1 + (rng() < BURROWERS.extraDropChance ? 1 : 0);
      out.burrowers.push({ id: `burrower@${cx},${cy}#${out.burrowers.length}`, x: p.x, y: p.y, drop });
      n--;
    }
  }
  return out;
}

/** A world-generated resource node by id (from a chunk), if it exists. */
export function chunkResource(seed: number, id: string): ResourceNode | undefined {
  const c = chunkOfId(id);
  return c && chunkContent(seed, c.cx, c.cy).resources.find((n) => n.id === id);
}
