import { createRng, randRange } from './rng';

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
}

export interface DroneTuning {
  patrolRadius: number;
  patrolSpeed: number;
  chaseSpeed: number;
  detectRadius: number;
  loseRadius: number;
  leashRadius: number;
}

export interface DroneContext {
  pos: Vec;
  player: Vec;
  /** The player is inside the ship's safe zone: never chase. */
  playerSafe: boolean;
  dtMs: number;
  rng: () => number;
}

/** One AI tick: returns the new brain and the velocity the drone wants. */
export function stepDrone(b: DroneBrain, c: DroneContext, t: DroneTuning): { brain: DroneBrain; velocity: Vec } {
  const distPlayer = Math.hypot(c.player.x - c.pos.x, c.player.y - c.pos.y);
  const distHome = Math.hypot(b.home.x - c.pos.x, b.home.y - c.pos.y);
  let brain = { ...b };

  if (brain.mode === 'chase') {
    if (c.playerSafe || distPlayer > t.loseRadius || distHome > t.leashRadius) brain.mode = 'return';
  } else if (!c.playerSafe && distPlayer < t.detectRadius && distHome < t.leashRadius) {
    brain.mode = 'chase';
  }

  if (brain.mode === 'chase') return { brain, velocity: toward(c.pos, c.player, t.chaseSpeed) };

  if (brain.mode === 'return') {
    if (distHome < 8) brain = { ...brain, mode: 'patrol', waypoint: { ...b.home }, waitMs: 0 };
    else return { brain, velocity: toward(c.pos, b.home, t.patrolSpeed * 1.5) };
  }

  // Patrol: drift to a waypoint near home, idle a moment, pick another.
  if (Math.hypot(brain.waypoint.x - c.pos.x, brain.waypoint.y - c.pos.y) < 4) {
    if (brain.waitMs > 0) {
      brain.waitMs = Math.max(0, brain.waitMs - c.dtMs);
      return { brain, velocity: { x: 0, y: 0 } };
    }
    const a = c.rng() * Math.PI * 2;
    const r = Math.sqrt(c.rng()) * t.patrolRadius;
    brain.waypoint = { x: b.home.x + Math.cos(a) * r, y: b.home.y + Math.sin(a) * r };
    brain.waitMs = 400 + c.rng() * 1200;
  }
  return { brain, velocity: toward(c.pos, brain.waypoint, t.patrolSpeed) };
}

function toward(from: Vec, to: Vec, speed: number): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  return { x: (dx / d) * speed, y: (dy / d) * speed };
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
