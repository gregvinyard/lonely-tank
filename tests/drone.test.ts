import { describe, expect, it } from 'vitest';
import { DRONES, SHIP, WORLD_SEED } from '../src/data/tuning';
import { createRng } from '../src/systems/rng';
import { clampOutsideCircle, stepDrone, type DroneBrain, type DroneContext } from '../src/systems/drone';
import { generateWorld } from '../src/systems/worldgen';

describe('drone placement', () => {
  const world = generateWorld(WORLD_SEED);

  it('is deterministic with stable unique ids', () => {
    expect(generateWorld(WORLD_SEED).drones).toEqual(world.drones);
    expect(world.drones).toHaveLength(DRONES.count);
    expect(new Set(world.drones.map((d) => d.id)).size).toBe(DRONES.count);
    expect(world.drones[0].id).toBe('drone-00');
  });

  it('keeps every patrol area out of the safe zone and drones off rocks', () => {
    for (const d of world.drones) {
      const dist = Math.hypot(d.x - world.center.x, d.y - world.center.y);
      expect(dist - DRONES.patrolRadius).toBeGreaterThan(SHIP.safeRadius);
      for (const r of world.rocks) expect(Math.hypot(d.x - r.x, d.y - r.y)).toBeGreaterThanOrEqual(DRONES.rockClearance);
      expect(d.drop).toBeGreaterThanOrEqual(0);
      expect(d.drop).toBeLessThanOrEqual(2);
    }
  });

  it('gives some drones a scrap drop', () => {
    expect(world.drones.some((d) => d.drop > 0)).toBe(true);
  });
});

describe('stepDrone', () => {
  const home = { x: 1000, y: 1000 };
  const brain = (mode: DroneBrain['mode'] = 'patrol'): DroneBrain => ({ mode, home, waypoint: { ...home }, waitMs: 0 });
  const ctx = (o: Partial<DroneContext>): DroneContext => ({
    pos: { ...home },
    player: { x: 0, y: 0 },
    playerSafe: false,
    dtMs: 16,
    rng: createRng(1),
    ...o,
  });

  it('patrols near home while the player is far away', () => {
    let b = brain();
    let pos = { ...home };
    for (let i = 0; i < 2000; i++) {
      const r = stepDrone(b, ctx({ pos }), DRONES);
      b = r.brain;
      pos = { x: pos.x + (r.velocity.x * 16) / 1000, y: pos.y + (r.velocity.y * 16) / 1000 };
      expect(b.mode).toBe('patrol');
      expect(Math.hypot(pos.x - home.x, pos.y - home.y)).toBeLessThanOrEqual(DRONES.patrolRadius + 2);
      expect(Math.hypot(r.velocity.x, r.velocity.y)).toBeLessThanOrEqual(DRONES.patrolSpeed + 1e-9);
    }
  });

  it('chases a nearby player at chase speed, slower than the tank', () => {
    const r = stepDrone(brain(), ctx({ player: { x: 1100, y: 1000 } }), DRONES);
    expect(r.brain.mode).toBe('chase');
    expect(r.velocity.x).toBeCloseTo(DRONES.chaseSpeed);
    expect(r.velocity.y).toBeCloseTo(0);
    expect(DRONES.chaseSpeed).toBeLessThan(160);
  });

  it('ignores a player inside the safe zone and gives up a chase when they reach it', () => {
    expect(stepDrone(brain(), ctx({ player: { x: 1100, y: 1000 }, playerSafe: true }), DRONES).brain.mode).toBe('patrol');
    const away = { x: home.x + 50, y: home.y };
    expect(stepDrone(brain('chase'), ctx({ pos: away, player: { x: 1100, y: 1000 }, playerSafe: true }), DRONES).brain.mode).toBe('return');
  });

  it('gives up when the player escapes or the drone is leashed, then returns home', () => {
    const away = { x: home.x + 50, y: home.y };
    expect(stepDrone(brain('chase'), ctx({ pos: away, player: { x: 1400, y: 1000 } }), DRONES).brain.mode).toBe('return');
    const far = { x: home.x + DRONES.leashRadius + 10, y: home.y };
    const r = stepDrone(brain('chase'), ctx({ pos: far, player: { x: far.x + 50, y: far.y } }), DRONES);
    expect(r.brain.mode).toBe('return');
    expect(r.velocity.x).toBeLessThan(0); // heading home
    expect(stepDrone(brain('return'), ctx({ pos: { x: home.x + 2, y: home.y } }), DRONES).brain.mode).toBe('patrol');
  });
});

describe('clampOutsideCircle', () => {
  it('leaves outside points alone and pushes inside points to the edge', () => {
    expect(clampOutsideCircle({ x: 300, y: 0 }, { x: 0, y: 0 }, 200)).toEqual({ x: 300, y: 0 });
    const p = clampOutsideCircle({ x: 0, y: 50 }, { x: 0, y: 0 }, 200);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(200);
    const c = clampOutsideCircle({ x: 5, y: 5 }, { x: 5, y: 5 }, 10);
    expect(Math.hypot(c.x - 5, c.y - 5)).toBeCloseTo(10);
  });
});
