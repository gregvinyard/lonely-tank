import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { WORLD_SEED } from '../src/data/tuning';
import { generateWorld } from '../src/systems/worldgen';

// The world players already have saves in. Anything that changes worldgen
// inputs (the ship, the spawn) must leave this exactly as it is.
describe('world layout', () => {
  it('matches the v0.3 world for the default seed', () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/world-1337.json', 'utf8'));
    const w = generateWorld(WORLD_SEED);
    expect({ rocks: w.rocks, resources: w.resources, drones: w.drones, burrowers: w.burrowers }).toEqual(fixture);
  });
});
