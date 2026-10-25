import { describe, expect, it } from 'vitest';
import { addResource, createInventory } from '../src/systems/inventory';

describe('inventory', () => {
  it('starts empty', () => {
    expect(createInventory()).toEqual({ scrap: 0, crystal: 0, circuit: 0 });
  });

  it('adds without mutating', () => {
    const a = createInventory();
    const b = addResource(addResource(a, 'scrap', 2), 'crystal', 1);
    expect(b).toEqual({ scrap: 2, crystal: 1, circuit: 0 });
    expect(a).toEqual({ scrap: 0, crystal: 0, circuit: 0 });
  });

  it('rejects negative or fractional amounts', () => {
    expect(() => addResource(createInventory(), 'scrap', -1)).toThrow();
    expect(() => addResource(createInventory(), 'scrap', 1.5)).toThrow();
  });
});
