import { describe, expect, it } from 'vitest';
import { WORLD_SEED } from '../src/data/tuning';
import { UPGRADES } from '../src/data/upgrades';
import { generateWorld } from '../src/systems/worldgen';

// One "sweep" = collecting every node and destroying every drone and burrower once. Salvage
// regrows and drones return, so the climb takes several sweeps; this keeps it
// in the 30-60 minute range the v0.2 spec aims for.
describe('balance', () => {
  const world = generateWorld(WORLD_SEED);
  const sweep = {
    scrap: world.drones.reduce((n, d) => n + d.drop, 0),
    crystal: world.burrowers.reduce((n, b) => n + b.drop, 0),
    circuit: world.drones.length,
  };
  for (const n of world.resources) sweep[n.kind as 'scrap' | 'crystal'] += n.amount;
  // The home economy: every tier that needs nothing from the outer biomes.
  const rare = ['prism', 'spore', 'salt', 'relic'] as const;
  const total = { scrap: 0, crystal: 0, circuit: 0 };
  for (const u of UPGRADES) {
    for (const t of u.tiers) {
      if (rare.some((k) => t.cost[k])) continue;
      for (const k of ['scrap', 'crystal', 'circuit'] as const) total[k] += t.cost[k] ?? 0;
    }
  }

  it('building every home tier takes between 2 and 5 sweeps of each resource', () => {
    for (const k of ['scrap', 'crystal', 'circuit'] as const) {
      const sweeps = total[k] / sweep[k];
      expect(sweeps, k).toBeGreaterThan(2);
      expect(sweeps, k).toBeLessThan(5);
    }
  });

  it('a first upgrade is affordable from the salvage near the ship', () => {
    const near = { scrap: 0, crystal: 0 };
    for (const n of world.resources) {
      if (Math.hypot(n.x - world.center.x, n.y - world.center.y) < 800) near[n.kind as 'scrap' | 'crystal'] += n.amount;
    }
    const cheapest = Math.min(...UPGRADES.map((u) => u.tiers[0].cost.scrap ?? 0));
    expect(near.scrap).toBeGreaterThan(cheapest * 2);
    expect(near.crystal).toBeGreaterThan(2);
  });
});
