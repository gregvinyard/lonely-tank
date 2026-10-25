import type { Inventory } from './inventory';

/** True when enough time has passed since the last shot. */
export function canFire(nowMs: number, lastFiredMs: number, cooldownMs: number): boolean {
  return nowMs - lastFiredMs >= cooldownMs;
}

export function applyDamage(hull: number, damage: number): number {
  return Math.max(0, hull - damage);
}

/** Salvage left after a rescue: each resource loses `fraction`, rounded down. */
export function rescuePenalty(inv: Inventory, fraction: number): { inventory: Inventory; lost: Inventory } {
  const lost = { scrap: Math.floor(inv.scrap * fraction), crystal: Math.floor(inv.crystal * fraction) };
  return { inventory: { scrap: inv.scrap - lost.scrap, crystal: inv.crystal - lost.crystal }, lost };
}
