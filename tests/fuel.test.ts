import { describe, expect, it } from 'vitest';
import { burnFuel } from '../src/systems/fuel';

describe('fuel', () => {
  it('burns one unit per second at full speed', () => {
    expect(burnFuel(100, 160, 160, 1000, 1)).toBeCloseTo(99);
  });

  it('burns less when slower and nothing at rest', () => {
    expect(burnFuel(100, 80, 160, 1000, 1)).toBeCloseTo(99.5);
    expect(burnFuel(100, 0, 160, 1000, 1)).toBe(100);
  });

  it('never goes below zero', () => {
    expect(burnFuel(0.2, 160, 160, 1000, 1)).toBe(0);
  });
});
