import { describe, expect, it } from 'vitest';
import { noUpgrades } from '../src/data/upgrades';
import { SAVE_VERSION, clampTank, clearSave, hasSave, loadSave, parseSave, writeSave, type SaveData } from '../src/systems/save';

const good: SaveData = {
  version: SAVE_VERSION,
  seed: 1337,
  playTimeMs: 123456,
  tank: { x: 500, y: 600, hull: 80, fuel: 42.5 },
  inventory: { scrap: 3, crystal: 1, circuit: 2 },
  collected: [
    { id: 'scrap-00', at: 1000 },
    { id: 'drone-02-drop', at: 5000 },
  ],
  destroyed: [{ id: 'drone-02', at: 4000 }],
  drops: [{ id: 'drone-05-chip', kind: 'circuit', amount: 1, x: 900, y: 300 }],
  upgrades: { ...noUpgrades(), plating: 2, engine: 1 },
};

/** A real save written by v0.1. */
const v1 = {
  version: 1,
  seed: 1337,
  tank: { x: 1194, y: 1024, hull: 64, fuel: 37.5 },
  inventory: { scrap: 1, crystal: 1 },
  collected: ['scrap-00', 'drone-03-drop'],
  destroyed: ['drone-03', 'drone-07'],
  drops: [{ id: 'drone-07-drop', amount: 2, x: 812, y: 455 }],
  upgrades: { plating: true },
};

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('save', () => {
  it('round-trips through storage', () => {
    const s = memoryStorage();
    expect(writeSave(s, 'k', good)).toBe(true);
    expect(loadSave(s, 'k')).toEqual(good);
    clearSave(s, 'k');
    expect(loadSave(s, 'k')).toBeUndefined();
  });

  it('drops unknown fields and fills in upgrade lines added later', () => {
    const { engine: _engine, ...fewer } = good.upgrades;
    const extra = { ...good, cheat: true, upgrades: { ...fewer, laser: 9 } };
    expect(parseSave(JSON.stringify(extra))).toEqual({ ...good, upgrades: { ...good.upgrades, engine: 0 } });
  });

  it('caps upgrade levels at the number of tiers', () => {
    expect(parseSave(JSON.stringify({ ...good, upgrades: { ...good.upgrades, plating: 99 } }))?.upgrades.plating).toBe(3);
  });

  it('migrates a v0.1 save', () => {
    expect(parseSave(JSON.stringify(v1))).toEqual({
      version: 2,
      seed: 1337,
      playTimeMs: 0,
      tank: v1.tank,
      inventory: { scrap: 1, crystal: 1, circuit: 0 },
      collected: [
        { id: 'scrap-00', at: 0 },
        { id: 'drone-03-drop', at: 0 },
      ],
      destroyed: [
        { id: 'drone-03', at: 0 },
        { id: 'drone-07', at: 0 },
      ],
      drops: [{ id: 'drone-07-drop', kind: 'scrap', amount: 2, x: 812, y: 455 }],
      upgrades: { ...noUpgrades(), plating: 1 },
    });
    expect(parseSave(JSON.stringify({ ...v1, upgrades: { plating: false } }))?.upgrades.plating).toBe(0);
  });

  it.each([
    ['not JSON', '{oops'],
    ['null', 'null'],
    ['an array', '[]'],
    ['another version', JSON.stringify({ ...good, version: 99 })],
    ['no version', JSON.stringify({ ...good, version: undefined })],
    ['a fractional seed', JSON.stringify({ ...good, seed: 1.5 })],
    ['negative play time', JSON.stringify({ ...good, playTimeMs: -1 })],
    ['a missing tank', JSON.stringify({ ...good, tank: undefined })],
    ['a string position', JSON.stringify({ ...good, tank: { ...good.tank, x: '5' } })],
    ['a negative count', JSON.stringify({ ...good, inventory: { ...good.inventory, scrap: -1 } })],
    ['missing circuits', JSON.stringify({ ...good, inventory: { scrap: 1, crystal: 1 } })],
    ['bare string events', JSON.stringify({ ...good, collected: ['scrap-00'] })],
    ['a bad drop kind', JSON.stringify({ ...good, drops: [{ ...good.drops[0], kind: 'gold' }] })],
    ['a fractional upgrade level', JSON.stringify({ ...good, upgrades: { ...good.upgrades, plating: 1.5 } })],
    ['a broken v1 save', JSON.stringify({ ...v1, collected: [1, 2] })],
    ['a v1 save without upgrades', JSON.stringify({ ...v1, upgrades: undefined })],
  ])('rejects %s', (_name, raw) => {
    expect(parseSave(raw)).toBeUndefined();
  });

  it('survives storage that throws', () => {
    const fail = () => {
      throw new Error('denied');
    };
    const broken = { getItem: fail, setItem: fail, removeItem: fail };
    expect(loadSave(broken, 'k')).toBeUndefined();
    expect(hasSave(broken, 'k')).toBe(false);
    expect(writeSave(broken, 'k', good)).toBe(false);
    expect(() => clearSave(broken, 'k')).not.toThrow();
  });

  it('clamps tank values into range', () => {
    expect(clampTank({ x: -50, y: 5000, hull: 0, fuel: 150, battery: 30 }, 125, 100, { min: 0, max: 2048 }, 20, 20)).toEqual({ x: 20, y: 2028, hull: 1, fuel: 100, battery: 20 });
    expect(clampTank({ x: 500, y: 600, hull: 200, fuel: -3, battery: -1 }, 100, 100, { min: 0, max: 2048 }, 20, 20)).toEqual({ x: 500, y: 600, hull: 100, fuel: 0, battery: 0 });
    // Saved before the hybrid drive: the battery starts full.
    expect(clampTank({ x: 500, y: 600, hull: 50, fuel: 10 }, 100, 100, { min: 0, max: 2048 }, 20, 20).battery).toBe(20);
    // Out on the planet, coordinates can be negative.
    const far = clampTank({ x: -9000, y: -40000, hull: 50, fuel: 10 }, 100, 100, { min: -30720, max: 32768 }, 20, 20);
    expect([far.x, far.y]).toEqual([-9000, -30700]);
  });

  it('keeps the explored map and discoveries, and loads saves without them', () => {
    const base = JSON.parse(JSON.stringify(good));
    expect(parseSave(JSON.stringify(base))?.explored).toBeUndefined();
    const withMap = { ...base, explored: ['4,-2', '5,-2'], discovered: ['biome:glass', 'lm@9,3'] };
    expect(parseSave(JSON.stringify(withMap))).toMatchObject({ explored: ['4,-2', '5,-2'], discovered: ['biome:glass', 'lm@9,3'] });
    expect(parseSave(JSON.stringify({ ...base, explored: [3] }))).toBeUndefined();
  });
});
