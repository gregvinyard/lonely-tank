import { BIOMES } from '../data/biomes';
import { WORLD_SIZE } from '../data/tuning';
import { biomeAt } from './biome';
import type { SaveData } from './save';

/** One line describing a save for the title screen, e.g. "42 min played · 1.2 km out · Rust Badlands". */
export function saveSummary(save: SaveData): string {
  const min = Math.floor(save.playTimeMs / 60000);
  const played = min < 60 ? `${min} min played` : `${Math.floor(min / 60)} h ${min % 60} min played`;
  // The HUD counts 10 px as a metre.
  const m = Math.hypot(save.tank.x - WORLD_SIZE / 2, save.tank.y - WORLD_SIZE / 2) / 10;
  const where = m < 150 ? 'at the ship' : m < 1000 ? `${Math.round(m / 10) * 10} m out` : `${(m / 1000).toFixed(1)} km out`;
  const biome = BIOMES[biomeAt(save.seed, save.tank.x, save.tank.y).biome].name;
  return `${played} · ${where} · ${biome}`;
}
