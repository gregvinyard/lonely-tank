import { describe, expect, it } from 'vitest';
import { FONT_CHARS } from '../src/data/pixelFont';
import { UPGRADES, noUpgrades, type UpgradeLevels } from '../src/data/upgrades';
import { computeStats } from '../src/systems/stats';
import { createInventory } from '../src/systems/inventory';
import { build, checkBuild, costText, goalText, service, type TankStatus } from '../src/systems/workshop';

const REPAIR = { scrap: 3, hull: 25 };
const inv = (o: Partial<TankStatus['inventory']>) => ({ ...createInventory(), ...o });
const rich = inv({ scrap: 999, crystal: 999, circuit: 999, prism: 999, spore: 999, salt: 999, relic: 999 });
const base: TankStatus = { hull: 100, fuel: 100, inventory: createInventory(), levels: noUpgrades() };
const lv = (o: Partial<UpgradeLevels>): UpgradeLevels => ({ ...noUpgrades(), ...o });

describe('workshop services', () => {
  it('refuels for free, but not when full', () => {
    const r = service({ ...base, fuel: 12 }, 'refuel', REPAIR);
    expect(r.ok && r.status.fuel).toBe(100);
    expect(service(base, 'refuel', REPAIR).ok).toBe(false);
  });

  it('refuels to the upgraded capacity', () => {
    const r = service({ ...base, fuel: 12, levels: lv({ fuelTanks: 2 }) }, 'refuel', REPAIR);
    expect(r.ok && r.status.fuel).toBe(180);
  });

  it('repairs 25 hull for 3 scrap, capped at max', () => {
    const r = service({ ...base, hull: 60, inventory: inv({ scrap: 4 }) }, 'repair', REPAIR);
    expect(r.ok && r.status).toMatchObject({ hull: 85, inventory: { scrap: 1 } });
    const capped = service({ ...base, hull: 90, inventory: inv({ scrap: 3 }) }, 'repair', REPAIR);
    expect(capped.ok && capped.status.hull).toBe(100);
    expect(service({ ...base, hull: 50 }, 'repair', REPAIR)).toEqual({ ok: false, message: 'Need 3 scrap' });
  });
});

