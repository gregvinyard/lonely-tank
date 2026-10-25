import { describe, expect, it } from 'vitest';
import { FRAMES, ICONS, UI_COLORS, mapPixels } from '../src/data/uiKit';

describe('UI kit', () => {
  it('frames are rectangular, use known colors and leave a stretchable middle', () => {
    for (const f of FRAMES) {
      const w = f.rows[0].length;
      for (const r of f.rows) expect(r.length, f.key).toBe(w);
      expect(w - 2 * f.slice, f.key).toBeGreaterThan(0);
      expect(f.rows.length - 2 * f.slice, f.key).toBeGreaterThan(0);
      expect(() => mapPixels(f.rows)).not.toThrow();
    }
  });

  it('frame edges are uniform along their length, so stretching never shows', () => {
    for (const f of FRAMES) {
      const h = f.rows.length;
      const w = f.rows[0].length;
      // Each row's middle section is one repeated colour (top/bottom edges and the interior).
      for (const r of f.rows) expect(new Set(r.slice(f.slice, w - f.slice)).size, `${f.key} row`).toBe(1);
      // Each column's middle section is one repeated colour (left/right edges).
      for (let x = 0; x < w; x++) {
        const col = f.rows.slice(f.slice, h - f.slice).map((r) => r[x]);
        expect(new Set(col).size, `${f.key} col ${x}`).toBe(1);
      }
    }
  });

  it('icons are 9x9 with known colors', () => {
    for (const i of ICONS) {
      expect(i.rows, i.key).toHaveLength(9);
      for (const r of i.rows) expect(r.length, i.key).toBe(9);
      expect(() => mapPixels(i.rows)).not.toThrow();
    }
  });

  it('colors are valid CSS hex', () => {
    for (const c of Object.values(UI_COLORS)) expect(c).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
  });
});
