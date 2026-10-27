import { UPGRADES, upgradeDef, type Cost, type UpgradeId, type UpgradeLevels } from '../data/upgrades';
import type { Inventory } from './inventory';
import { RESOURCE_KINDS } from './resources';
import { computeStats } from './stats';

/** Everything the workshop can read or change. */
export interface TankStatus {
  hull: number;
  fuel: number;
  inventory: Inventory;
  levels: UpgradeLevels;
  /** Crew logs read so far (the array needs them all). */
  logs?: number;
}

export interface RepairTuning {
  scrap: number;
  hull: number;
}

export type ServiceAction = 'refuel' | 'repair';
export type ActionResult = { ok: true; status: TankStatus; message: string } | { ok: false; message: string };

export function canAfford(inv: Inventory, cost: Cost): boolean {
  return RESOURCE_KINDS.every((k) => inv[k] >= (cost[k] ?? 0));
}

export function spend(inv: Inventory, cost: Cost): Inventory {
  return Object.fromEntries(RESOURCE_KINDS.map((k) => [k, inv[k] - (cost[k] ?? 0)])) as Inventory;
}

/** "8 scrap, 2 crystal, 1 circuit" */
export function costText(cost: Cost): string {
  return RESOURCE_KINDS.filter((k) => cost[k])
    .map((k) => `${cost[k]} ${k}`)
    .join(', ');
}

export function service(s: TankStatus, action: ServiceAction, repair: RepairTuning): ActionResult {
  const stats = computeStats(s.levels);
  if (action === 'refuel') {
    if (s.fuel >= stats.maxFuel) return { ok: false, message: 'Fuel tank is already full' };
    return { ok: true, status: { ...s, fuel: stats.maxFuel }, message: 'Refueled' };
  }
  if (s.hull >= stats.maxHull) return { ok: false, message: 'Hull is already intact' };
  if (s.inventory.scrap < repair.scrap) return { ok: false, message: `Need ${repair.scrap} scrap` };
  return {
    ok: true,
    status: { ...s, hull: Math.min(stats.maxHull, s.hull + repair.hull), inventory: spend(s.inventory, { scrap: repair.scrap }) },
    message: `Repaired +${repair.hull} hull`,
  };
}

export type BuildCheck =
  | { ok: true; tier: number; cost: Cost }
  | { ok: false; reason: 'max' | 'locked' | 'cost'; message: string; tier?: number; cost?: Cost };

/** Whether the next tier of a line can be built now, and why not. */
export function checkBuild(levels: UpgradeLevels, inv: Inventory, id: UpgradeId, logs = 0): BuildCheck {
  const def = upgradeDef(id);
  const tier = levels[id];
  if (tier >= def.tiers.length) return { ok: false, reason: 'max', message: 'Fully upgraded' };
  if (def.requires && levels[def.requires.id] < def.requires.tier) {
    const req = upgradeDef(def.requires.id);
    return { ok: false, reason: 'locked', message: `Needs ${req.name} ${def.requires.tier}`, tier: tier + 1, cost: def.tiers[tier].cost };
  }
  if (def.requiresLogs && logs < def.requiresLogs) {
    return { ok: false, reason: 'locked', message: "Needs the crew's plans", tier: tier + 1, cost: def.tiers[tier].cost };
  }
  const cost = def.tiers[tier].cost;
  if (!canAfford(inv, cost)) return { ok: false, reason: 'cost', message: `Need ${costText(cost)}`, tier: tier + 1, cost };
  return { ok: true, tier: tier + 1, cost };
}

export function build(s: TankStatus, id: UpgradeId): ActionResult {
  const check = checkBuild(s.levels, s.inventory, id, s.logs);
  if (!check.ok) return { ok: false, message: check.message };
  const before = computeStats(s.levels);
  const levels = { ...s.levels, [id]: check.tier };
  const after = computeStats(levels);
  return {
    ok: true,
    // Extra hull and fuel capacity arrive filled.
    status: {
      levels,
      inventory: spend(s.inventory, check.cost),
      hull: s.hull + (after.maxHull - before.maxHull),
      fuel: s.fuel + (after.maxFuel - before.maxFuel),
    },
    message: `${upgradeDef(id).name} ${check.tier} built`,
  };
}

export function tiersBuilt(levels: UpgradeLevels): number {
  return UPGRADES.reduce((n, u) => n + levels[u.id], 0);
}

/** The goal shown in the HUD: a first upgrade, then the crew's trail, then the array. */
export function goalText(levels: UpgradeLevels, logs: number, totalLogs: number): string {
  if (tiersBuilt(levels) === 0) return 'Goal: salvage and build an upgrade';
  if (logs < totalLogs) return `Goal: follow the signal · log ${logs}/${totalLogs}`;
  const array = upgradeDef('transmitter');
  if (levels.transmitter < array.tiers.length) return `Goal: rebuild the array · ${levels.transmitter}/${array.tiers.length}`;
  return 'Signal answered · explore freely';
}
