import { describe, expect, it } from 'vitest';
import { FONT_CHARS } from '../src/data/pixelFont';
import { UPGRADES, noUpgrades, type UpgradeLevels } from '../src/data/upgrades';
import { computeStats } from '../src/systems/stats';
import { TOTAL_TIERS, build, checkBuild, costText, goalText, service, type TankStatus } from '../src/systems/workshop';

const REPAIR = { scrap: 3, hull: 25 };
const rich = { scrap: 999, crystal: 999, circuit: 999 };
const base: TankStatus = { hull: 100, fuel: 100, inventory: { scrap: 0, crystal: 0, circuit: 0 }, levels: noUpgrades() };
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
    const r = service({ ...base, hull: 60, inventory: { scrap: 4, crystal: 0, circuit: 0 } }, 'repair', REPAIR);
    expect(r.ok && r.status).toMatchObject({ hull: 85, inventory: { scrap: 1 } });
    const capped = service({ ...base, hull: 90, inventory: { scrap: 3, crystal: 0, circuit: 0 } }, 'repair', REPAIR);
    expect(capped.ok && capped.status.hull).toBe(100);
    expect(service({ ...base, hull: 50 }, 'repair', REPAIR)).toEqual({ ok: false, message: 'Need 3 scrap' });
  });
});

describe('upgrades', () => {
  it('builds tiers in order, spends the cost and stops at max', () => {
    let s: TankStatus = { ...base, inventory: rich };
    for (let t = 1; t <= 3; t++) {
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
    const r = checkBuild(noUpgrades(), { scrap: 8, crystal: 1, circuit: 0 }, 'plating');
    expect(r).toMatchObject({ ok: false, reason: 'cost', message: 'Need 8 scrap, 2 crystal' });
  });

  it('respects requirements', () => {
    expect(checkBuild(noUpgrades(), rich, 'apShells')).toMatchObject({ ok: false, reason: 'locked', message: 'Needs Autoloader 1' });
    expect(checkBuild(lv({ autoloader: 1 }), rich, 'apShells').ok).toBe(true);
    expect(checkBuild(noUpgrades(), rich, 'repairKit')).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('costs rise with each tier', () => {
    for (const u of UPGRADES) {
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
});

describe('goal ladder', () => {
  it('climbs from first build to fully upgraded', () => {
    expect(goalText(noUpgrades())).toBe('Goal: salvage and build an upgrade');
    expect(goalText(lv({ plating: 1 }))).toBe('Goal: reach tier 2 in any upgrade');
    expect(goalText(lv({ plating: 2 }))).toBe('Goal: build 6 upgrade tiers · 2/6');
    expect(goalText(lv({ plating: 3, engine: 3 }))).toBe('Goal: max out 3 upgrades · 2/3');
    expect(goalText(lv({ plating: 3, engine: 3, fuelTanks: 3 }))).toBe(`Goal: max everything · 9/${TOTAL_TIERS}`);
    const all = Object.fromEntries(UPGRADES.map((u) => [u.id, u.tiers.length])) as UpgradeLevels;
    expect(goalText(all)).toBe('Fully upgraded · explore freely');
  });
});

describe('text fits the pixel font', () => {
  it('every name, effect, goal and message uses known glyphs', () => {
    const texts: string[] = [];
    for (const u of UPGRADES) {
      texts.push(u.name, ...u.tiers.map((t) => t.effect), costText(u.tiers[0].cost));
      texts.push(checkBuild(noUpgrades(), { scrap: 0, crystal: 0, circuit: 0 }, u.id).ok ? '' : (checkBuild(noUpgrades(), { scrap: 0, crystal: 0, circuit: 0 }, u.id) as { message: string }).message);
      const r = build({ ...base, inventory: rich, levels: lv({ autoloader: 1, plating: 1 }) }, u.id);
      texts.push(r.message);
    }
    texts.push(goalText(noUpgrades()), goalText(lv({ plating: 2 })), goalText(lv({ plating: 3, engine: 3 })));
    for (const a of ['refuel', 'repair'] as const) texts.push(service(base, a, REPAIR).message, service({ ...base, hull: 1, fuel: 1 }, a, REPAIR).message);
    for (const t of texts) for (const ch of t.toUpperCase()) expect(FONT_CHARS, `${ch} in "${t}"`).toContain(ch);
  });
});
