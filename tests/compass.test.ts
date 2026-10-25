import { describe, expect, it } from 'vitest';
import { compassPlacement } from '../src/systems/compass';

const screen = { width: 800, height: 600 };

describe('compassPlacement', () => {
  it('hides while the target is on screen or partly visible', () => {
    expect(compassPlacement({ x: 400, y: 300 }, screen, 50, 30)).toBeNull();
    expect(compassPlacement({ x: 830, y: 300 }, screen, 50, 30)).toBeNull();
  });

  it('points right and sits on the right inset edge', () => {
    const p = compassPlacement({ x: 2000, y: 300 }, screen, 50, 30)!;
    expect(p.angle).toBeCloseTo(0);
    expect(p.x).toBeCloseTo(770);
    expect(p.y).toBeCloseTo(300);
  });

  it('points up-left diagonally and stays inside the inset box', () => {
    const p = compassPlacement({ x: -1000, y: -1000 }, screen, 50, 30)!;
    expect(p.angle).toBeLessThan(-Math.PI / 2);
    expect(p.x).toBeGreaterThanOrEqual(30 - 1e-9);
    expect(p.y).toBeCloseTo(30);
  });

  it('handles straight down', () => {
    const p = compassPlacement({ x: 400, y: 5000 }, screen, 50, 30)!;
    expect(p.angle).toBeCloseTo(Math.PI / 2);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(570);
  });
});
