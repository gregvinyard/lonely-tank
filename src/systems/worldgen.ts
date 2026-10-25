import { createRng, randRange } from './rng';
import { BURROWERS, DRONES, OBSTACLES, RESOURCES, SHIP, WORLD_SIZE } from '../data/tuning';
import { placeBurrowers, type BurrowerPlacement } from './burrower';
import { placeDrones, type DronePlacement } from './drone';
import { placeResources, type ResourceNode } from './resources';
import { outerBonus } from './respawn';

export interface RockPlacement {
  x: number;
  y: number;
  angle: number; // random value used to pick the art variant and mirroring
}

export type RockSize = 'small' | 'medium' | 'large';
export type SizedRock = RockPlacement & { size: RockSize };

export interface SizeOptions {
  seed: number;
  sizes: Record<RockSize, { radius: number; weight: number }>;
  gap: number;
  /** Circles a rock must stay clear of (resources, drone homes, the spawn). */
  keepOut: { x: number; y: number; r: number }[];
}

export interface RockOptions {
  seed: number;
  count: number;
  worldSize: number;
  margin: number; // keep rocks this far from the world edge
  center: { x: number; y: number };
  clearRadius: number;
  minSpacing: number;
}

/** Deterministically scatters rocks, keeping the spawn area clear and rocks apart. */
export function placeRocks(o: RockOptions): RockPlacement[] {
  const rng = createRng(o.seed);
  const rocks: RockPlacement[] = [];
  const maxAttempts = o.count * 30;

  for (let i = 0; i < maxAttempts && rocks.length < o.count; i++) {
    const x = randRange(rng, o.margin, o.worldSize - o.margin);
    const y = randRange(rng, o.margin, o.worldSize - o.margin);
    const angle = rng() * Math.PI * 2;
    if (Math.hypot(x - o.center.x, y - o.center.y) < o.clearRadius) continue;
    if (rocks.some((r) => Math.hypot(r.x - x, r.y - y) < o.minSpacing)) continue;
    rocks.push({ x, y, angle });
  }
  return rocks;
}

/**
 * Picks a size for each rock from weighted odds, then shrinks any rock that
 * would crowd a neighbor or a keep-out circle. Positions are untouched, so
 * the rest of the world (and saved progress) is unaffected.
 */
export function sizeRocks(rocks: RockPlacement[], o: SizeOptions): RockSize[] {
  const rng = createRng(o.seed);
  const order: RockSize[] = ['small', 'medium', 'large'];
  const sizes = rocks.map(() => {
    let u = rng();
    for (const s of order) {
      u -= o.sizes[s].weight;
      if (u < 0) return s;
    }
    return 'medium' as RockSize;
  });
  const r = (s: RockSize) => o.sizes[s].radius;
  const fits = (i: number, s: RockSize) =>
    rocks.every((b, j) => j === i || Math.hypot(b.x - rocks[i].x, b.y - rocks[i].y) >= r(s) + r(sizes[j]) + o.gap) &&
    o.keepOut.every((k) => Math.hypot(k.x - rocks[i].x, k.y - rocks[i].y) >= r(s) + k.r + o.gap);
  for (let i = 0; i < rocks.length; i++) {
    if (fits(i, sizes[i])) continue;
    sizes[i] = sizes[i] === 'large' && fits(i, 'medium') ? 'medium' : 'small';
  }
  return sizes;
}

export interface World {
  seed: number;
  center: { x: number; y: number };
  spawn: { x: number; y: number };
  rocks: SizedRock[];
  resources: ResourceNode[];
  drones: DronePlacement[];
  burrowers: BurrowerPlacement[];
}

/** The full deterministic layout of the wasteland for a seed. */
export function generateWorld(seed: number): World {
  const center = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
  const rocks = placeRocks({
    seed,
    count: OBSTACLES.rockCount,
    worldSize: WORLD_SIZE,
    margin: 48,
    center,
    clearRadius: OBSTACLES.clearRadius,
    minSpacing: OBSTACLES.minSpacing,
  });
  const resources = placeResources({
    seed,
    worldSize: WORLD_SIZE,
    margin: 48,
    center,
    avoid: rocks,
    avoidRadius: RESOURCES.rockClearance,
    minSpacing: RESOURCES.minSpacing,
    kinds: { scrap: RESOURCES.scrap, crystal: RESOURCES.crystal },
  });
  const drones = placeDrones({
    seed: seed + 3, // resources use seed + 1 and + 2
    count: DRONES.count,
    worldSize: WORLD_SIZE,
    margin: 64,
    center,
    minDistance: DRONES.minDistance,
    avoid: rocks,
    avoidRadius: DRONES.rockClearance,
    minSpacing: DRONES.minSpacing,
    dropChance: DRONES.scrapDropChance,
  });
  // The tank starts (and is rescued to) just outside the cargo door.
  const spawn = { x: center.x + SHIP.layout.exit.x, y: center.y + SHIP.layout.exit.y };
  const legacySpawn = { x: center.x, y: center.y + SHIP.legacySpawnOffsetY };

  // Static things sit on whole pixels so they move in step with the ground as
  // the camera scrolls (fractional positions round at different moments and jiggle).
  const snap = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) });
  const snappedRocks = rocks.map(snap);
  const snappedResources = resources
    .map(snap)
    .map((n) => ({ ...n, amount: n.amount + outerBonus(Math.hypot(n.x - center.x, n.y - center.y), RESOURCES.outerBonus) }));
  const snappedDrones = drones.map(snap);

  const sizes = sizeRocks(snappedRocks, {
    seed: seed + 4, // seed..seed+3 are used above
    sizes: OBSTACLES.sizes,
    gap: OBSTACLES.sizeGap,
    keepOut: [
      ...snappedResources.map((n) => ({ x: n.x, y: n.y, r: 16 })),
      ...snappedDrones.map((d) => ({ x: d.x, y: d.y, r: DRONES.bodyRadius })),
      { ...legacySpawn, r: 40 },
    ],
  });
  const sizedRocks = snappedRocks.map((r, i) => ({ ...r, size: sizes[i] }));

  // Burrowers came later (v0.3): placed last, from their own seed, so nothing
  // above changes and existing saves keep the same world.
  const burrowers = placeBurrowers({
    seed: seed + 5,
    count: BURROWERS.count,
    worldSize: WORLD_SIZE,
    margin: 80,
    center,
    minDistance: BURROWERS.minDistance,
    avoid: [
      ...sizedRocks.map((r) => ({ x: r.x, y: r.y, r: OBSTACLES.sizes[r.size].radius + BURROWERS.rockClearance })),
      ...snappedDrones.map((d) => ({ x: d.x, y: d.y, r: BURROWERS.droneClearance })),
      ...snappedResources.map((n) => ({ x: n.x, y: n.y, r: 30 })),
    ],
    minSpacing: BURROWERS.minSpacing,
    extraDropChance: BURROWERS.extraDropChance,
  });
  return {
    seed,
    center,
    spawn,
    burrowers,
    rocks: sizedRocks,
    resources: snappedResources,
    drones: snappedDrones,
  };
}
