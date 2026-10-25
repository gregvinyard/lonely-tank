import { createRng, randRange } from './rng';

export type ResourceKind = 'scrap' | 'crystal';

export interface ResourceNode {
  /** Stable across reloads for the same seed, e.g. "scrap-07". */
  id: string;
  kind: ResourceKind;
  amount: number;
  x: number;
  y: number;
  angle: number; // visual rotation only, radians
}

export interface ResourceKindOptions {
  count: number;
  minAmount: number;
  maxAmount: number;
  /** Minimum distance from the world center (the ship). */
  minDistance: number;
}

export interface ResourceOptions {
  seed: number;
  worldSize: number;
  margin: number;
  center: { x: number; y: number };
  avoid: { x: number; y: number }[]; // rock centers
  avoidRadius: number;
  minSpacing: number;
  kinds: Record<ResourceKind, ResourceKindOptions>;
}

/** Deterministically scatters scrap and crystals away from the ship, rocks and each other. */
export function placeResources(o: ResourceOptions): ResourceNode[] {
  const nodes: ResourceNode[] = [];
  // Each kind gets its own RNG stream so tuning one kind doesn't reshuffle the other.
  (['scrap', 'crystal'] as const).forEach((kind, k) => {
    const opts = o.kinds[kind];
    const rng = createRng(o.seed + k + 1);
    let placed = 0;
    for (let i = 0; i < opts.count * 40 && placed < opts.count; i++) {
      const x = randRange(rng, o.margin, o.worldSize - o.margin);
      const y = randRange(rng, o.margin, o.worldSize - o.margin);
      const angle = rng() * Math.PI * 2;
      const amount = opts.minAmount + Math.floor(rng() * (opts.maxAmount - opts.minAmount + 1));
      if (Math.hypot(x - o.center.x, y - o.center.y) < opts.minDistance) continue;
      if (o.avoid.some((p) => Math.hypot(p.x - x, p.y - y) < o.avoidRadius)) continue;
      if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) < o.minSpacing)) continue;
      nodes.push({ id: `${kind}-${String(placed).padStart(2, '0')}`, kind, amount, x, y, angle });
      placed++;
    }
  });
  return nodes;
}

/** The closest node within `range` of `pos`, or undefined. */
export function nearestInRange<T extends { x: number; y: number }>(
  pos: { x: number; y: number },
  nodes: Iterable<T>,
  range: number,
): T | undefined {
  let best: T | undefined;
  let bestDist = range;
  for (const n of nodes) {
    const d = Math.hypot(n.x - pos.x, n.y - pos.y);
    if (d <= bestDist) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}
