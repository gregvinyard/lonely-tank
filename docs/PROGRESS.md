# Progress

**Live:** https://lonely-tank.mauszozo.workers.dev (Cloudflare Workers static assets, auto-deploys from `main`)

## M0 — Project Foundation ✅

- Vite 8 + TypeScript 7 + Phaser 4.2.1 project.
- Full-window WebGL canvas with pixel-art rendering.
- Asset manifest with code-generated placeholder textures (`src/data/assets.ts`).
- Deployed via Cloudflare Workers Builds (Cloudflare now creates Git-connected static sites as Workers rather than Pages); config in `wrangler.jsonc`.

## M1 — The Tank Drives ✅

- Tank entity: physics hull + independently rotating turret.
- WASD movement with acceleration/deceleration, hull turns toward travel.
- Mouse turret aiming (recomputed every frame so it stays correct while the camera moves).
- Camera follow with integer zoom by window size.
- World bounds; 70 deterministic rock obstacles with a clear spawn area.
- Tread dust particles.
- First PixelLab art: tank hull and turret.

**Verified:** typecheck ✅, 19 unit tests ✅, 5 browser tests ✅ (boot, driving, aiming, rock collision, turret render integrity).

Developer feedback: movement feels good; the turret sat off-center on its pivot (developer edited the image; committed with M2).

## M2 — Wasteland Exploration ✅ (awaiting playtest)

- Crashed spaceship at the world center with a visible safe zone; tank spawns beside it.
- 28 scrap piles and 12 crystal clusters, deterministic with stable ids, kept off rocks and away from the ship.
- Drive up to a resource and press E to salvage it; it disappears and the inventory increases.
- HUD: scrap/crystal counts, goal text, interaction prompt, safe-zone tag, edge-of-screen compass to the ship with distance.
- PixelLab art: spaceship, scrap, crystal.

**Verified:** typecheck ✅, 33 unit tests ✅, 8 browser tests ✅ (adds: salvage with E, E with nothing nearby, compass shows/hides).

## Next

- Developer playtest of M2, then M3 — Hostile Encounters (cannon, drone enemy, rescue).

## Known issues

- Phaser 4.2.1 multi-texture batching bug under software WebGL: parts of the rotated turret went missing. Worked around with `render.maxTextures: 1`; guarded by `e2e/render.spec.ts`. Not reproduced on a real GPU (RTX 5080 / D3D11). Could be reported upstream.
- Rocks and ground are still code-drawn placeholders.
- Inventory resets on reload until the save system (M4).
