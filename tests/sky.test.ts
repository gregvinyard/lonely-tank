import { describe, expect, it } from 'vitest';
import { DAY_MS, DAY_START, dayPhase, skyAt, skyColor, windAt } from '../src/systems/sky';
import { RELIEF_LEVEL, quantize, reliefAt, reliefGrid, sampleRelief } from '../src/systems/relief';

describe('day and night', () => {
  it('starts a new game in the morning and runs on play time', () => {
    expect(dayPhase(0)).toBeCloseTo(DAY_START);
    expect(dayPhase(DAY_MS)).toBeCloseTo(DAY_START);
    expect(dayPhase(DAY_MS / 2)).toBeCloseTo((DAY_START + 0.5) % 1);
  });

  it('is bright at noon and dark (but readable) at midnight', () => {
    const noon = skyAt(0.5);
    expect([noon.r, noon.g, noon.b]).toEqual([1, 1, 1]);
    expect(noon.night).toBe(0);
    const midnight = skyAt(0);
    expect(midnight.night).toBeCloseTo(1);
    const luma = 0.3 * midnight.r + 0.59 * midnight.g + 0.11 * midnight.b;
    expect(luma).toBeGreaterThan(0.5);
    expect(midnight.shadow).toBeLessThan(noon.shadow);
  });

  it('a new game starts in daylight', () => {
    expect(skyAt(DAY_START).night).toBeLessThan(0.1);
  });

  it('changes smoothly through the whole day', () => {
    let prev = skyAt(0);
    for (let i = 1; i <= 2000; i++) {
      const s = skyAt(i / 2000);
      expect(Math.abs(s.r - prev.r)).toBeLessThan(0.02);
      expect(Math.abs(s.g - prev.g)).toBeLessThan(0.02);
      expect(Math.abs(s.b - prev.b)).toBeLessThan(0.02);
      for (const v of [s.r, s.g, s.b, s.night, s.shadow, s.clouds]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      prev = s;
    }
  });

  it('packs the sky colour', () => {
    expect(skyColor(skyAt(0.5))).toBe(0xffffff);
  });
});

describe('wind', () => {
  it('stays in range and changes gradually', () => {
    let prev = windAt(0);
    for (let t = 0.1; t < 600; t += 0.1) {
      const w = windAt(t);
      expect(w.gust).toBeGreaterThanOrEqual(0);
      expect(w.gust).toBeLessThanOrEqual(1);
      expect(Math.abs(w.angle - prev.angle)).toBeLessThan(0.05);
      expect(Math.hypot(w.x, w.y)).toBeLessThanOrEqual(80.001);
      prev = w;
    }
  });

  it('has calms and gusts', () => {
    const gusts = Array.from({ length: 3000 }, (_, i) => windAt(i * 0.5).gust);
    expect(Math.min(...gusts)).toBeLessThan(0.15);
    expect(Math.max(...gusts)).toBeGreaterThan(0.85);
  });
});

describe('ground relief', () => {
  it('the grid matches the point formula, so chunk edges meet', () => {
    const grid = reliefGrid(7, 512, -1024, 512);
    expect(sampleRelief(grid, 512, 0, 0)).toBeCloseTo(reliefAt(7, 512, -1024), 6);
    expect(sampleRelief(grid, 512, 512, 512)).toBeCloseTo(reliefAt(7, 1024, -512), 6);
    expect(sampleRelief(grid, 512, 100, 260)).toBeCloseTo(reliefAt(7, 612, -764), 6);
    // The next chunk's first column is this chunk's last.
    const right = reliefGrid(7, 1024, -1024, 512);
    for (const y of [0, 37, 300, 512]) expect(sampleRelief(right, 512, 0, y)).toBeCloseTo(sampleRelief(grid, 512, 512, y), 6);
  });

  it('stays a gentle shading', () => {
    const grid = reliefGrid(3, -4096, 2048, 512);
    expect(Math.min(...grid)).toBeGreaterThan(0.7);
    expect(Math.max(...grid)).toBeLessThan(1.3);
  });

  it('snaps to levels, dithering between neighbours', () => {
    const k = 10.4 * RELIEF_LEVEL;
    expect(quantize(k, 0.1)).toBeCloseTo(11 * RELIEF_LEVEL);
    expect(quantize(k, 0.9)).toBeCloseTo(10 * RELIEF_LEVEL);
  });
});
