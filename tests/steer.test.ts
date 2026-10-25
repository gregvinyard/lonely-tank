import { describe, expect, it } from 'vitest';
import { DRONES, OBSTACLES, WORLD_SEED } from '../src/data/tuning';
import { alertBrain, calmBrain, newBrain, stepDrone, type DroneBrain, type Vec } from '../src/systems/drone';
import { createRng } from '../src/systems/rng';
import { insideAny, steerToward, type Circle } from '../src/systems/steer';
import { generateWorld } from '../src/systems/worldgen';

describe('steerToward', () => {
  it('goes straight when nothing is in the way', () => {
    const v = steerToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, [{ x: 50, y: 60, r: 20 }], 90);
    expect(v.x).toBeCloseTo(50);
    expect(v.y).toBeCloseTo(0);
  });

  it('bends around a rock in the way, toward the nearer side', () => {
    const v = steerToward({ x: 0, y: 0 }, { x: 200, y: 0 }, 50, [{ x: 60, y: 5, r: 30 }], 90);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(50);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0); // the rock leans +y, so pass on the -y side
  });

  it('ignores rocks beyond the lookahead or behind the target', () => {
    expect(steerToward({ x: 0, y: 0 }, { x: 400, y: 0 }, 50, [{ x: 300, y: 0, r: 20 }], 90).y).toBeCloseTo(0);
    expect(steerToward({ x: 0, y: 0 }, { x: 40, y: 0 }, 50, [{ x: 80, y: 0, r: 20 }], 90).y).toBeCloseTo(0);
  });

  it('reports points inside circles', () => {
    expect(insideAny({ x: 5, y: 0 }, [{ x: 0, y: 0, r: 10 }])).toBe(true);
    expect(insideAny({ x: 15, y: 0 }, [{ x: 0, y: 0, r: 10 }])).toBe(false);
  });
});

// A small physics stand-in: move, then push out of every rock like Arcade's
// circle separation does. `solid` are the real collision circles.
function simulate(brain: DroneBrain, start: Vec, player: Vec, solid: Circle[], seconds: number) {
  const steer = solid.map((c) => ({ ...c, r: c.r + DRONES.obstacleMargin }));
  const rng = createRng(7);
  let pos = { ...start };
  let b = brain;
  let speed = 0;
  let closest = Infinity;
  let nearestHome = Infinity;
  const dt = 16;
  for (let i = 0; i < (seconds * 1000) / dt; i++) {
    const r = stepDrone(b, { pos, player, playerSafe: false, dtMs: dt, rng, obstacles: steer, speed }, DRONES);
    b = r.brain;
    let next = { x: pos.x + (r.velocity.x * dt) / 1000, y: pos.y + (r.velocity.y * dt) / 1000 };
    for (const c of solid) {
      const d = Math.hypot(next.x - c.x, next.y - c.y);
      if (d < c.r) next = { x: c.x + ((next.x - c.x) / (d || 1)) * c.r, y: c.y + ((next.y - c.y) / (d || 1)) * c.r };
    }
    speed = (Math.hypot(next.x - pos.x, next.y - pos.y) * 1000) / dt;
    pos = next;
    closest = Math.min(closest, Math.hypot(pos.x - player.x, pos.y - player.y));
    nearestHome = Math.min(nearestHome, Math.hypot(pos.x - b.home.x, pos.y - b.home.y));
  }
  return { pos, brain: b, closest, nearestHome };
}

const grown = (x: number, y: number, r: number): Circle => ({ x, y, r: r + DRONES.bodyRadius });

