import { createRng, randRange } from './rng';
import type { Vec } from './drone';

export interface BurrowerPlacement {
  /** Stable across reloads for the same seed, e.g. "burrower-02". */
  id: string;
  x: number;
  y: number;
  /** Crystal left behind when destroyed, decided at generation. */
  drop: number;
}

export interface BurrowerOptions {
  seed: number;
  count: number;
  worldSize: number;
  margin: number;
  center: Vec;
  minDistance: number;
  /** Circles a home must stay out of (rocks, drone homes), already grown by any clearance. */
  avoid: { x: number; y: number; r: number }[];
  minSpacing: number;
  extraDropChance: number;
}

export function placeBurrowers(o: BurrowerOptions): BurrowerPlacement[] {
  const rng = createRng(o.seed);
  const out: BurrowerPlacement[] = [];
  for (let i = 0; i < o.count * 80 && out.length < o.count; i++) {
    const x = Math.round(randRange(rng, o.margin, o.worldSize - o.margin));
    const y = Math.round(randRange(rng, o.margin, o.worldSize - o.margin));
    const drop = 1 + (rng() < o.extraDropChance ? 1 : 0);
    if (Math.hypot(x - o.center.x, y - o.center.y) < o.minDistance) continue;
    if (o.avoid.some((c) => Math.hypot(c.x - x, c.y - y) < c.r)) continue;
    if (out.some((b) => Math.hypot(b.x - x, b.y - y) < o.minSpacing)) continue;
    out.push({ id: `burrower-${String(out.length).padStart(2, '0')}`, x, y, drop });
  }
  return out;
}

/**
 * lurk: still under a single mound. roam: tunnels to a spot near home.
 * stalk: tunnels after the tank. warn: stopped, mound shaking, about to burst.
 * up: out of the sand, the only time it can bite or be shot.
 */
export type BurrowMode = 'lurk' | 'roam' | 'stalk' | 'warn' | 'up';

export interface BurrowerBrain {
  mode: BurrowMode;
  home: Vec;
  waypoint: Vec;
  /** Time left in the current mode (lurk, warn, up). */
  timerMs: number;
  /** After diving, time before it will stalk again. */
  restMs: number;
}

export interface BurrowerTuning {
  roamRadius: number;
  roamSpeed: number;
  stalkSpeed: number;
  senseMoving: number;
  senseStill: number;
  loseRadius: number;
  leashRadius: number;
  strikeRange: number;
  warnMs: number;
  upMs: number;
  restMs: number;
}

export interface BurrowerContext {
  pos: Vec;
  player: Vec;
  /** The tank is moving; treads are easier to feel. */
  playerMoving: boolean;
  playerSafe: boolean;
  dtMs: number;
  rng: () => number;
  /** Open ground it could surface on or rest under (not under a rock or the ship). */
  isClear: (p: Vec) => boolean;
}

/** Emitted on the tick a mode change matters to the scene. */
export type BurrowEvent = 'warn' | 'surface' | 'dive';

export function newBurrowerBrain(home: Vec): BurrowerBrain {
  return { mode: 'lurk', home: { ...home }, waypoint: { ...home }, timerMs: 0, restMs: 0 };
}

/** Back under the sand and home, e.g. after the tank is rescued. */
export function calmBurrower(b: BurrowerBrain): BurrowerBrain {
  return { ...b, mode: 'roam', waypoint: { ...b.home }, timerMs: 0, restMs: 0 };
}

export function underground(mode: BurrowMode): boolean {
  return mode !== 'up';
}

/** One AI tick: the new brain, the velocity it tunnels at, and any event. */
export function stepBurrower(
  b: BurrowerBrain,
  c: BurrowerContext,
  t: BurrowerTuning,
): { brain: BurrowerBrain; velocity: Vec; event?: BurrowEvent } {
  const brain = { ...b, timerMs: b.timerMs - c.dtMs, restMs: Math.max(0, b.restMs - c.dtMs) };
  const still = { x: 0, y: 0 };
  const distPlayer = Math.hypot(c.player.x - c.pos.x, c.player.y - c.pos.y);
  const distHome = Math.hypot(b.home.x - c.pos.x, b.home.y - c.pos.y);

  if (brain.mode === 'warn') {
    if (brain.timerMs > 0) return { brain, velocity: still };
    return { brain: { ...brain, mode: 'up', timerMs: t.upMs }, velocity: still, event: 'surface' };
  }
  if (brain.mode === 'up') {
    if (brain.timerMs > 0) return { brain, velocity: still };
    return { brain: { ...brain, mode: 'lurk', timerMs: 600, restMs: t.restMs }, velocity: still, event: 'dive' };
  }

  if (brain.mode === 'stalk') {
    if (c.playerSafe || distPlayer > t.loseRadius || distHome > t.leashRadius) {
      Object.assign(brain, { mode: 'roam', waypoint: { ...b.home } });
    } else if (distPlayer <= t.strikeRange && c.isClear(c.pos)) {
      return { brain: { ...brain, mode: 'warn', timerMs: t.warnMs }, velocity: still, event: 'warn' };
    } else {
      return { brain, velocity: toward(c.pos, c.player, t.stalkSpeed) };
    }
  }

  // lurk / roam: feel for treads.
  const sense = c.playerMoving ? t.senseMoving : t.senseStill;
  if (!c.playerSafe && brain.restMs <= 0 && distPlayer < sense && distHome < t.leashRadius) {
    return { brain: { ...brain, mode: 'stalk' }, velocity: toward(c.pos, c.player, t.stalkSpeed) };
  }

  if (brain.mode === 'roam') {
    if (Math.hypot(brain.waypoint.x - c.pos.x, brain.waypoint.y - c.pos.y) > 3) {
      return { brain, velocity: toward(c.pos, brain.waypoint, t.roamSpeed) };
    }
    // Arrived; only settle on open ground, otherwise pick somewhere else.
    if (!c.isClear(c.pos)) return { brain: { ...brain, waypoint: roamPoint(b.home, t.roamRadius, c) }, velocity: still };
    return { brain: { ...brain, mode: 'lurk', timerMs: 1500 + c.rng() * 3000 }, velocity: still };
  }

  // lurk
  if (brain.timerMs > 0) return { brain, velocity: still };
  return { brain: { ...brain, mode: 'roam', waypoint: roamPoint(b.home, t.roamRadius, c) }, velocity: still };
}

function roamPoint(home: Vec, radius: number, c: BurrowerContext): Vec {
  for (let i = 0; i < 10; i++) {
    const a = c.rng() * Math.PI * 2;
    const r = Math.sqrt(c.rng()) * radius;
    const p = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
    if (c.isClear(p)) return p;
  }
  return { ...home };
}

function toward(from: Vec, to: Vec, speed: number): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  return { x: (dx / d) * speed, y: (dy / d) * speed };
}
