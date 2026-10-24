import { createRng, randRange } from './rng';

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
