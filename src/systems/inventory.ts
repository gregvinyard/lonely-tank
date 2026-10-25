import type { ResourceKind } from './resources';

export type Inventory = Record<ResourceKind, number>;

export function createInventory(): Inventory {
  return { scrap: 0, crystal: 0 };
}

export function addResource(inv: Inventory, kind: ResourceKind, amount: number): Inventory {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`Invalid amount: ${amount}`);
  return { ...inv, [kind]: inv[kind] + amount };
}
