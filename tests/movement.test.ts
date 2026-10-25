import { describe, expect, it } from 'vitest';
import { normalizeInput, rotateToward, stepVelocity, wrapAngle } from '../src/systems/movement';

const P = { maxSpeed: 160, accel: 600, decel: 400 };

describe('normalizeInput', () => {
  it('normalizes diagonals to unit length', () => {
    const v = normalizeInput(1, 1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });

  it('returns zero for no input', () => {
    expect(normalizeInput(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('stepVelocity', () => {
  it('accelerates gradually, not instantly', () => {
    const v = stepVelocity({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.1, P);
    expect(v.x).toBeCloseTo(60);
    expect(v.y).toBe(0);
  });

  it('reaches and never exceeds max speed', () => {
    let v = { x: 0, y: 0 };
    for (let i = 0; i < 100; i++) v = stepVelocity(v, { x: 1, y: 1 }, 1 / 60, P);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(160);
  });

  it('diagonal top speed equals straight top speed', () => {
    let v = { x: 0, y: 0 };
    for (let i = 0; i < 100; i++) v = stepVelocity(v, { x: -1, y: 1 }, 1 / 60, P);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(P.maxSpeed);
  });

  it('decelerates to a stop without overshooting', () => {
    let v = { x: 160, y: 0 };
    v = stepVelocity(v, { x: 0, y: 0 }, 0.1, P);
    expect(v.x).toBeCloseTo(120);
    for (let i = 0; i < 100; i++) v = stepVelocity(v, { x: 0, y: 0 }, 1 / 60, P);
    expect(v).toEqual({ x: 0, y: 0 });
  });
});

describe('angles', () => {
  it('wrapAngle maps into (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(2 * Math.PI)).toBeCloseTo(0);
  });

  it('rotateToward takes the short way around', () => {
    // From 170deg toward -170deg should increase (cross PI), not swing back through 0.
    const from = (170 * Math.PI) / 180;
    const to = (-170 * Math.PI) / 180;
    const r = rotateToward(from, to, (5 * Math.PI) / 180);
    expect(r).toBeCloseTo((175 * Math.PI) / 180);
  });

  it('rotateToward snaps when within one step', () => {
    expect(rotateToward(0, 0.01, 0.1)).toBeCloseTo(0.01);
  });
});

describe('zoomForViewport', () => {
  it('picks whole-number zoom by window height', async () => {
    const { zoomForViewport } = await import('../src/data/tuning');
    expect(zoomForViewport(300)).toBe(1);
    expect(zoomForViewport(720)).toBe(2);
    expect(zoomForViewport(1080)).toBe(3);
    expect(zoomForViewport(2160)).toBe(5);
    expect(zoomForViewport(10000)).toBe(8);
  });
});

describe('frameLerp', () => {
  it('matches the base lerp at 60 Hz', async () => {
    const { frameLerp } = await import('../src/data/tuning');
    expect(frameLerp(0.12, 1000 / 60)).toBeCloseTo(0.12);
  });

  it('two 120 Hz frames close the same gap as one 60 Hz frame', async () => {
    const { frameLerp } = await import('../src/data/tuning');
    const l = frameLerp(0.12, 1000 / 120);
    expect(1 - (1 - l) * (1 - l)).toBeCloseTo(0.12);
  });
});
