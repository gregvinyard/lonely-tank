# Game Design — Current Decisions

Living notes on what's actually implemented and decided. The original spec is in [`SPEC.md`](SPEC.md).

## World

- 64×64 tiles of 32 px → 2048×2048 px world with hard boundaries.
- One wasteland biome; ground is a single repeating 32×32 texture.
- Deterministic generation from `WORLD_SEED` (`src/data/tuning.ts`) using a mulberry32 PRNG (`src/systems/rng.ts`).

## Rendering

- WebGL renderer, `pixelArt: true` (nearest-neighbor, no antialiasing).
- Canvas fills the browser window (`Scale.RESIZE`); the camera shows more world on larger screens rather than scaling up.

## Tank

_(M1 — to be filled in once movement tuning is settled.)_
