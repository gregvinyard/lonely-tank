import type { Inventory } from './inventory';

// localStorage save. Bump SAVE_VERSION whenever the shape changes; older or
// unknown versions are ignored and the player starts a new game.
export const SAVE_VERSION = 1;

/** A destroyed drone's scrap that hasn't been picked up yet. */
export interface SavedDrop {
  id: string;
  amount: number;
  x: number;
  y: number;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  seed: number;
  tank: { x: number; y: number; hull: number; fuel: number };
  inventory: Inventory;
  /** Ids of collected resource nodes, including drone drops. */
  collected: string[];
  /** Ids of destroyed drones. */
  destroyed: string[];
  drops: SavedDrop[];
  upgrades: { plating: boolean };
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

/** Validates untrusted JSON. Returns undefined for anything malformed or from another version. */
export function parseSave(raw: string): SaveData | undefined {
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isObj(d) || d.version !== SAVE_VERSION) return undefined;
  const { seed, tank, inventory, collected, destroyed, drops, upgrades } = d;
  if (!Number.isInteger(seed)) return undefined;
  if (!isObj(tank) || ![tank.x, tank.y, tank.hull, tank.fuel].every(isNum)) return undefined;
  if (!isObj(inventory) || !isCount(inventory.scrap) || !isCount(inventory.crystal)) return undefined;
  if (!isIds(collected) || !isIds(destroyed)) return undefined;
  if (!Array.isArray(drops) || !drops.every(isDrop)) return undefined;
  if (!isObj(upgrades) || typeof upgrades.plating !== 'boolean') return undefined;

  return {
    version: SAVE_VERSION,
    seed: seed as number,
    tank: { x: tank.x as number, y: tank.y as number, hull: tank.hull as number, fuel: tank.fuel as number },
    inventory: { scrap: inventory.scrap as number, crystal: inventory.crystal as number },
    collected,
    destroyed,
    drops: drops.map(({ id, amount, x, y }) => ({ id, amount, x, y })),
    upgrades: { plating: upgrades.plating },
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

function isIds(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

function isDrop(v: unknown): v is SavedDrop {
  return isObj(v) && typeof v.id === 'string' && isCount(v.amount) && (v.amount as number) > 0 && isNum(v.x) && isNum(v.y);
}

/** Brings saved tank values into range: inside the world, hull 1..max, fuel 0..max. */
export function clampTank(t: SaveData['tank'], maxHull: number, maxFuel: number, worldSize: number, margin: number): SaveData['tank'] {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    x: clamp(t.x, margin, worldSize - margin),
    y: clamp(t.y, margin, worldSize - margin),
    hull: clamp(Math.round(t.hull), 1, maxHull),
    fuel: clamp(t.fuel, 0, maxFuel),
  };
}
