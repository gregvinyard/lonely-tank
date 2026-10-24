import { describe, expect, it } from 'vitest';
import { placeRocks, type RockOptions } from '../src/systems/worldgen';

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
