import { UPGRADES, noUpgrades, type UpgradeLevels } from '../data/upgrades';
import type { Inventory } from './inventory';
import type { ResourceKind } from './resources';

// localStorage save. Bump SAVE_VERSION whenever the shape changes and add a
// migration from the previous version; unknown versions are ignored and the
// player starts a new game.
export const SAVE_VERSION = 2;

/** Something dropped by a destroyed drone that hasn't been picked up yet. */
export interface SavedDrop {
  id: string;
  kind: ResourceKind;
  amount: number;
  x: number;
  y: number;
}

/** A collected node or destroyed drone, and the play time when it happened (for respawns). */
export interface SavedEvent {
  id: string;
  at: number;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  seed: number;
  /** Milliseconds of unpaused play. */
  playTimeMs: number;
  /** `battery` came with the hybrid drive (v0.5); older saves load with a full one. */
  tank: { x: number; y: number; hull: number; fuel: number; battery?: number };
  inventory: Inventory;
  /** Collected resource nodes, including drone drops. */
  collected: SavedEvent[];
  /** Destroyed drones. */
  destroyed: SavedEvent[];
  drops: SavedDrop[];
  upgrades: UpgradeLevels;
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The browser's localStorage, or undefined where even touching it throws (some privacy modes). */
export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Reads the save, or undefined if there is none or it can't be used. Never throws. */
export function loadSave(storage: Storage, key: string): SaveData | undefined {
  try {
    const raw = storage.getItem(key);
    return raw === null ? undefined : parseSave(raw);
  } catch {
    return undefined;
  }
}

/** True if anything is stored under `key`, valid or not. Never throws. */
export function hasSave(storage: Storage, key: string): boolean {
  try {
    return storage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/** Writes the save; returns false if storage is unavailable or full. Never throws. */
export function writeSave(storage: Storage, key: string, data: SaveData): boolean {
  try {
    storage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** Validates untrusted JSON, migrating older versions. Returns undefined for anything unusable. */
export function parseSave(raw: string): SaveData | undefined {
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isObj(d)) return undefined;
  if (d.version === 1) d = migrateV1(d);
  if (!isObj(d) || d.version !== SAVE_VERSION) return undefined;

  const { seed, playTimeMs, tank, inventory, collected, destroyed, drops, upgrades } = d;
  if (!Number.isInteger(seed) || !isNum(playTimeMs) || playTimeMs < 0) return undefined;
  if (!isObj(tank) || ![tank.x, tank.y, tank.hull, tank.fuel].every(isNum)) return undefined;
  if (tank.battery !== undefined && !isNum(tank.battery)) return undefined;
  if (!isObj(inventory) || ![inventory.scrap, inventory.crystal, inventory.circuit].every(isCount)) return undefined;
  if (!isEvents(collected) || !isEvents(destroyed)) return undefined;
  if (!Array.isArray(drops) || !drops.every(isDrop)) return undefined;
  if (!isObj(upgrades)) return undefined;

  const levels = noUpgrades();
  for (const u of UPGRADES) {
    const v = upgrades[u.id];
    if (v === undefined) continue; // a line added after this save was written
    if (!isCount(v)) return undefined;
    levels[u.id] = Math.min(v, u.tiers.length);
  }

  return {
    version: SAVE_VERSION,
    seed: seed as number,
    playTimeMs,
    tank: {
      x: tank.x as number,
      y: tank.y as number,
      hull: tank.hull as number,
      fuel: tank.fuel as number,
      ...(tank.battery === undefined ? {} : { battery: tank.battery as number }),
    },
    inventory: { scrap: inventory.scrap as number, crystal: inventory.crystal as number, circuit: inventory.circuit as number },
    collected: collected.map(({ id, at }) => ({ id, at })),
    destroyed: destroyed.map(({ id, at }) => ({ id, at })),
    drops: drops.map(({ id, kind, amount, x, y }) => ({ id, kind, amount, x, y })),
    upgrades: levels,
  };
}

/**
 * v1 (v0.1): plating flag, string id lists, scrap-only drops, no circuits or
 * play time. Shape problems are left for the v2 validation to reject.
 */
function migrateV1(d: Record<string, unknown>): Record<string, unknown> {
  const ids = (v: unknown) => (Array.isArray(v) ? v.map((id) => ({ id, at: 0 })) : v);
  const inv = isObj(d.inventory) ? { ...d.inventory, circuit: 0 } : d.inventory;
  const drops = Array.isArray(d.drops) ? d.drops.map((x) => (isObj(x) ? { ...x, kind: 'scrap' } : x)) : d.drops;
  const plating = isObj(d.upgrades) ? d.upgrades.plating : undefined;
  return {
    ...d,
    version: 2,
    playTimeMs: 0,
    inventory: inv,
    collected: ids(d.collected),
    destroyed: ids(d.destroyed),
    drops,
    upgrades: typeof plating === 'boolean' ? { plating: plating ? 1 : 0 } : undefined,
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isCount(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0;
}

function isEvents(v: unknown): v is SavedEvent[] {
  return Array.isArray(v) && v.every((e) => isObj(e) && typeof e.id === 'string' && isNum(e.at) && e.at >= 0);
}

function isDrop(v: unknown): v is SavedDrop {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    (v.kind === 'scrap' || v.kind === 'crystal' || v.kind === 'circuit') &&
    isCount(v.amount) &&
    (v.amount as number) > 0 &&
    isNum(v.x) &&
    isNum(v.y)
  );
}

/**
 * Brings saved tank values into range: inside the world, hull 1..max, fuel and
 * battery 0..max (a tank saved stranded loads stranded). A save from before
 * the battery existed loads with it full.
 */
export function clampTank(
  t: SaveData['tank'],
  maxHull: number,
  maxFuel: number,
  worldSize: number,
  margin: number,
  maxBattery: number,
): Required<SaveData['tank']> {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    x: clamp(t.x, margin, worldSize - margin),
    y: clamp(t.y, margin, worldSize - margin),
    hull: clamp(Math.round(t.hull), 1, maxHull),
    fuel: clamp(t.fuel, 0, maxFuel),
    battery: clamp(t.battery ?? maxBattery, 0, maxBattery),
  };
}
