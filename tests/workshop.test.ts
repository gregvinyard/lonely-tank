import { describe, expect, it } from 'vitest';
import { FONT_CHARS } from '../src/data/pixelFont';
import { applyAction, maxHullFor, objectiveText, type TankStatus, type WorkshopTuning } from '../src/systems/workshop';

const T: WorkshopTuning = { baseHull: 100, repair: { scrap: 3, hull: 25 }, plating: { scrap: 8, crystal: 2, maxHull: 25 } };
const base: TankStatus = { hull: 100, fuel: 100, maxFuel: 100, inventory: { scrap: 0, crystal: 0 }, plating: false };

describe('workshop', () => {
  it('refuels for free, but not when full', () => {
    const r = applyAction({ ...base, fuel: 12 }, 'refuel', T);
    expect(r.ok && r.status.fuel).toBe(100);
    expect(applyAction(base, 'refuel', T).ok).toBe(false);
  });

  it('repairs 25 hull for 3 scrap, capped at max', () => {
    const r = applyAction({ ...base, hull: 60, inventory: { scrap: 4, crystal: 0 } }, 'repair', T);
    expect(r.ok && r.status).toMatchObject({ hull: 85, inventory: { scrap: 1, crystal: 0 } });
    const capped = applyAction({ ...base, hull: 90, inventory: { scrap: 3, crystal: 0 } }, 'repair', T);
    expect(capped.ok && capped.status.hull).toBe(100);
  });

  it('refuses repair when intact or short of scrap', () => {
    expect(applyAction({ ...base, inventory: { scrap: 9, crystal: 0 } }, 'repair', T).ok).toBe(false);
    expect(applyAction({ ...base, hull: 50, inventory: { scrap: 2, crystal: 0 } }, 'repair', T)).toEqual({ ok: false, message: 'Need 3 scrap' });
  });

  it('repairs up to the plated maximum', () => {
    const r = applyAction({ ...base, hull: 100, plating: true, inventory: { scrap: 3, crystal: 0 } }, 'repair', T);
    expect(r.ok && r.status.hull).toBe(125);
  });

  it('crafts plating once for 8 scrap and 2 crystal', () => {
    const r = applyAction({ ...base, hull: 80, inventory: { scrap: 9, crystal: 2 } }, 'plating', T);
    expect(r.ok && r.status).toMatchObject({ plating: true, hull: 105, inventory: { scrap: 1, crystal: 0 } });
    expect(maxHullFor(true, T)).toBe(125);
    expect(applyAction({ ...base, plating: true, inventory: { scrap: 20, crystal: 20 } }, 'plating', T).ok).toBe(false);
  });

  it('refuses plating without enough of either resource', () => {
    expect(applyAction({ ...base, inventory: { scrap: 8, crystal: 1 } }, 'plating', T).ok).toBe(false);
    expect(applyAction({ ...base, inventory: { scrap: 7, crystal: 2 } }, 'plating', T).ok).toBe(false);
  });

  it('tracks the objective', () => {
    expect(objectiveText({ scrap: 3, crystal: 0 }, false, T)).toBe('Goal: plating · scrap 3/8 crystal 0/2');
    expect(objectiveText({ scrap: 12, crystal: 1 }, false, T)).toBe('Goal: plating · scrap 8/8 crystal 1/2');
    expect(objectiveText({ scrap: 8, crystal: 2 }, false, T)).toBe('Return to ship · craft plating');
    expect(objectiveText({ scrap: 0, crystal: 0 }, true, T)).toBe('Plating installed · explore freely');
  });

  it('writes every message with glyphs the pixel font has', () => {
    const texts = [
      objectiveText({ scrap: 1, crystal: 1 }, false, T),
      objectiveText({ scrap: 8, crystal: 2 }, false, T),
      objectiveText({ scrap: 0, crystal: 0 }, true, T),
    ];
    const statuses: TankStatus[] = [
      base,
      { ...base, hull: 10, fuel: 1 },
      { ...base, hull: 10, inventory: { scrap: 9, crystal: 9 } },
      { ...base, plating: true },
    ];
    for (const s of statuses) for (const a of ['refuel', 'repair', 'plating'] as const) texts.push(applyAction(s, a, T).message);
    for (const t of texts) for (const ch of t.toUpperCase()) expect(FONT_CHARS, `${ch} in "${t}"`).toContain(ch);
  });
});
