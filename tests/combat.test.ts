import { describe, expect, it } from 'vitest';
import { applyDamage, canFire, rescuePenalty } from '../src/systems/combat';

describe('combat rules', () => {
  it('enforces the fire cooldown', () => {
    expect(canFire(1000, 600, 420)).toBe(false);
    expect(canFire(1020, 600, 420)).toBe(true);
    expect(canFire(0, -Infinity, 420)).toBe(true);
  });

  it('clamps hull at zero', () => {
    expect(applyDamage(100, 10)).toBe(90);
    expect(applyDamage(5, 10)).toBe(0);
  });

  it('rescue loses 25% of each resource, rounded down', () => {
    expect(rescuePenalty({ scrap: 3, crystal: 1, circuit: 2 }, 0.25)).toEqual({
      inventory: { scrap: 3, crystal: 1, circuit: 2 },
      lost: { scrap: 0, crystal: 0, circuit: 0 },
    });
    expect(rescuePenalty({ scrap: 4, crystal: 9, circuit: 8 }, 0.25)).toEqual({
      inventory: { scrap: 3, crystal: 7, circuit: 6 },
      lost: { scrap: 1, crystal: 2, circuit: 2 },
    });
  });
});
