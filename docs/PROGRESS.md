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

## M2 — Wasteland Exploration ✅

- Crashed spaceship at the world center with a visible safe zone; tank spawns beside it.
- 28 scrap piles and 12 crystal clusters, deterministic with stable ids, kept off rocks and away from the ship.
- Drive up to a resource and press E to salvage it; it disappears and the inventory increases.
- HUD: scrap/crystal counts, goal text, interaction prompt, safe-zone tag, edge-of-screen compass to the ship with distance.
- PixelLab art: spaceship, scrap, crystal.

**Verified:** typecheck ✅, 33 unit tests ✅, 8 browser tests ✅ (adds: salvage with E, E with nothing nearby, compass shows/hides).

Developer feedback: good; asked for everything to share one pixel resolution.

## Pixel lock ✅

- The game renders at a low virtual resolution, scaled up by a whole number of device pixels, so world, particles and HUD share one pixel grid (also under OS display scaling).
- Built-in 5×7 pixel font for HUD text.

## M3 — Hostile Encounters ✅

- Cannon: hold left mouse, cooldown, shells hit rocks/ship/drones, muzzle flash and sparks.
- 10 sentry drones: patrol, chase within range, give up on distance/leash/safe zone, never enter the safe zone.
- Contact damage with a short invulnerability window; hull bar in the HUD.
- Drones take 3 hits; explosion feedback; 60% drop scrap you can salvage with E.
- Rescue on hull 0: back to the ship, repaired, minus 25% of salvage; banner explains what was lost.
- PixelLab art: drone.

**Verified:** typecheck ✅, 48 unit tests ✅, 13 browser tests ✅ (adds: shooting destroys a drone and leaves salvage, fire cooldown, rescue with penalty, drones stay out of the safe zone, window resize keeps the pixel grid).

Developer feedback: looks good.

## M4 — Complete Expedition Loop ✅ (awaiting playtest) — v0.1 vertical slice

- Fuel: burns while moving, HUD bar with low-fuel warning, rescue when empty.
- Workshop at the ship (E): refuel (free), repair (3 scrap → +25 hull), craft reinforced plating (8 scrap + 2 crystal → +25 max hull, once). Keys 1/2/3 or click.
- Objective tracking in the HUD and a success banner when the plating is crafted.
- localStorage save (schema v1) with validation; autosave at the ship, after workshop actions and rescues, every 15 s, and on page hide. `?newgame` wipes it.

**Verified:** typecheck ✅, 77 unit tests ✅, 20 browser tests ✅ (adds: fuel burn, out-of-fuel rescue, workshop actions incl. click without firing, no driving in the workshop, reload restores collected/destroyed/drops/plating/position, corrupted save starts fresh, `?newgame`).

## Next

- Developer playtest of M4, then M5 — small polish pass (remaining PixelLab art such as rocks and ground, tuning).

## Known issues

- Phaser 4.2.1 multi-texture batching bug under software WebGL: parts of the rotated turret went missing. Worked around with `render.maxTextures: 1`; guarded by `e2e/render.spec.ts`. Not reproduced on a real GPU (RTX 5080 / D3D11). Could be reported upstream.
- Rocks and ground are still code-drawn placeholders.
- Escape to pause (in the spec's controls table) isn't scheduled in any milestone yet; Esc currently only closes the workshop.
