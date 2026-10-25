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

// The crashed ship sits at the world center, nose north, cargo door facing
// south. Drive in through the door to be safe and use the ship's workshop.
export const SHIP = {
  // Hostile homes keep their patrol areas outside this circle. Placement only:
  // until v0.3 it was also a visible "safe zone".
  clearRadius: 200,
  // Where v0.1-v0.3 started the tank. Still kept clear of rocks at generation,
  // so the world (and everyone's saves) stays exactly the same.
  legacySpawnOffsetY: 110,
  // Geometry relative to the ship's center; the art is 320x256 and centered.
  layout: {
    hull: [
      { x: 0, y: -62, r: 48 }, // nose
      { x: 0, y: -10, r: 50 },
      { x: 0, y: 62, r: 50 }, // cargo bay, door at the bottom
      { x: -74, y: 22, r: 30 }, // wings
      { x: -102, y: 34, r: 16 },
      { x: -62, y: -6, r: 16 }, // wing roots, where the leading edge meets the fuselage
      { x: 74, y: 22, r: 30 },
      { x: 102, y: 34, r: 16 },
      { x: 62, y: -6, r: 16 },
      { x: -64, y: 80, r: 30 }, // engine pods
      { x: 64, y: 80, r: 30 },
    ],
    door: { x: -27, y: 67, w: 55, h: 45 },
    hold: { x: 0, y: 89 }, // parked in the open bay, under where the door shuts
    exit: { x: 0, y: 172 },
    openDistance: 120,
    mouthDepth: 34,
  },
  doorMs: 450, // door fully opening or closing
  driveSpeed: 110, // px/sec rolling in or out under the ship's control
  turnRoom: 26, // px short of the exit where the tank, backed out, turns round
  exitInvulnMs: 1200, // fresh out of the door, nothing can hurt the tank yet
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
  // Homes keep the whole patrol area well clear of the ship.
  minDistance: SHIP.clearRadius + 120 + 160,
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

// Burrowers tunnel under the sand and can only bite, or be shot, when they surface.
export const BURROWERS = {
  count: 5,
  hp: 2,
  bodyRadius: 14, // when surfaced
  minDistance: SHIP.clearRadius + 300, // homes are out in the wasteland
  rockClearance: 30, // px from a rock's edge to a home
  droneClearance: 160,
  minSpacing: 320,
  roamRadius: 140,
  roamSpeed: 40,
  stalkSpeed: 80, // the tank does 160: keep moving and you get away
  senseMoving: 260, // feels moving treads this far away
  senseStill: 130, // and a stopped tank only this close
  loseRadius: 340,
  leashRadius: 520,
  strikeRange: 22, // surfaces when this close to the tank
  warnMs: 700, // the mound shakes this long before it bursts out
  upMs: 1600,
  restMs: 1400, // after diving, before it stalks again
  biteRadius: 34,
  biteDamage: 15,
  contactDamage: 8, // touching it while it is up
  extraDropChance: 0.4, // 1 crystal, sometimes 2
  trailEvery: 9, // px tunnelled between trail mounds
  trailMs: 3200, // trail mounds fade over this long
  trailPool: 30, // trail mounds per burrower
} as const;

export const RESCUE = {
  salvageLoss: 0.25, // fraction of each carried resource lost, rounded down
} as const;

export const FUEL = {
  max: 100,
  lowFraction: 0.2, // HUD warns below this
} as const;

// Hybrid drive (v0.5): the motor runs off the battery; a fuel generator keeps
// it charged (1 fuel = 1 charge), so fuel range is what it always was, plus
// one battery. With the fuel gone, solar panels slowly recharge a parked tank.
// Sized for a much bigger world later: don't tune these to today's map.
export const BATTERY = {
  max: 20, // ~20 s of full-throttle driving, ~3200 px at base speed
  drainPerSec: 1, // at full speed; scales with speed, nothing while stopped
  generatorPerSec: 2, // most the generator charges per second (outpaces the drain)
  solarPerSec: 0.5, // a flat battery fills in ~40 s of sun
  deployMs: 700, // panels sliding out or folding away
  foldAt: 0.1, // a drive key only folds the panels once the battery holds this fraction
  lowFraction: 0.25, // HUD warns below this while running on battery alone
} as const;

export const WORKSHOP = {
  repair: { scrap: 3, hull: 25 },
  plating: { scrap: 8, crystal: 2, maxHull: 25 },
} as const;

export const SAVE = {
  key: 'lonely-tank.save',
  autosaveMs: 15000,
} as const;
