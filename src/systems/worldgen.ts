import { createRng, randRange } from './rng';
import { OBSTACLES, RESOURCES, SHIP, WORLD_SIZE } from '../data/tuning';
import { placeResources, type ResourceNode } from './resources';

export interface RockPlacement {
  x: number;
  y: number;
  angle: number; // visual rotation only, radians
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

export interface World {
  center: { x: number; y: number };
  spawn: { x: number; y: number };
  rocks: RockPlacement[];
  resources: ResourceNode[];
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
  return { center, spawn: { x: center.x, y: center.y + SHIP.spawnOffsetY }, rocks, resources };
}
