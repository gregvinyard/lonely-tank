import type { Inventory } from './inventory';

/** Everything the workshop can read or change. */
export interface TankStatus {
  hull: number;
  fuel: number;
  maxFuel: number;
  inventory: Inventory;
  plating: boolean;
}

export interface WorkshopTuning {
  baseHull: number;
  repair: { scrap: number; hull: number };
  plating: { scrap: number; crystal: number; maxHull: number };
}

export type WorkshopAction = 'refuel' | 'repair' | 'plating';
export type ActionResult = { ok: true; status: TankStatus; message: string } | { ok: false; message: string };

/** Max hull comes from the upgrade, never from stored numbers. */
export function maxHullFor(plating: boolean, t: WorkshopTuning): number {
  return t.baseHull + (plating ? t.plating.maxHull : 0);
}

export function applyAction(s: TankStatus, action: WorkshopAction, t: WorkshopTuning): ActionResult {
  const inv = s.inventory;
  switch (action) {
    case 'refuel':
      if (s.fuel >= s.maxFuel) return { ok: false, message: 'Fuel tank is already full' };
      return { ok: true, status: { ...s, fuel: s.maxFuel }, message: 'Refueled' };

    case 'repair': {
      const max = maxHullFor(s.plating, t);
      if (s.hull >= max) return { ok: false, message: 'Hull is already intact' };
      if (inv.scrap < t.repair.scrap) return { ok: false, message: `Need ${t.repair.scrap} scrap` };
      return {
        ok: true,
        status: { ...s, hull: Math.min(max, s.hull + t.repair.hull), inventory: { ...inv, scrap: inv.scrap - t.repair.scrap } },
        message: `Repaired +${t.repair.hull} hull`,
      };
    }

    case 'plating': {
      const c = t.plating;
      if (s.plating) return { ok: false, message: 'Plating already installed' };
      if (inv.scrap < c.scrap || inv.crystal < c.crystal) return { ok: false, message: `Need ${c.scrap} scrap, ${c.crystal} crystal` };
      return {
        ok: true,
        // The new plating adds its hull on top of the current integrity.
        status: {
          ...s,
          plating: true,
          hull: s.hull + c.maxHull,
          inventory: { scrap: inv.scrap - c.scrap, crystal: inv.crystal - c.crystal },
        },
        message: 'Reinforced plating installed',
      };
    }
  }
}

/** The current objective, shown in the HUD. */
export function objectiveText(inv: Inventory, plating: boolean, t: WorkshopTuning): string {
  if (plating) return 'Plating installed · explore freely';
  const c = t.plating;
  if (inv.scrap >= c.scrap && inv.crystal >= c.crystal) return 'Return to ship · craft plating';
  return `Goal: plating · scrap ${Math.min(inv.scrap, c.scrap)}/${c.scrap} crystal ${Math.min(inv.crystal, c.crystal)}/${c.crystal}`;
}