describe('upgrades', () => {
  it('builds tiers in order, spends the cost and stops at max', () => {
    let s: TankStatus = { ...base, inventory: rich };
    for (let t = 1; t <= UPGRADES[0].tiers.length; t++) {
      const r = build(s, 'plating');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.status;
      expect(s.levels.plating).toBe(t);
    }
    const spent = UPGRADES[0].tiers.reduce((n, t) => n + (t.cost.scrap ?? 0), 0);
    expect(s.inventory.scrap).toBe(999 - spent);
    expect(build(s, 'plating')).toEqual({ ok: false, message: 'Fully upgraded' });
  });

  it('new hull and fuel capacity arrives filled', () => {
    const r = build({ ...base, hull: 80, fuel: 30, inventory: rich }, 'plating');
    expect(r.ok && r.status.hull).toBe(105);
    const f = build({ ...base, fuel: 30, inventory: rich }, 'fuelTanks');
    expect(f.ok && f.status.fuel).toBe(70);
  });

  it('refuses when short of any resource, naming the cost', () => {
    const r = checkBuild(noUpgrades(), inv({ scrap: 8, crystal: 1 }), 'plating');
    expect(r).toMatchObject({ ok: false, reason: 'cost', message: 'Need 8 scrap, 2 crystal' });
  });

  it('respects requirements', () => {
    expect(checkBuild(noUpgrades(), rich, 'apShells')).toMatchObject({ ok: false, reason: 'locked', message: 'Needs Autoloader 1' });
    expect(checkBuild(lv({ autoloader: 1 }), rich, 'apShells').ok).toBe(true);
    expect(checkBuild(noUpgrades(), rich, 'repairKit')).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('the array needs every crew log first', () => {
    expect(checkBuild(noUpgrades(), rich, 'transmitter', 5)).toMatchObject({ ok: false, reason: 'locked', message: "Needs the crew's plans" });
    expect(checkBuild(noUpgrades(), rich, 'transmitter', 6).ok).toBe(true);
    expect(build({ ...base, inventory: rich }, 'transmitter').ok).toBe(false);
    expect(build({ ...base, inventory: rich, logs: 6 }, 'transmitter').ok).toBe(true);
  });

  it('the top tiers need rare materials, and only the outer biomes have them', () => {
    const rare = ['prism', 'spore', 'salt', 'relic'] as const;
    for (const u of UPGRADES) {
      if (u.id === 'transmitter') continue;
      const last = u.tiers[u.tiers.length - 1].cost;
      expect(rare.some((k) => last[k]), u.id).toBe(true);
      // Everything below the top tier can be built from the home square's salvage.
      for (const t of u.tiers.slice(0, -1)) if (u.id !== 'power') expect(rare.some((k) => t.cost[k]), u.id).toBe(false);
    }
  });

  it('costs rise with each tier', () => {
    for (const u of UPGRADES.filter((u) => u.id !== 'transmitter')) {
      for (let i = 1; i < u.tiers.length; i++) expect(u.tiers[i].cost.scrap!, u.id).toBeGreaterThan(u.tiers[i - 1].cost.scrap!);
    }
  });

  it('formats costs', () => {
    expect(costText({ scrap: 8, crystal: 2 })).toBe('8 scrap, 2 crystal');
    expect(costText({ scrap: 1, circuit: 3 })).toBe('1 scrap, 3 circuit');
  });
});

describe('stats', () => {
  it('base stats match v0.1', () => {
    const s = computeStats(noUpgrades());
    expect(s).toMatchObject({ maxHull: 100, maxFuel: 100, maxSpeed: 160, cooldownMs: 420, shellLifetimeMs: 900, damage: 1, scanner: 0, repairPerSec: 0 });
  });

  it('applies every line', () => {
    const s = computeStats(lv({ plating: 3, fuelTanks: 3, engine: 3, autoloader: 3, barrel: 2, apShells: 2, scanner: 2, repairKit: 2 }));
    expect(s.maxHull).toBe(175);
    expect(s.maxFuel).toBe(220);
    expect(s.maxSpeed).toBeCloseTo(160 * 1.36);
    expect(s.cooldownMs).toBe(Math.round(420 * 0.55));
    expect(s.shellLifetimeMs).toBe(Math.round(900 * 1.6));
    expect(s.damage).toBe(3);
    expect(s.scanner).toBe(2);
    expect(s.repairPerSec).toBe(1.5);
  });

  it('applies the rare tiers and power cells', () => {
    const s = computeStats(lv({ plating: 4, repairKit: 3, scanner: 3, power: 3 }));
    expect(s.maxHull).toBe(200);
    expect(s.repairPerSec).toBe(3);
    expect(s.scanner).toBe(3);
    expect(s.maxBattery).toBe(40);
    expect(s.solarPerSec).toBeCloseTo(0.5 * 2.2);
    expect(computeStats(lv({ power: 1 }))).toMatchObject({ maxBattery: 30, solarPerSec: 0.5 });
  });
});

describe('goal ladder', () => {
  it('a first upgrade, then the crew trail, then the array', () => {
    expect(goalText(noUpgrades(), 0, 6)).toBe('Goal: salvage and build an upgrade');
    expect(goalText(lv({ plating: 1 }), 0, 6)).toBe('Goal: follow the signal · log 0/6');
    expect(goalText(lv({ plating: 1 }), 4, 6)).toBe('Goal: follow the signal · log 4/6');
    expect(goalText(lv({ plating: 1 }), 6, 6)).toBe('Goal: rebuild the array · 0/3');
    expect(goalText(lv({ plating: 1, transmitter: 2 }), 6, 6)).toBe('Goal: rebuild the array · 2/3');
    expect(goalText(lv({ transmitter: 3 }), 6, 6)).toBe('Signal answered · explore freely');
  });
});

describe('text fits the pixel font', () => {
  it('every name, effect, goal and message uses known glyphs', () => {
    const texts: string[] = [];
    for (const u of UPGRADES) {
      texts.push(u.name, ...u.tiers.map((t) => t.effect), costText(u.tiers[0].cost));
      texts.push(checkBuild(noUpgrades(), createInventory(), u.id).ok ? '' : (checkBuild(noUpgrades(), createInventory(), u.id) as { message: string }).message);
      texts.push(costText(u.tiers[u.tiers.length - 1].cost));
      const r = build({ ...base, inventory: rich, logs: 6, levels: lv({ autoloader: 1, plating: 1 }) }, u.id);
      texts.push(r.message);
    }
    texts.push(goalText(noUpgrades(), 0, 6), goalText(lv({ plating: 2 }), 2, 6), goalText(lv({ plating: 3 }), 6, 6), goalText(lv({ transmitter: 3 }), 6, 6));
    for (const a of ['refuel', 'repair'] as const) texts.push(service(base, a, REPAIR).message, service({ ...base, hull: 1, fuel: 1 }, a, REPAIR).message);
    for (const t of texts) for (const ch of t.toUpperCase()) expect(FONT_CHARS, `${ch} in "${t}"`).toContain(ch);
  });
});
