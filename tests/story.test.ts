import { describe, expect, it } from 'vitest';
import { LOGS, logId } from '../src/data/story';
import { WORLD_SIZE } from '../src/data/tuning';
import { upgradeDef } from '../src/data/upgrades';
import { biomeAt } from '../src/systems/biome';
import { activeCache, cacheSites, logsRead } from '../src/systems/story';
import { circleClear, featuresIn } from '../src/systems/terrain';

const CENTER = WORLD_SIZE / 2;

describe('crew caches', () => {
  for (const seed of [1337, 1, 2, 3, 42, 777, 9001, 123456]) {
    it(`seed ${seed}: one per log, each in its biome on open ground, leading outward`, () => {
      const sites = cacheSites(seed);
      expect(sites).toHaveLength(LOGS.length);
      sites.forEach((s, i) => {
        expect(biomeAt(seed, s.x, s.y).biome, `log ${i}`).toBe(LOGS[i].biome);
        const f = featuresIn(seed, { x0: s.x - 200, y0: s.y - 200, x1: s.x + 200, y1: s.y + 200 });
        expect(circleClear(f, s.x, s.y, 90)).toBe(true);
        expect(Math.hypot(s.x - CENTER, s.y - CENTER)).toBeGreaterThan(2900);
      });
      // The old city is the far end of the trail.
      const far = (s: { x: number; y: number }) => Math.hypot(s.x - CENTER, s.y - CENTER);
      expect(far(sites[5])).toBeGreaterThan(far(sites[0]));
    });
  }

  it('is deterministic', () => {
    expect(cacheSites(1337)).toEqual(cacheSites(1337));
  });

  it('logs are read in order; the next unread one is the beacon', () => {
    const d = new Set<string>();
    expect(logsRead(d)).toBe(0);
    expect(activeCache(1337, d)).toEqual(cacheSites(1337)[0]);
    d.add(logId(0)).add(logId(1)).add(logId(3));
    expect(logsRead(d)).toBe(2);
    expect(activeCache(1337, d)?.index).toBe(2);
    for (let i = 0; i < LOGS.length; i++) d.add(logId(i));
    expect(activeCache(1337, d)).toBeUndefined();
  });

  it('the array needs every log', () => {
    expect(upgradeDef('transmitter').requiresLogs).toBe(LOGS.length);
  });
});
