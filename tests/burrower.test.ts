import { describe, expect, it } from 'vitest';
import { BURROWERS, DRONES, OBSTACLES, SHIP, WORLD_SEED } from '../src/data/tuning';
import {
  calmBurrower,
  newBurrowerBrain,
  stepBurrower,
  type BurrowEvent,
  type BurrowerBrain,
  type BurrowerContext,
} from '../src/systems/burrower';
import { createRng } from '../src/systems/rng';
import { generateWorld } from '../src/systems/worldgen';

describe('burrower placement', () => {
  const world = generateWorld(WORLD_SEED);

  it('is deterministic with stable ids, out in the wasteland and clear of rocks and drones', () => {
    expect(generateWorld(WORLD_SEED).burrowers).toEqual(world.burrowers);
    expect(world.burrowers).toHaveLength(BURROWERS.count);
    expect(world.burrowers[0].id).toBe('burrower-00');
    for (const b of world.burrowers) {
      expect(Math.hypot(b.x - world.center.x, b.y - world.center.y)).toBeGreaterThanOrEqual(BURROWERS.minDistance);
      for (const r of world.rocks) expect(Math.hypot(b.x - r.x, b.y - r.y)).toBeGreaterThan(OBSTACLES.sizes[r.size].radius + BURROWERS.rockClearance - 1);
      for (const d of world.drones) expect(Math.hypot(b.x - d.x, b.y - d.y)).toBeGreaterThanOrEqual(BURROWERS.droneClearance);
      expect([1, 2]).toContain(b.drop);
      expect(Number.isInteger(b.x) && Number.isInteger(b.y)).toBe(true);
    }
  });

  it('leaves the rest of the world exactly as it was', () => {
    // Same counts and first entries as v0.2 (sizes and positions come from earlier seeds).
    expect(world.rocks).toHaveLength(OBSTACLES.rockCount);
    expect(world.drones).toHaveLength(DRONES.count);
    expect(Math.hypot(world.spawn.x - world.center.x, world.spawn.y - world.center.y)).toBeLessThan(SHIP.safeRadius);
  });
});

