import { createRng, randRange } from './rng';
import { insideAny, steerToward, type Circle, type Side } from './steer';

export interface Vec { x: number; y: number }

export interface DronePlacement {
  /** Stable across reloads for the same seed, e.g. "drone-03". */
  id: string;
  x: number;
  y: number;
  /** Scrap left behind when destroyed (0 = nothing), decided at generation. */
  drop: number;
}

export interface DroneOptions {
  seed: number;
  count: number;
  worldSize: number;
  margin: number;
  center: Vec;
  minDistance: number;
  avoid: Vec[];
  avoidRadius: number;
  minSpacing: number;
  dropChance: number;
}

export function placeDrones(o: DroneOptions): DronePlacement[] {
  const rng = createRng(o.seed);
  const drones: DronePlacement[] = [];
  for (let i = 0; i < o.count * 60 && drones.length < o.count; i++) {
    const x = randRange(rng, o.margin, o.worldSize - o.margin);
    const y = randRange(rng, o.margin, o.worldSize - o.margin);
    const roll = rng();
    const drop = roll < o.dropChance ? 1 + Math.floor(rng() * 2) : 0; // 1–2 scrap
    if (Math.hypot(x - o.center.x, y - o.center.y) < o.minDistance) continue;
    if (o.avoid.some((p) => Math.hypot(p.x - x, p.y - y) < o.avoidRadius)) continue;
    if (drones.some((d) => Math.hypot(d.x - x, d.y - y) < o.minSpacing)) continue;
    drones.push({ id: `drone-${String(drones.length).padStart(2, '0')}`, x, y, drop });
  }
  return drones;
}

export type DroneMode = 'patrol' | 'chase' | 'return';

export interface DroneBrain {
  mode: DroneMode;
  home: Vec;
  waypoint: Vec;
  /** Time left to idle at the current waypoint before picking a new one. */
  waitMs: number;
  /** Time left hunting the player after being shot; ignores detection range. */
  alertMs?: number;
  /** How long the drone has been trying to move without getting anywhere. */
  stuckMs?: number;
  /** A sidestep taken after getting stuck, and how long to keep at it. */
  detour?: Vec;
  detourMs?: number;
  /** The side it is going around the rocks in its way, kept until it is clear. */
  side?: Side;
}

export function newBrain(home: Vec): DroneBrain {
  return { mode: 'patrol', home: { ...home }, waypoint: { ...home }, waitMs: 0 };
}

/** A shot drone (or one next to it) hunts the player for a while, wherever they are. */
export function alertBrain(b: DroneBrain, ms: number): DroneBrain {
  return { ...b, mode: 'chase', alertMs: Math.max(ms, b.alertMs ?? 0) };
}

/** Sends a drone home and calms it down, e.g. after the tank is rescued. */
export function calmBrain(b: DroneBrain): DroneBrain {
  return { ...b, mode: 'return', alertMs: 0, detour: undefined, detourMs: 0, stuckMs: 0 };
}

export interface DroneTuning {
  patrolRadius: number;
  patrolSpeed: number;
  chaseSpeed: number;
  detectRadius: number;
  loseRadius: number;
  leashRadius: number;
  /** Leash while alerted; long enough to reach a tank firing from max range. */
  alertLeash: number;
  lookahead: number;
  stuckAfterMs: number;
  detourMs: number;
  detourDistance: number;
}

export interface DroneContext {
  pos: Vec;
  player: Vec;
  /** The player is inside the ship (or rolling through its door): never chase. */
  playerSafe: boolean;
  dtMs: number;
  rng: () => number;
  /** Rocks and the ship, grown by the drone's radius, to steer around. */
  obstacles?: readonly Circle[];
  /** How fast the drone actually moved last frame (px/sec), to notice being stuck. */
  speed?: number;
}

