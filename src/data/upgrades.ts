import type { Inventory } from '../systems/inventory';

// The upgrade tree. Every line is data; effects are applied in
// src/systems/stats.ts and nowhere else.

export type UpgradeId = 'plating' | 'fuelTanks' | 'engine' | 'autoloader' | 'barrel' | 'apShells' | 'scanner' | 'repairKit';

export type Cost = Partial<Inventory>;

export interface UpgradeTier {
  cost: Cost;
  /** What this tier does, in a few words (pixel font, ~24 chars). */
  effect: string;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** Texture key of the 32x32 icon. */
  icon: string;
  tiers: UpgradeTier[];
  /** Needs another line at this tier first. */
  requires?: { id: UpgradeId; tier: number };
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'plating',
    name: 'Reinforced plating',
    icon: 'up_plating',
    tiers: [
      { cost: { scrap: 8, crystal: 2 }, effect: '+25 max hull' },
      { cost: { scrap: 14, crystal: 4, circuit: 1 }, effect: '+25 max hull' },
      { cost: { scrap: 22, crystal: 6, circuit: 3 }, effect: '+25 max hull' },
    ],
  },
  {
    id: 'fuelTanks',
    name: 'Fuel tanks',
    icon: 'up_fuel',
    tiers: [
      { cost: { scrap: 6, crystal: 1 }, effect: '+40 max fuel' },
      { cost: { scrap: 12, crystal: 3 }, effect: '+40 max fuel' },
      { cost: { scrap: 18, crystal: 5, circuit: 2 }, effect: '+40 max fuel' },
    ],
  },
  {
    id: 'engine',
    name: 'Engine tuning',
    icon: 'up_engine',
    tiers: [
      { cost: { scrap: 6, crystal: 2 }, effect: '+12% speed' },
      { cost: { scrap: 12, crystal: 4, circuit: 1 }, effect: '+12% speed' },
      { cost: { scrap: 20, crystal: 6, circuit: 3 }, effect: '+12% speed' },
    ],
  },
  {
    id: 'autoloader',
    name: 'Autoloader',
    icon: 'up_autoloader',
    tiers: [
      { cost: { scrap: 8, crystal: 1, circuit: 1 }, effect: '-15% reload time' },
      { cost: { scrap: 14, crystal: 3, circuit: 2 }, effect: '-15% reload time' },
      { cost: { scrap: 20, crystal: 5, circuit: 3 }, effect: '-15% reload time' },
    ],
  },
  {
    id: 'barrel',
    name: 'Long barrel',
    icon: 'up_barrel',
    tiers: [
      { cost: { scrap: 10, crystal: 2 }, effect: '+30% range' },
      { cost: { scrap: 16, crystal: 4, circuit: 2 }, effect: '+30% range' },
    ],
  },
  {
    id: 'apShells',
    name: 'AP shells',
    icon: 'up_ap',
    requires: { id: 'autoloader', tier: 1 },
    tiers: [
      { cost: { scrap: 12, crystal: 3, circuit: 2 }, effect: '+1 shell damage' },
      { cost: { scrap: 20, crystal: 6, circuit: 4 }, effect: '+1 shell damage' },
    ],
  },
  {
    id: 'scanner',
    name: 'Salvage scanner',
    icon: 'up_scanner',
    tiers: [
      { cost: { scrap: 5, crystal: 3 }, effect: 'Marks nearest salvage' },
      { cost: { scrap: 10, crystal: 5, circuit: 2 }, effect: 'Shows type and range' },
    ],
  },
  {
    id: 'repairKit',
    name: 'Field repair kit',
    icon: 'up_repair',
    requires: { id: 'plating', tier: 1 },
    tiers: [
      { cost: { scrap: 10, crystal: 3 }, effect: 'Repair 0.5/s at rest' },
      { cost: { scrap: 18, crystal: 5, circuit: 3 }, effect: 'Repair 1.5/s at rest' },
    ],
  },
];

export type UpgradeLevels = Record<UpgradeId, number>;

export const UPGRADE_IDS = UPGRADES.map((u) => u.id);

export function noUpgrades(): UpgradeLevels {
  return Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as UpgradeLevels;
}

export function upgradeDef(id: UpgradeId): UpgradeDef {
  return UPGRADES.find((u) => u.id === id)!;
}
