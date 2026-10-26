import { describe, expect, it } from 'vitest';
import { BIOME_IDS } from '../src/data/biomes';
import { PLANET, WORLD_SEED, WORLD_SIZE } from '../src/data/tuning';
import { biomeAt, pickBiome } from '../src/systems/biome';
import { chunkContent, chunkOfId, chunkRange, isHomeChunk } from '../src/systems/chunks';
import { blockedAt, circleClear, featuresIn, featuresInCell, pushOut, type Feature } from '../src/systems/terrain';
import { generateWorld } from '../src/systems/worldgen';

const seed = WORLD_SEED;

describe('biomes', () => {
  it('are the same every time for a seed', () => {
    for (const [x, y] of [
      [-9000, 4000],
      [15000, -12000],
      [300, 300],
    ]) {
      expect(biomeAt(seed, x, y)).toEqual(biomeAt(seed, x, y));
    }
  });

  it('keep the home square and its surroundings as dust flats', () => {
    for (let y = -1000; y <= WORLD_SIZE + 1000; y += 250) {
      for (let x = -1000; x <= WORLD_SIZE + 1000; x += 250) expect(biomeAt(seed, x, y).biome).toBe('flats');
    }
  });

  it('only put far-flung biomes far out', () => {
    expect(pickBiome(0.999, 4000)).toBe('flats');
    expect(pickBiome(0.999, 6500)).not.toBe('ruins');
    // Every biome turns up somewhere.
    const seen = new Set<string>();
    for (let y = -24000; y < 24000; y += 900) for (let x = -24000; x < 24000; x += 900) seen.add(biomeAt(seed, x, y).biome);
    expect([...seen].sort()).toEqual([...BIOME_IDS].sort());
  });
});

describe('impassable terrain', () => {
  const all: Feature[] = [];
  const range = { min: -6, max: 7 };
  for (let j = range.min; j <= range.max; j++) for (let i = range.min; i <= range.max; i++) all.push(...featuresInCell(seed, i, j));

  it('has cliffs, canyons and lakes', () => {
    const kinds = new Set(all.map((f) => f.kind));
    expect([...kinds].sort()).toEqual(['canyon', 'lake', 'mesa']);
  });

  it('never touches the home square', () => {
    const k = PLANET.homeKeepOut;
    for (const f of all) {
      const clear = f.box.x1 < -k || f.box.y1 < -k || f.box.x0 > WORLD_SIZE + k || f.box.y0 > WORLD_SIZE + k;
      expect(clear).toBe(true);
    }
    for (let y = 0; y <= WORLD_SIZE; y += 64) for (let x = 0; x <= WORLD_SIZE; x += 64) expect(blockedAt(all, x, y)).toBe(false);
  });

  it('keeps each feature inside its cell, clear of the edges', () => {
    const c = PLANET.featureCell;
    for (let j = range.min; j <= range.max; j++) {
      for (let i = range.min; i <= range.max; i++) {
        for (const f of featuresInCell(seed, i, j)) {
          expect(f.box.x0).toBeGreaterThanOrEqual(i * c + PLANET.featureInset - 0.01);
          expect(f.box.y0).toBeGreaterThanOrEqual(j * c + PLANET.featureInset - 0.01);
          expect(f.box.x1).toBeLessThanOrEqual((i + 1) * c - PLANET.featureInset + 0.01);
          expect(f.box.y1).toBeLessThanOrEqual((j + 1) * c - PLANET.featureInset + 0.01);
        }
      }
    }
  });

  it('never walls in any open ground: every open spot can be driven to from the ship', () => {
    // Flood fill a 26k px square round the ship on a 32 px grid. A cell is
    // drivable if the tank fits there.
    const step = 32;
    const x0 = -12000;
    const y0 = -12000;
    const n = Math.floor(26000 / step);
    const feats = featuresIn(seed, { x0, y0, x1: x0 + n * step, y1: y0 + n * step });
    const open = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = x0 + i * step;
        const y = y0 + j * step;
        open[j * n + i] = blockedAt(feats, x, y) ? 0 : circleClear(feats, x, y, 21) ? 2 : 1;
      }
    }
    const start = Math.floor((WORLD_SIZE / 2 - y0) / step) * n + Math.floor((WORLD_SIZE / 2 + 200 - x0) / step);
    const seen = new Uint8Array(n * n);
    const queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const k = queue.pop()!;
      const i = k % n;
      const j = (k - i) / n;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di;
        const b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const kk = b * n + a;
        if (seen[kk] || open[kk] !== 2) continue;
        seen[kk] = 1;
        queue.push(kk);
      }
    }
    let unreachable = 0;
    for (let k = 0; k < n * n; k++) if (open[k] === 2 && !seen[k]) unreachable++;
    expect(unreachable).toBe(0);
  }, 30000);

  it('pushes a tank out of a lake or off a cliff', () => {
    const f = all.find((x) => x.kind === 'lake' || x.kind === 'mesa')!;
    const p = f.kind === 'canyon' ? f.pts[0] : { x: f.x, y: f.y + f.r * 0.98 };
    const push = pushOut([f], p.x, p.y, 20);
    expect(push).toBeDefined();
    expect(circleClear([f], p.x + push!.x, p.y + push!.y, 20)).toBe(true);
    expect(pushOut([f], f.box.x1 + 60, f.box.y1 + 60, 20)).toBeUndefined();
  });
});

describe('chunks', () => {
  it('are the same every time, with ids that lead back to their chunk', () => {
    const a = chunkContent(seed, 9, -4);
    expect(chunkContent(seed + 0, 9, -4)).toEqual(a);
    const ids = [...a.resources, ...a.seeps, ...a.drones, ...a.burrowers, ...a.landmarks].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(chunkOfId(id)).toEqual({ cx: 9, cy: -4 });
  });

  it('leave the home square to the original map', () => {
    const n = WORLD_SIZE / PLANET.chunkSize;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        expect(isHomeChunk(i, j)).toBe(true);
        const c = chunkContent(seed, i, j);
        expect(c.props.length + c.resources.length + c.drones.length + c.burrowers.length).toBe(0);
      }
    }
    // And that map is still exactly the one players have saves in.
    expect(generateWorld(seed).rocks.length).toBe(70);
  });

  it('put everything on open ground, inside the chunk, clear of the ship', () => {
    let things = 0;
    for (let j = -8; j <= 10; j += 1) {
      for (let i = -8; i <= 10; i += 3) {
        const c = chunkContent(seed, i, j);
        const s = PLANET.chunkSize;
        for (const p of [...c.resources, ...c.seeps, ...c.burrowers]) {
          things++;
          expect(blockedAt(c.features, p.x, p.y)).toBe(false);
          expect(p.x).toBeGreaterThanOrEqual(i * s);
          expect(p.x).toBeLessThan((i + 1) * s);
          expect(Math.hypot(p.x - WORLD_SIZE / 2, p.y - WORLD_SIZE / 2)).toBeGreaterThan(2000);
        }
        for (const p of c.props) for (const o of p.circles) expect(circleClear(c.features, o.x, o.y, o.r)).toBe(true);
      }
    }
    expect(things).toBeGreaterThan(20);
  });

  it('cover the planet out to its bounds', () => {
    const r = chunkRange();
    expect(r.min * PLANET.chunkSize).toBe(PLANET.bounds.min);
    expect((r.max + 1) * PLANET.chunkSize).toBe(PLANET.bounds.max);
  });
});
