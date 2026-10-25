import { describe, expect, it } from 'vitest';
import { RESOURCES, SHIP, WORLD_SEED, WORLD_SIZE } from '../src/data/tuning';
import { nearestInRange } from '../src/systems/resources';
import { generateWorld } from '../src/systems/worldgen';

describe('generateWorld resources', () => {
  const world = generateWorld(WORLD_SEED);

  it('is deterministic for a seed, with stable ids', () => {
    expect(generateWorld(WORLD_SEED).resources).toEqual(world.resources);
    expect(world.resources.find((r) => r.id === 'scrap-00')).toBeDefined();
    expect(world.resources.find((r) => r.id === 'crystal-00')).toBeDefined();
  });

  it('places every requested node with unique ids', () => {
    const scrap = world.resources.filter((r) => r.kind === 'scrap');
    const crystal = world.resources.filter((r) => r.kind === 'crystal');
    expect(scrap).toHaveLength(RESOURCES.scrap.count);
    expect(crystal).toHaveLength(RESOURCES.crystal.count);
    expect(new Set(world.resources.map((r) => r.id)).size).toBe(world.resources.length);
  });

  it('keeps resources off rocks, apart, in bounds and away from the ship', () => {
    const { resources, rocks, center } = world;
    for (const n of resources) {
      const opts = RESOURCES[n.kind as 'scrap' | 'crystal'];
      expect(Math.hypot(n.x - center.x, n.y - center.y)).toBeGreaterThanOrEqual(opts.minDistance);
      expect(Math.hypot(n.x - center.x, n.y - center.y)).toBeGreaterThan(SHIP.safeRadius);
      expect(n.amount).toBeGreaterThanOrEqual(opts.minAmount);
      expect(n.amount).toBeLessThanOrEqual(opts.maxAmount);
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(WORLD_SIZE);
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(WORLD_SIZE);
      for (const r of rocks) expect(Math.hypot(n.x - r.x, n.y - r.y)).toBeGreaterThanOrEqual(RESOURCES.rockClearance);
    }
    for (let i = 0; i < resources.length; i++) {
      for (let j = i + 1; j < resources.length; j++) {
        const d = Math.hypot(resources[i].x - resources[j].x, resources[i].y - resources[j].y);
        expect(d).toBeGreaterThanOrEqual(RESOURCES.minSpacing);
      }
    }
  });

  it('spawns the tank clear of the ship and rocks', () => {
    const { spawn, center, rocks } = world;
    expect(Math.hypot(spawn.x - center.x, spawn.y - center.y)).toBeGreaterThan(SHIP.bodyRadius + 20);
    for (const r of rocks) expect(Math.hypot(spawn.x - r.x, spawn.y - r.y)).toBeGreaterThan(80);
  });

  it('leaves enough salvage for the plating upgrade (8 scrap, 2 crystals)', () => {
    const total = (k: string) => world.resources.filter((r) => r.kind === k).reduce((s, r) => s + r.amount, 0);
    expect(total('scrap')).toBeGreaterThanOrEqual(8);
    expect(total('crystal')).toBeGreaterThanOrEqual(2);
  });
});

describe('nearestInRange', () => {
  const nodes = [
    { id: 'a', x: 10, y: 0 },
    { id: 'b', x: 30, y: 0 },
    { id: 'c', x: -5, y: 0 },
  ];

  it('returns the closest node within range', () => {
    expect(nearestInRange({ x: 0, y: 0 }, nodes, 40)?.id).toBe('c');
    expect(nearestInRange({ x: 25, y: 0 }, nodes, 40)?.id).toBe('b');
  });

  it('returns undefined when nothing is in range', () => {
    expect(nearestInRange({ x: 100, y: 100 }, nodes, 40)).toBeUndefined();
    expect(nearestInRange({ x: 0, y: 0 }, [], 40)).toBeUndefined();
  });
});
