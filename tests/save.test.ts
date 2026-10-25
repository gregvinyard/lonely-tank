import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, clampTank, clearSave, hasSave, loadSave, parseSave, writeSave, type SaveData } from '../src/systems/save';

const good: SaveData = {
  version: SAVE_VERSION,
  seed: 1337,
  tank: { x: 500, y: 600, hull: 80, fuel: 42.5 },
  inventory: { scrap: 3, crystal: 1 },
  collected: ['scrap-00', 'drone-02-drop'],
  destroyed: ['drone-02', 'drone-05'],
  drops: [{ id: 'drone-05-drop', amount: 2, x: 900, y: 300 }],
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

  it('drops unknown fields', () => {
    const extra = { ...good, cheat: true, drops: [{ ...good.drops[0], kind: 'gold' }] };
    expect(parseSave(JSON.stringify(extra))).toEqual(good);
  });

  it.each([
    ['not JSON', '{oops'],
    ['null', 'null'],
    ['an array', '[]'],
    ['another version', JSON.stringify({ ...good, version: 99 })],
    ['no version', JSON.stringify({ ...good, version: undefined })],
    ['a fractional seed', JSON.stringify({ ...good, seed: 1.5 })],
    ['a missing tank', JSON.stringify({ ...good, tank: undefined })],
    ['a string position', JSON.stringify({ ...good, tank: { ...good.tank, x: '5' } })],
    ['a negative count', JSON.stringify({ ...good, inventory: { scrap: -1, crystal: 0 } })],
    ['a fractional count', JSON.stringify({ ...good, inventory: { scrap: 1.5, crystal: 0 } })],
    ['non-string ids', JSON.stringify({ ...good, collected: [1, 2] })],
    ['a bad drop', JSON.stringify({ ...good, drops: [{ id: 'x', amount: 0, x: 1, y: 1 }] })],
    ['a missing upgrade flag', JSON.stringify({ ...good, upgrades: {} })],
  ])('rejects %s', (_name, raw) => {
    expect(parseSave(raw)).toBeUndefined();
  });

  it('rejects infinite numbers', () => {
    // JSON can't carry Infinity, but 1e999 parses to it.
    expect(parseSave(JSON.stringify(good).replace('"x":500', '"x":1e999'))).toBeUndefined();
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
    expect(clampTank({ x: -50, y: 5000, hull: 0, fuel: 150 }, 125, 100, 2048, 20)).toEqual({ x: 20, y: 2028, hull: 1, fuel: 100 });
    expect(clampTank({ x: 500, y: 600, hull: 200, fuel: -3 }, 100, 100, 2048, 20)).toEqual({ x: 500, y: 600, hull: 100, fuel: 1 });
  });
});