describe('drone steering', () => {
  it('chases a player hiding behind a rock', () => {
    const home = { x: 1000, y: 1000 };
    const rock = grown(1080, 1000, 36);
    const r = simulate(alertBrain(newBrain(home), DRONES.alertMs), home, { x: 1170, y: 1000 }, [rock], 6);
    expect(r.closest).toBeLessThan(DRONES.bodyRadius + 24);
  });

  it('gets home from behind a wall of rocks', () => {
    const home = { x: 1000, y: 1000 };
    const wall = [-60, 0, 60].map((dy) => grown(1080, 1000 + dy, 36));
    const r = simulate(calmBrain(newBrain(home)), { x: 1160, y: 1000 }, { x: 0, y: 0 }, wall, 15);
    expect(r.nearestHome).toBeLessThan(10);
  });

  it('reaches the player from every drone home on the real map', () => {
    const world = generateWorld(WORLD_SEED);
    const solid = world.rocks.map((r) => grown(r.x, r.y, OBSTACLES.sizes[r.size].radius));
    for (const d of world.drones) {
      // Put the player on the far side of the nearest rock from the drone's home.
      const rock = world.rocks.reduce((a, b) => (Math.hypot(b.x - d.x, b.y - d.y) < Math.hypot(a.x - d.x, a.y - d.y) ? b : a));
      const len = Math.hypot(rock.x - d.x, rock.y - d.y);
      const reach = OBSTACLES.sizes[rock.size].radius + 50;
      const player = { x: rock.x + ((rock.x - d.x) / len) * reach, y: rock.y + ((rock.y - d.y) / len) * reach };
      const r = simulate(alertBrain(newBrain(d), DRONES.alertMs), d, player, solid, 8);
      expect(r.closest, d.id).toBeLessThan(DRONES.bodyRadius + 30);
    }
  });

  it('finds its way home from anywhere in its leash on the real map', () => {
    const world = generateWorld(WORLD_SEED);
    const solid = world.rocks.map((r) => grown(r.x, r.y, OBSTACLES.sizes[r.size].radius));
    const rng = createRng(3);
    for (const d of world.drones) {
      for (let i = 0; i < 6; i++) {
        const a = rng() * Math.PI * 2;
        const start = { x: d.x + Math.cos(a) * DRONES.leashRadius, y: d.y + Math.sin(a) * DRONES.leashRadius };
        if (solid.some((c) => Math.hypot(start.x - c.x, start.y - c.y) < c.r + 4)) continue;
        const r = simulate(calmBrain(newBrain(d)), start, { x: -9999, y: -9999 }, solid, 25);
        expect(r.nearestHome, `${d.id} from ${start.x | 0},${start.y | 0}`).toBeLessThan(10);
      }
    }
  });
});

describe('drone alerts', () => {
  const home = { x: 1000, y: 1000 };
  const ctx = (pos: Vec, player: Vec, playerSafe = false) => ({ pos, player, playerSafe, dtMs: 16, rng: createRng(1) });

  it('a shot drone chases a player well outside its detection range', () => {
    const far = { x: home.x + DRONES.detectRadius + 150, y: home.y };
    const r = stepDrone(alertBrain(newBrain(home), DRONES.alertMs), ctx(home, far), DRONES);
    expect(r.brain.mode).toBe('chase');
    expect(r.velocity.x).toBeGreaterThan(0);
    // Without the alert it would ignore them.
    expect(stepDrone(newBrain(home), ctx(home, far), DRONES).brain.mode).toBe('patrol');
  });

  it('keeps hunting past the normal leash while alerted, then gives up when the alert runs out', () => {
    const pos = { x: home.x + DRONES.leashRadius + 50, y: home.y };
    const player = { x: pos.x + DRONES.loseRadius + 50, y: pos.y };
    const alerted = alertBrain(newBrain(home), DRONES.alertMs);
    expect(stepDrone(alerted, ctx(pos, player), DRONES).brain.mode).toBe('chase');
    const expired = { ...alerted, alertMs: 10 };
    expect(stepDrone(expired, ctx(pos, player), DRONES).brain.mode).toBe('return');
    const tooFar = { x: home.x + DRONES.alertLeash + 10, y: home.y };
    expect(stepDrone(alerted, ctx(tooFar, player), DRONES).brain.mode).toBe('return');
  });

  it('the safe zone calms an alerted drone', () => {
    const pos = { x: home.x + 60, y: home.y };
    const r = stepDrone(alertBrain(newBrain(home), DRONES.alertMs), ctx(pos, { x: home.x + 100, y: home.y }, true), DRONES);
    expect(r.brain.mode).toBe('return');
    expect(r.brain.alertMs).toBe(0);
  });

  it('calming clears the alert and sends it home', () => {
    const b = calmBrain(alertBrain(newBrain(home), DRONES.alertMs));
    expect(b.mode).toBe('return');
    expect(b.alertMs).toBe(0);
  });
});
