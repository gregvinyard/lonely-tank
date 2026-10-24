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
- Camera follows with lerp 0.12.
- Dust puffs from the rear treads every ~14 px traveled.

## Obstacles (M1)

- 70 rocks scattered deterministically from the world seed, ≥80 px apart, none within 220 px of the world center (spawn).
- Circular static bodies (r = 22).

## Debug

- Add `?debug` to the URL to draw physics bodies.
