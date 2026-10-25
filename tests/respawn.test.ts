import { describe, expect, it } from 'vitest';
import { dueForRespawn, outerBonus } from '../src/systems/respawn';

describe('respawn', () => {
  it('lists events old enough, oldest first', () => {
    const events = new Map([
      ['b', 5000],
      ['a', 1000],
      ['c', 9000],
    ]);
    expect(dueForRespawn(events, 10000, 5000)).toEqual(['a', 'b']);
    expect(dueForRespawn(events, 5999, 5000)).toEqual([]);
    expect(dueForRespawn(events, 6000, 5000)).toEqual(['a']);
    expect(dueForRespawn(new Map(), 1e9, 1)).toEqual([]);
  });

  it('gives outer salvage a bonus', () => {
    expect(outerBonus(799, { distance: 800, amount: 1 })).toBe(0);
    expect(outerBonus(800, { distance: 800, amount: 1 })).toBe(1);
  });
});
