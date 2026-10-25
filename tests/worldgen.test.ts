import { describe, expect, it } from 'vitest';
import { OBSTACLES, WORLD_SEED } from '../src/data/tuning';
import { generateWorld, placeRocks, sizeRocks, type RockOptions, type RockSize } from '../src/systems/worldgen';

const OPTS: RockOptions = {
  seed: 1337,
  count: 70,
  worldSize: 2048,
  margin: 32,
  center: { x: 1024, y: 1024 },
  clearRadius: 220,
  minSpacing: 80,
};

describe('placeRocks', () => {
  it('is deterministic for a seed', () => {
    expect(placeRocks(OPTS)).toEqual(placeRocks(OPTS));
  });

  it('changes with the seed', () => {
    expect(placeRocks({ ...OPTS, seed: 1 })).not.toEqual(placeRocks(OPTS));
  });

  it('places the requested count', () => {
    expect(placeRocks(OPTS)).toHaveLength(70);
  });

  it('keeps the spawn area clear, respects spacing and bounds', () => {
    const rocks = placeRocks(OPTS);
    for (const r of rocks) {
      expect(Math.hypot(r.x - 1024, r.y - 1024)).toBeGreaterThanOrEqual(220);
      expect(r.x).toBeGreaterThanOrEqual(32);
      expect(r.x).toBeLessThanOrEqual(2048 - 32);
      expect(r.y).toBeGreaterThanOrEqual(32);
      expect(r.y).toBeLessThanOrEqual(2048 - 32);
    }
    for (let i = 0; i < rocks.length; i++) {
      for (let j = i + 1; j < rocks.length; j++) {
        expect(Math.hypot(rocks[i].x - rocks[j].x, rocks[i].y - rocks[j].y)).toBeGreaterThanOrEqual(80);
      }
    }
  });
});

describe('sizeRocks', () => {
  const sizes = { small: { radius: 12, weight: 0.3 }, medium: { radius: 22, weight: 0.4 }, large: { radius: 34, weight: 0.3 } };

  it('shrinks a large rock that would crowd a keep-out circle or a neighbor', () => {
    const rocks = [
      { x: 0, y: 0, angle: 0 },
      { x: 60, y: 0, angle: 0 },
    ];
    const allLarge = { ...sizes, small: { radius: 12, weight: 0 }, medium: { radius: 22, weight: 0 }, large: { radius: 34, weight: 1 } };
    // Two large rocks 60 apart don't fit (34 + 34 + 10); the first gives way.
    expect(sizeRocks(rocks, { seed: 1, sizes: allLarge, gap: 10, keepOut: [] })).toEqual(['small', 'large']);
    // A keep-out circle 50 away leaves room for a medium rock but not a large one.
    expect(sizeRocks([rocks[0]], { seed: 1, sizes: allLarge, gap: 10, keepOut: [{ x: 50, y: 0, r: 16 }] })).toEqual(['medium']);
  });
});

describe('generateWorld', () => {
  const world = generateWorld(WORLD_SEED);

  it('puts static things on whole pixels', () => {
    for (const p of [...world.rocks, ...world.resources, ...world.drones]) {
      expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    }
  });

  it('mixes rock sizes', () => {
    const count = (s: RockSize) => world.rocks.filter((r) => r.size === s).length;
    expect(count('small')).toBeGreaterThan(5);
    expect(count('medium')).toBeGreaterThan(5);
    expect(count('large')).toBeGreaterThan(5);
  });

  it('keeps sized rocks clear of each other, resources, drone homes and the spawn', () => {
    const r = (s: RockSize) => OBSTACLES.sizes[s].radius;
    const gap = OBSTACLES.sizeGap;
    for (const a of world.rocks) {
      for (const b of world.rocks) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(r(a.size) + r(b.size) + gap);
      }
      for (const n of world.resources) expect(Math.hypot(a.x - n.x, a.y - n.y)).toBeGreaterThanOrEqual(r(a.size) + 16 + gap);
      for (const d of world.drones) expect(Math.hypot(a.x - d.x, a.y - d.y)).toBeGreaterThanOrEqual(r(a.size) + 12 + gap);
      expect(Math.hypot(a.x - world.spawn.x, a.y - world.spawn.y)).toBeGreaterThanOrEqual(r(a.size) + 40 + gap);
    }
  });
});
