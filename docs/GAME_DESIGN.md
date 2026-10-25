# Game Design — Current Decisions

Living notes on what's actually implemented and decided. The original spec is in [`SPEC.md`](SPEC.md).

## World

- 64×64 tiles of 32 px → 2048×2048 px world with hard boundaries.
- One wasteland biome; ground is a single repeating 32×32 texture.
- Deterministic generation from `WORLD_SEED` (`src/data/tuning.ts`) using a mulberry32 PRNG (`src/systems/rng.ts`).

## Rendering

- WebGL renderer, `pixelArt: true` (nearest-neighbor, no antialiasing).
- Canvas fills the browser window (`Scale.RESIZE`).
- Camera zoom is a whole number chosen from the window height (~400 world px visible vertically): 1080p → 3×, 720p → 2×. Keeps pixels crisp.
- `render.maxTextures: 1` works around a Phaser 4.2.1 batching bug (see `src/main.ts`).
- The HUD is a separate scene (`Hud`) so it isn't affected by camera zoom.

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

## Debug

- Add `?debug` to the URL to draw physics bodies.
