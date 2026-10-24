import { describe, expect, it } from 'vitest';
import { createRng, randRange } from '../src/systems/rng';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('differs between seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  it('stays within [0, 1) and randRange respects bounds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const r = randRange(rng, 5, 10);
      expect(r).toBeGreaterThanOrEqual(5);
      expect(r).toBeLessThan(10);
    }
  });
});
