// Central place for tunable game constants.

export const TILE_SIZE = 32;
export const WORLD_TILES = 64;
export const WORLD_SIZE = TILE_SIZE * WORLD_TILES; // 2048 px

export const PALETTE = {
  background: '#1a1210',
  sand: 0xb07a4f,
  sandDark: 0x8f5f3c,
  sandLight: 0xc99668,
  rust: 0x9c4a2a,
  metal: 0x6f7378,
  metalDark: 0x45484d,
  teal: 0x3fb8a8,
  violet: 0x8a5cc7,
} as const;

export const WORLD_SEED = 1337;
