import { describe, expect, it } from 'vitest';
import { createInventory, type Inventory } from '../src/systems/inventory';
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
    const inv = (o: Partial<Inventory>): Inventory => ({ ...createInventory(), ...o });
    expect(rescuePenalty(inv({ scrap: 3, crystal: 1, circuit: 2 }), 0.25)).toEqual({
      inventory: inv({ scrap: 3, crystal: 1, circuit: 2 }),
      lost: createInventory(),
    });
    expect(rescuePenalty(inv({ scrap: 4, crystal: 9, circuit: 8, relic: 4 }), 0.25)).toEqual({
      inventory: inv({ scrap: 3, crystal: 7, circuit: 6, relic: 3 }),
      lost: inv({ scrap: 1, crystal: 2, circuit: 2, relic: 1 }),
    });
  });
});
