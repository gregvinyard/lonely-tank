import { BATTERY, CANNON, FUEL, HULL, TANK } from '../data/tuning';
import type { UpgradeLevels } from '../data/upgrades';

/** Everything about the tank that upgrades can change. */
export interface TankStats {
  maxHull: number;
  maxFuel: number;
  maxSpeed: number;
  accel: number;
  decel: number;
  cooldownMs: number;
  shellLifetimeMs: number;
  damage: number;
  /** 0 = none, 1 = marks nearest salvage, 2 = also its type and distance, 3 = rare materials first. */
  scanner: number;
  /** Hull per second while stopped and out of combat. */
  repairPerSec: number;
  maxBattery: number;
  /** Charge per second from the deployed solar panels. */
  solarPerSec: number;
}

export const UPGRADE_EFFECTS = {
  platingHull: 25,
  fuelTank: 40,
  engineSpeed: 0.12,
  autoloaderCooldown: 0.15,
  barrelRange: 0.3,
  apDamage: 1,
  repairRates: [0, 0.5, 1.5, 3],
  /** Power cells, by tier: extra battery, and the solar charge multiplier. */
  powerBattery: [0, 10, 10, 20],
  powerSolar: [1, 1, 1.6, 2.2],
  /** Field repair only runs after this long without taking damage. */
  repairCalmMs: 5000,
} as const;

/** The tank's stats for a set of upgrade levels. The only place upgrade effects are applied. */
export function computeStats(lv: UpgradeLevels): TankStats {
  const e = UPGRADE_EFFECTS;
  const speed = 1 + e.engineSpeed * lv.engine;
  return {
    maxHull: HULL.max + e.platingHull * lv.plating,
    maxFuel: FUEL.max + e.fuelTank * lv.fuelTanks,
    maxSpeed: TANK.maxSpeed * speed,
    accel: TANK.accel * speed,
    decel: TANK.decel * speed,
    cooldownMs: Math.round(CANNON.cooldownMs * (1 - e.autoloaderCooldown * lv.autoloader)),
    shellLifetimeMs: Math.round(CANNON.lifetimeMs * (1 + e.barrelRange * lv.barrel)),
    damage: CANNON.damage + e.apDamage * lv.apShells,
    scanner: lv.scanner,
    repairPerSec: e.repairRates[lv.repairKit] ?? 0,
    maxBattery: BATTERY.max + e.powerBattery[lv.power],
    solarPerSec: BATTERY.solarPerSec * e.powerSolar[lv.power],
  };
}
