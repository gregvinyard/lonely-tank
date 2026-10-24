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

export const TANK = {
  maxSpeed: 160, // px/sec
  accel: 420, // px/sec^2 — ~0.4s to full speed
  decel: 520, // px/sec^2 — ~0.3s to stop
  hullTurnRate: Math.PI * 2.5, // rad/sec the hull swings toward the travel direction
  turretTurnRate: Math.PI * 3, // rad/sec the turret tracks the cursor
  bodyRadius: 20, // collision circle, px
} as const;

export const CAMERA = {
  lerp: 0.12, // fraction of the gap closed per 60 Hz frame; lower = floatier follow
  // Integer zoom is picked so roughly this many world pixels fit vertically.
  targetViewHeight: 400,
  maxZoom: 4,
} as const;

/** Converts the 60 Hz follow lerp into the equivalent for a frame of `deltaMs`. */
export function frameLerp(lerpAt60: number, deltaMs: number): number {
  return 1 - Math.pow(1 - lerpAt60, deltaMs / (1000 / 60));
}

/** Whole-number zoom keeps pixel art crisp at any window size. */
export function zoomForViewport(height: number): number {
  return Math.min(CAMERA.maxZoom, Math.max(1, Math.round(height / CAMERA.targetViewHeight)));
}

export const OBSTACLES = {
  rockCount: 70,
  rockRadius: 22, // collision circle, px
  clearRadius: 220, // keep the spawn area around the world center open
  minSpacing: 80, // px between rock centers
} as const;
