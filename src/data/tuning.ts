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
  // The whole game is drawn at a low resolution and scaled up by a whole
  // number of device pixels, picked so roughly this many game pixels fit
  // vertically (1080p -> 3x, 1440p -> 4x, 4K -> 5x).
  targetViewHeight: 400,
  maxZoom: 8,
} as const;

/** Converts the 60 Hz follow lerp into the equivalent for a frame of `deltaMs`. */
export function frameLerp(lerpAt60: number, deltaMs: number): number {
  return 1 - Math.pow(1 - lerpAt60, deltaMs / (1000 / 60));
}

/** Whole-number scale (device pixels per game pixel) for a window `height` in device pixels. */
export function zoomForViewport(height: number): number {
  return Math.min(CAMERA.maxZoom, Math.max(1, Math.round(height / CAMERA.targetViewHeight)));
}

export const OBSTACLES = {
  rockCount: 70,
  // Collision radius and share of each rock size. Sizes are assigned after
  // placement; a rock without room for its size is made smaller.
  sizes: {
    small: { radius: 12, weight: 0.3 },
    medium: { radius: 22, weight: 0.4 },
    large: { radius: 36, weight: 0.3 },
  },
  sizeGap: 10, // px kept between a rock's edge and other rocks, resources, drone homes and the spawn
  clearRadius: 220, // keep the spawn area around the world center open
  minSpacing: 80, // px between rock centers
} as const;

export const SHIP = {
  // The crashed ship sits at the world center; the tank starts just south of it.
  bodyRadius: 46, // collision circle, px
  safeRadius: 200, // hostiles stay out of this circle (M3)
  spawnOffsetY: 110,
} as const;

export const RESOURCES = {
  scrap: { count: 28, minAmount: 1, maxAmount: 3, minDistance: 280 },
  // Crystals are rarer and farther out, so they reward exploring.
  crystal: { count: 12, minAmount: 1, maxAmount: 2, minDistance: 560 },
  rockClearance: 48, // px between a resource and a rock center
  minSpacing: 64, // px between resources
  interactRange: 44, // px from the tank's center
  // Salvage far from the ship holds a little more.
  outerBonus: { distance: 800, amount: 1 },
} as const;

export const RESPAWN = {
  salvageMs: 4 * 60_000, // play time before a collected node regrows
  salvageClearance: 260, // px; never regrows right next to the tank
  droneMs: 5 * 60_000, // play time before a destroyed drone returns
  droneClearance: 320, // px from its home; well outside its detection range
  checkMs: 1000,
} as const;

export const HULL = {
  max: 100,
  hitInvulnMs: 600, // after any hit the tank can't be damaged again for this long
} as const;

export const CANNON = {
  cooldownMs: 420,
  speed: 420, // px/sec
  lifetimeMs: 900, // ~380 px range
  damage: 1,
  muzzleOffset: 30, // px from the turret pivot to the barrel tip
} as const;

export const DRONES = {
  count: 10,
  hp: 3,
  bodyRadius: 12,
  // Homes keep the whole patrol area outside the ship's safe zone.
  minDistance: SHIP.safeRadius + 120 + 160,
  rockClearance: 56,
  minSpacing: 220,
  patrolRadius: 120,
  patrolSpeed: 36,
  chaseSpeed: 95, // well under the tank's 160 so the player can escape
  detectRadius: 200,
  loseRadius: 300,
  leashRadius: 420, // give up a chase this far from home
  // Shot drones hunt the shooter for a while, from any range, and wake their neighbours.
  alertMs: 8000,
  alertLeash: 900,
  alertShare: 260, // px; drones this close to a shot one join in
  // Steering around rocks.
  lookahead: 90, // px ahead checked for rocks in the way
  obstacleMargin: 4, // px of extra clearance around rocks
  stuckAfterMs: 700, // barely moving this long counts as stuck
  detourMs: 900,
  detourDistance: 70,
  contactDamage: 10,
  knockback: 220, // px/sec pushed away from the tank on contact or hit
  scrapDropChance: 0.6,
} as const;

export const RESCUE = {
  salvageLoss: 0.25, // fraction of each carried resource lost, rounded down
} as const;

export const FUEL = {
  max: 100,
  perSecond: 1, // burned at full speed; scales with speed, nothing while stopped
  lowFraction: 0.2, // HUD warns below this
} as const;

export const WORKSHOP = {
  dockRadius: 130, // px from the ship's center; the spawn point is inside it
  repair: { scrap: 3, hull: 25 },
  plating: { scrap: 8, crystal: 2, maxHull: 25 },
} as const;

export const SAVE = {
  key: 'lonely-tank.save',
  autosaveMs: 15000,
} as const;
