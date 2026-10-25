import { describe, expect, it } from 'vitest';
import { FONT_CHARS, GLYPH_H, GLYPH_W, fontPixels, glyphRows, toFontText } from '../src/data/pixelFont';

describe('pixel font', () => {
  it('every glyph is 5x7 and only uses . and #', () => {
    for (const ch of FONT_CHARS) {
      const rows = glyphRows(ch)!;
      expect(rows, ch).toHaveLength(GLYPH_H);
      for (const r of rows) expect(r, ch).toMatch(new RegExp(`^[.#]{${GLYPH_W}}$`));
    }
  });

  it('covers letters, digits and HUD punctuation', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:!?-+/[]()%×·') expect(FONT_CHARS).toContain(ch);
  });

  it('uppercases and replaces unknown characters', () => {
    expect(toFontText('Salvage scrap ×2')).toBe('SALVAGE SCRAP ×2');
    expect(toFontText('a~b')).toBe('A?B');
  });

  it('lays glyph pixels inside the sheet', () => {
    const { width, height, pixels } = fontPixels();
    for (const [x, y] of pixels) {
      expect(x).toBeLessThan(width);
      expect(y).toBeLessThan(height);
    }
  });
});