/** One AI tick: returns the new brain and the velocity the drone wants. */
export function stepDrone(b: DroneBrain, c: DroneContext, t: DroneTuning): { brain: DroneBrain; velocity: Vec } {
  const distPlayer = Math.hypot(c.player.x - c.pos.x, c.player.y - c.pos.y);
  const distHome = Math.hypot(b.home.x - c.pos.x, b.home.y - c.pos.y);
  const brain = { ...b, alertMs: Math.max(0, (b.alertMs ?? 0) - c.dtMs) };
  const alerted = brain.alertMs > 0;

  // A tank inside the ship always calms drones down, alerted or not.
  if (brain.mode === 'chase') {
    const lost = alerted ? distHome > t.alertLeash : distPlayer > t.loseRadius || distHome > t.leashRadius;
    if (c.playerSafe || lost) Object.assign(brain, { mode: 'return', alertMs: 0 });
  } else if (!c.playerSafe && (alerted || (distPlayer < t.detectRadius && distHome < t.leashRadius))) {
    brain.mode = 'chase';
  }

  const go = (target: Vec, speed: number) => move(brain, c, t, target, speed);

  if (brain.mode === 'chase') return go(c.player, t.chaseSpeed);

  if (brain.mode === 'return') {
    if (distHome >= 8) return go(b.home, t.patrolSpeed * 1.5);
    Object.assign(brain, { mode: 'patrol', waypoint: { ...b.home }, waitMs: 0 });
  }

  // Patrol: drift to a waypoint near home, idle a moment, pick another.
  if (Math.hypot(brain.waypoint.x - c.pos.x, brain.waypoint.y - c.pos.y) < 4) {
    if (brain.waitMs > 0) {
      brain.waitMs = Math.max(0, brain.waitMs - c.dtMs);
      brain.stuckMs = 0;
      return { brain, velocity: { x: 0, y: 0 } };
    }
    brain.waypoint = patrolPoint(b.home, t.patrolRadius, c.rng, c.obstacles ?? []);
    brain.waitMs = 400 + c.rng() * 1200;
  }
  return go(brain.waypoint, t.patrolSpeed);
}

/**
 * Heads for the target, steering around obstacles. If the drone keeps trying
 * to move but barely does (wedged between rocks), it sidesteps for a moment;
 * a patrolling drone just gives up on that waypoint.
 */
function move(brain: DroneBrain, c: DroneContext, t: DroneTuning, target: Vec, speed: number): { brain: DroneBrain; velocity: Vec } {
  const obstacles = c.obstacles ?? [];
  if (brain.detour && (brain.detourMs ?? 0) > 0) {
    brain.detourMs = (brain.detourMs ?? 0) - c.dtMs;
    if (brain.detourMs <= 0) brain.detour = undefined;
    else {
      const v = steerToward(c.pos, brain.detour, speed, obstacles, t.lookahead);
      return { brain, velocity: { x: v.x, y: v.y } };
    }
  }

  const steer = steerToward(c.pos, target, speed, obstacles, t.lookahead, brain.side);
  brain.side = steer.side;
  const velocity = { x: steer.x, y: steer.y };
  const trying = Math.hypot(velocity.x, velocity.y) > 1;
  const stalled = trying && c.speed !== undefined && c.speed < speed * 0.3;
  brain.stuckMs = stalled ? (brain.stuckMs ?? 0) + c.dtMs : 0;
  if (brain.stuckMs < t.stuckAfterMs) return { brain, velocity };

  brain.stuckMs = 0;
  if (brain.mode === 'patrol') {
    brain.waypoint = { ...c.pos };
    brain.waitMs = 0;
    return { brain, velocity: { x: 0, y: 0 } };
  }
  // Sidestep at right angles to the way it wanted to go.
  const side = c.rng() < 0.5 ? -1 : 1;
  const len = Math.hypot(target.x - c.pos.x, target.y - c.pos.y) || 1;
  const nx = (-(target.y - c.pos.y) / len) * side;
  const ny = ((target.x - c.pos.x) / len) * side;
  brain.detour = { x: c.pos.x + nx * t.detourDistance, y: c.pos.y + ny * t.detourDistance };
  brain.detourMs = t.detourMs;
  const v = steerToward(c.pos, brain.detour, speed, obstacles, t.lookahead);
  return { brain, velocity: { x: v.x, y: v.y } };
}

/** A random point within the patrol radius that isn't inside a rock (home as a last resort). */
function patrolPoint(home: Vec, radius: number, rng: () => number, obstacles: readonly Circle[]): Vec {
  for (let i = 0; i < 8; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    const p = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
    if (!insideAny(p, obstacles)) return p;
  }
  return { ...home };
}

/** Pushes `p` out to the edge of a circle if it is inside it. */
export function clampOutsideCircle(p: Vec, center: Vec, radius: number): Vec {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const d = Math.hypot(dx, dy);
  if (d >= radius) return p;
  if (d < 1e-6) return { x: center.x + radius, y: center.y };
  return { x: center.x + (dx / d) * radius, y: center.y + (dy / d) * radius };
}
