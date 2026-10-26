import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SFX_FILES } from '../src/audio/sfx';

describe('sound files', () => {
  it('every sample and loop the game plays is in public/assets/sfx', () => {
    expect(SFX_FILES.length).toBeGreaterThan(30);
    for (const f of SFX_FILES) {
      const path = `public/assets/sfx/${f}`;
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).size, path).toBeGreaterThan(1000);
    }
  });
});
