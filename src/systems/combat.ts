import type { Inventory } from './inventory';
import { RESOURCE_KINDS } from './resources';

/** True when enough time has passed since the last shot. */
export function canFire(nowMs: number, lastFiredMs: number, cooldownMs: number): boolean {
  return nowMs - lastFiredMs >= cooldownMs;
}

export function applyDamage(hull: number, damage: number): number {
  return Math.max(0, hull - damage);
}

/** Salvage left after a rescue: each resource loses `fraction`, rounded down. */
export function rescuePenalty(inv: Inventory, fraction: number): { inventory: Inventory; lost: Inventory } {
  const lost = Object.fromEntries(RESOURCE_KINDS.map((k) => [k, Math.floor(inv[k] * fraction)])) as Inventory;
  const left = Object.fromEntries(RESOURCE_KINDS.map((k) => [k, inv[k] - lost[k]])) as Inventory;
  return { inventory: left, lost };
}
