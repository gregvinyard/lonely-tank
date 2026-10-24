// Pure movement math for the tank. No Phaser imports, so it can be unit tested.

export interface Vec2 {
  x: number;
  y: number;
}

export interface DriveParams {
  maxSpeed: number; // px/sec
  accel: number; // px/sec^2 while input is held
  decel: number; // px/sec^2 when coasting to a stop
}

/** Normalizes raw directional input so diagonals aren't faster. */
export function normalizeInput(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/**
 * Moves the current velocity toward the target velocity (input * maxSpeed)
 * by at most accel*dt (or decel*dt when there is no input).
 */
export function stepVelocity(vel: Vec2, input: Vec2, dt: number, p: DriveParams): Vec2 {
  const dir = normalizeInput(input.x, input.y);
  const target = { x: dir.x * p.maxSpeed, y: dir.y * p.maxSpeed };
  const hasInput = dir.x !== 0 || dir.y !== 0;
  const rate = (hasInput ? p.accel : p.decel) * dt;

  const dx = target.x - vel.x;
  const dy = target.y - vel.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= rate || dist === 0) return target;
  return { x: vel.x + (dx / dist) * rate, y: vel.y + (dy / dist) * rate };
}

/** Wraps an angle in radians to the range (-PI, PI]. */
export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  let r = ((a % t) + t) % t;
  if (r > Math.PI) r -= t;
  return r;
}

/** Rotates `current` toward `target` by at most `maxStep` radians, taking the shortest way. */
export function rotateToward(current: number, target: number, maxStep: number): number {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(diff) * maxStep);
}