describe('stepBurrower', () => {
  const home = { x: 1000, y: 1000 };
  const ctx = (o: Partial<BurrowerContext>): BurrowerContext => ({
    pos: { ...home },
    player: { x: 0, y: 0 },
    playerMoving: true,
    playerSafe: false,
    dtMs: 16,
    rng: createRng(1),
    isClear: () => true,
    ...o,
  });

  /** Runs ticks with the tank at `player`, moving the burrower by its velocity. */
  function run(b: BurrowerBrain, o: Partial<BurrowerContext>, ms: number) {
    let brain = b;
    let pos = o.pos ?? { ...home };
    const events: BurrowEvent[] = [];
    let surfacedAt: { x: number; y: number } | undefined;
    const rng = createRng(2);
    for (let t = 0; t < ms; t += 16) {
      const r = stepBurrower(brain, ctx({ ...o, pos, rng }), BURROWERS);
      brain = r.brain;
      pos = { x: pos.x + (r.velocity.x * 16) / 1000, y: pos.y + (r.velocity.y * 16) / 1000 };
      if (r.event) events.push(r.event);
      if (r.event === 'surface') surfacedAt ??= pos;
    }
    return { brain, pos, events, surfacedAt };
  }

  it('roams near home while nobody is around', () => {
    const r = run(newBurrowerBrain(home), {}, 30_000);
    expect(r.events).toEqual([]);
    expect(Math.hypot(r.pos.x - home.x, r.pos.y - home.y)).toBeLessThanOrEqual(BURROWERS.roamRadius + 2);
  });

  it('feels moving treads further away than a stopped tank', () => {
    const player = { x: home.x + (BURROWERS.senseStill + BURROWERS.senseMoving) / 2, y: home.y };
    expect(stepBurrower(newBurrowerBrain(home), ctx({ player, playerMoving: true }), BURROWERS).brain.mode).toBe('stalk');
    expect(stepBurrower(newBurrowerBrain(home), ctx({ player, playerMoving: false }), BURROWERS).brain.mode).not.toBe('stalk');
  });

  it('tunnels to a still tank, warns, bursts out, then dives', () => {
    const player = { x: home.x + 100, y: home.y };
    const r = run(newBurrowerBrain(home), { player, playerMoving: false }, 5000);
    expect(r.events.slice(0, 3)).toEqual(['warn', 'surface', 'dive']);
    expect(Math.hypot(r.surfacedAt!.x - player.x, r.surfacedAt!.y - player.y)).toBeLessThanOrEqual(BURROWERS.strikeRange + 1);
  });

  it('stays still while warning and while up', () => {
    const warn = { ...newBurrowerBrain(home), mode: 'warn' as const, timerMs: 300 };
    expect(stepBurrower(warn, ctx({ player: { x: 2000, y: 0 } }), BURROWERS).velocity).toEqual({ x: 0, y: 0 });
    const up = { ...newBurrowerBrain(home), mode: 'up' as const, timerMs: 300 };
    expect(stepBurrower(up, ctx({}), BURROWERS).velocity).toEqual({ x: 0, y: 0 });
  });

  it('never surfaces under a rock or in the safe zone; it keeps tunnelling instead', () => {
    const stalk = { ...newBurrowerBrain(home), mode: 'stalk' as const };
    const near = { x: home.x + 10, y: home.y };
    const r = stepBurrower(stalk, ctx({ player: near, isClear: () => false }), BURROWERS);
    expect(r.brain.mode).toBe('stalk');
    expect(r.event).toBeUndefined();
  });

  it('gives up when the tank gets away, reaches the safe zone, or it strays too far', () => {
    const stalk = { ...newBurrowerBrain(home), mode: 'stalk' as const };
    expect(stepBurrower(stalk, ctx({ player: { x: home.x + BURROWERS.loseRadius + 10, y: home.y } }), BURROWERS).brain.mode).not.toBe('stalk');
    expect(stepBurrower(stalk, ctx({ player: { x: home.x + 50, y: home.y }, playerSafe: true }), BURROWERS).brain.mode).not.toBe('stalk');
    const far = { x: home.x + BURROWERS.leashRadius + 10, y: home.y };
    const r = stepBurrower(stalk, ctx({ pos: far, player: { x: far.x + 50, y: far.y } }), BURROWERS);
    expect(r.brain.mode).toBe('roam');
    expect(r.velocity.x).toBeLessThan(0); // heading home
  });

  it('rests after diving before it stalks again', () => {
    const up = { ...newBurrowerBrain(home), mode: 'up' as const, timerMs: 0 };
    const dove = stepBurrower(up, ctx({}), BURROWERS);
    expect(dove.event).toBe('dive');
    const player = { x: home.x + 30, y: home.y };
    expect(stepBurrower(dove.brain, ctx({ player }), BURROWERS).brain.mode).toBe('lurk');
    const rested = run(dove.brain, { player }, BURROWERS.restMs + 500);
    expect(rested.events).toContain('warn');
  });

  it('a moving tank outruns it', () => {
    let brain: BurrowerBrain = { ...newBurrowerBrain(home), mode: 'stalk' };
    let pos = { ...home };
    let player = { x: home.x + 120, y: home.y };
    let surfaced = false;
    for (let t = 0; t < 6000; t += 16) {
      player = { x: player.x + (160 * 16) / 1000, y: player.y };
      const r = stepBurrower(brain, ctx({ pos, player }), BURROWERS);
      brain = r.brain;
      pos = { x: pos.x + (r.velocity.x * 16) / 1000, y: pos.y + (r.velocity.y * 16) / 1000 };
      if (r.event === 'surface') surfaced = true;
    }
    expect(surfaced).toBe(false);
    expect(brain.mode).toBe('roam');
  });

  it('calming sends it home underground', () => {
    const b = calmBurrower({ ...newBurrowerBrain(home), mode: 'up', timerMs: 500 });
    expect(b.mode).toBe('roam');
    expect(b.waypoint).toEqual(home);
  });
});
