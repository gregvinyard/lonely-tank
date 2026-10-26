import { describe, expect, it } from 'vitest';
import { saveSummary } from '../src/systems/saveSummary';
import type { SaveData } from '../src/systems/save';

const save = (playTimeMs: number, x: number, y: number) =>
  ({ version: 2, seed: 1337, playTimeMs, tank: { x, y, hull: 100, fuel: 100 } }) as SaveData;

describe('saveSummary', () => {
  it('describes a game parked at the ship', () => {
    expect(saveSummary(save(5 * 60000, 1024, 1100))).toBe('5 min played · at the ship · Dust Flats');
  });

  it('gives hours, and distance in km far out', () => {
    expect(saveSummary(save(125 * 60000, 1024 + 25000, 1024))).toMatch(/^2 h 5 min played · 2\.5 km out · /);
  });

  it('rounds nearer distances to 10 m', () => {
    expect(saveSummary(save(0, 1024 + 4321, 1024))).toMatch(/^0 min played · 430 m out · /);
  });
});
