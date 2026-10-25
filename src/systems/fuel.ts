/** Fuel left after driving for `dtMs` at `speed`; burns `perSecond` at full speed, nothing at rest. */
export function burnFuel(fuel: number, speed: number, maxSpeed: number, dtMs: number, perSecond: number): number {
  if (speed < 1) return fuel;
  const throttle = Math.min(1, speed / maxSpeed);
  return Math.max(0, fuel - perSecond * throttle * (dtMs / 1000));
}
