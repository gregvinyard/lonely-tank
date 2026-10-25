import type { Vec } from './drone';

/** Which way a mover is going around an obstacle: -1 or +1 (turning against or with the clock in screen space). */
export type Side = -1 | 1;

/** A steering velocity, plus the side taken if something was in the way. */
export interface Steer extends Vec {
  side?: Side;
}

const SIDE_STICKINESS = 0.8; // rad

/** A round obstacle, already grown by the mover's own radius. */
export interface Circle {
  x: number;
  y: number;
  r: number;
}

/**
 * Velocity of `speed` toward `target`, bent around the nearest circle that
 * blocks the straight line. The detour aims along whichever tangent of that
 * circle is closer to the direct heading, so the mover slides around it
 * instead of pushing into it.
 */
export function steerToward(
  pos: Vec,
  target: Vec,
  speed: number,
  obstacles: readonly Circle[],
  lookahead: number,
  side?: Side,
): Steer {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6 || speed <= 0) return { x: 0, y: 0 };
  const ux = dx / dist;
  const uy = dy / dist;
  const reach = Math.min(dist, lookahead);

  let block: { c: Circle; t: number; d: number } | undefined;
  for (const c of obstacles) {
    const cx = c.x - pos.x;
    const cy = c.y - pos.y;
    const t = cx * ux + cy * uy; // distance along the heading to the center's closest point
    if (t <= 0 || t - c.r > reach) continue;
    if (Math.abs(cx * uy - cy * ux) >= c.r) continue; // passes beside it
    // A target inside the circle can't be reached anyway; don't swerve forever.
    if (Math.hypot(target.x - c.x, target.y - c.y) < c.r) continue;
    if (!block || t < block.t) block = { c, t, d: Math.hypot(cx, cy) };
  }
  if (!block) return { x: ux * speed, y: uy * speed };

  // Rocks that touch form one wall: go around the whole cluster, not just the
  // nearest rock (whose edge may lead straight into its neighbour).
  const heading = Math.atan2(uy, ux);
  let left = 0;
  let right = 0;
  for (const c of cluster(block.c, obstacles)) {
    const d = Math.hypot(c.x - pos.x, c.y - pos.y);
    const rel = angleDiff(Math.atan2(c.y - pos.y, c.x - pos.x), heading);
    // Already touching the grown circle: go sideways and a little outward.
    const spread = d <= c.r ? Math.PI / 2 + 0.25 : Math.asin(c.r / d) + 0.08;
    left = Math.min(left, rel - spread);
    right = Math.max(right, rel + spread);
  }
  // Stick with the side already chosen unless the other is much shorter, so a
  // rock dead ahead doesn't flip the choice every frame.
  let go: Side = -left <= right ? -1 : 1;
  if (side && side !== go && Math.abs(side < 0 ? left : right) < Math.abs(go < 0 ? left : right) + SIDE_STICKINESS) go = side;
  const pick = heading + (go < 0 ? left : right);
  return { x: Math.cos(pick) * speed, y: Math.sin(pick) * speed, side: go };
}

/** The circle plus every circle connected to it by overlaps. */
function cluster(start: Circle, obstacles: readonly Circle[]): Circle[] {
  const found = [start];
  for (let i = 0; i < found.length; i++) {
    const a = found[i];
    for (const b of obstacles) {
      if (!found.includes(b) && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) found.push(b);
    }
  }
  return found;
}

/** True if `p` is inside any of the circles. */
export function insideAny(p: Vec, obstacles: readonly Circle[]): boolean {
  return obstacles.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < c.r);
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
