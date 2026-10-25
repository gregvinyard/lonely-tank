# Game Design — Current Decisions

Living notes on what's actually implemented and decided. The original spec is in [`SPEC.md`](SPEC.md).

## World

- 64×64 tiles of 32 px → 2048×2048 px world with hard boundaries.
- One wasteland biome; ground is a single repeating 32×32 texture.
- Deterministic generation from `WORLD_SEED` (`src/data/tuning.ts`) using a mulberry32 PRNG (`src/systems/rng.ts`).

## Rendering

- WebGL renderer, `pixelArt: true` (nearest-neighbor, no antialiasing, positions rounded to whole pixels).
- **Pixel lock:** the whole game (world, particles and HUD) renders at a low virtual resolution, and the canvas is scaled up by a whole number of *device* pixels (`src/main.ts`). Everything shares one pixel grid, including rotated sprites. The scale is picked so ~400 game pixels fit vertically: 720p → 2×, 1080p → 3×, 1440p → 4×, 4K → 5×. Accounts for OS display scaling (`devicePixelRatio`).
- Cameras run at zoom 1; the HUD is laid out in game pixels.
- HUD text uses a built-in 5×7 pixel font (`src/data/pixelFont.ts`, registered as a RetroFont at boot), uppercase only.
- `render.maxTextures: 1` works around a Phaser 4.2.1 batching bug (see `src/main.ts`).
- The HUD is a separate scene (`Hud`) drawn over the Game scene.

## Tank (M1)

All numbers live in `TANK` in `src/data/tuning.ts`.

- Omnidirectional WASD driving; diagonals normalized.
- Velocity eases toward the target: accel 420 px/s² (~0.4 s to top speed), decel 520 px/s² (~0.3 s to stop). Max speed 160 px/s.
- Hull swings toward the input direction at 450°/s (it doesn't steer the movement; movement is immediate in the pressed direction).
- Turret tracks the mouse at 540°/s, independent of the hull.
- Circular collision body (r = 20). Collisions bleed off speed because acceleration starts from the body's actual velocity.
- Camera follows with lerp 0.12 (per 60 Hz frame, scaled by frame time so it feels the same on 144 Hz displays).
- Arcade physics steps once per rendered frame (`fixedStep: false`) to avoid judder on high-refresh displays.
- Dust puffs from the rear treads every ~14 px traveled.

## Obstacles (M1)

- 70 rocks scattered deterministically from the world seed, ≥80 px apart, none within 220 px of the world center (spawn).
- Circular static bodies (r = 22).

## Spaceship (M2)

- Crashed ship fixed at the world center; circular collision body (r = 46) so the tank can't drive through it.
- Safe zone: 200 px circle, shown as a faint teal ring and a "HOME BASE · SAFE ZONE" HUD tag while inside. Hostiles (M3) will be kept out of it.
- The tank spawns 110 px south of the ship.
- No workshop yet (M4).

## Resources (M2)

All numbers live in `RESOURCES` in `src/data/tuning.ts`; placement is `generateWorld()` in `src/systems/worldgen.ts`.

- 28 scrap piles (1–3 scrap each), at least 280 px from the ship.
- 12 crystal clusters (1–2 crystals each), at least 560 px from the ship, so they reward exploring. They pulse with a violet/teal halo to read from a distance.
- Each kind has its own RNG stream; nodes stay ≥48 px from rock centers and ≥64 px from each other.
- Stable ids (`scrap-00`, `crystal-07`, …) for the M4 save system.
- Not solid: drive over them. Within 44 px of the tank's center, the HUD prompts `[E] Salvage …`; E collects the nearest one.

## HUD (M2)

- Top-left: scrap and crystal counts (with a `+N` pop on pickup) and the current goal.
- Bottom-center: interaction prompt.
- Compass: when the ship is off screen, a teal arrow sits on the screen edge pointing to it, with the distance (1 m = 10 px).

## Combat (M3)

All numbers live in `HULL`, `CANNON`, `DRONES` and `RESCUE` in `src/data/tuning.ts`.

- **Cannon:** hold left mouse to fire along the turret's facing (it lags the cursor slightly). 420 ms cooldown, shells fly 420 px/s for 0.9 s (~380 px). Shells stop at rocks, the ship and drones. Muzzle flash and spark impacts.
- **Drones:** 10, placed deterministically with stable ids (`drone-00`…). Each patrols within 120 px of its home, idling between waypoints at 36 px/s.
  - Chases the tank within 200 px at 95 px/s (the tank does 160, so you can always outrun one).
  - Gives up beyond 300 px from the tank, 420 px from home, or when the tank enters the safe zone, then returns home.
  - Never enters the ship's safe zone: homes are placed so the patrol area is outside it, and positions are clamped as a backstop.
  - 3 hits to destroy. White flash and knockback on hit; sparks, dust and a small camera shake on death.
  - 60% leave 1–2 scrap (decided at world generation; the drop has id `<drone id>-drop`).
  - Hovering is shown by a bobbing ground shadow; the sprite never scales or rotates, to stay on the pixel grid.
- **Hull:** 100. Drone contact does 10 damage, then the tank is invulnerable (blinking) for 0.6 s, so a pack can't stack hits. Screen shake and a brief red flash.
- **Rescue:** at 0 hull the tank is returned to the ship, fully repaired, losing 25% of each carried resource (rounded down). Chasing drones go home. The same routine will handle running out of fuel in M4.

## Debug

- Add `?debug` to the URL to draw physics bodies.
