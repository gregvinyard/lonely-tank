// The tank's hybrid drive: an electric motor runs off the battery, a fuel
// generator keeps the battery topped up, and solar panels can trickle-charge
// it when the fuel is gone.

export interface Power {
  fuel: number;
  battery: number;
}

export interface PowerTuning {
  /** Battery drained per second at full speed (scaled by throttle, nothing at rest). */
  drainPerSec: number;
  /** Most the generator can put into the battery per second; it burns fuel 1:1. */
  generatorPerSec: number;
  /** Charge per second from the deployed solar panels. */
  solarPerSec: number;
}

export interface PowerStep {
  /** Speed as a fraction of top speed, 0..1. */
  throttle: number;
  /** Solar panels fully deployed. */
  solar: boolean;
  dtMs: number;
  maxFuel: number;
  maxBattery: number;
}

/** One tick: drive drains the battery, then the sun and the generator refill it (the generator only as needed). */
export function stepPower(p: Power, s: PowerStep, t: PowerTuning): Power {
  const dt = s.dtMs / 1000;
  let battery = Math.max(0, p.battery - t.drainPerSec * Math.min(1, Math.max(0, s.throttle)) * dt);
  if (s.solar) battery = Math.min(s.maxBattery, battery + t.solarPerSec * dt);
  let fuel = p.fuel;
  const room = s.maxBattery - battery;
  if (fuel > 0 && room > 0) {
    const charge = Math.min(t.generatorPerSec * dt, room, fuel);
    battery += charge;
    fuel -= charge;
  }
  return { fuel, battery };
}

/** The motor needs some charge to turn. */
export function canDrive(p: Power): boolean {
  return p.battery > 0;
}

/** Out of fuel and out of charge: going nowhere until the panels come out. */
export function stranded(p: Power): boolean {
  return p.fuel <= 0 && p.battery <= 0;
}
