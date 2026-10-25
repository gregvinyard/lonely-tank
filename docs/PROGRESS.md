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

## M4 — Complete Expedition Loop ✅ — v0.1 vertical slice

- Fuel: burns while moving, HUD bar with low-fuel warning, rescue when empty.
- Workshop at the ship (E): refuel (free), repair (3 scrap → +25 hull), craft reinforced plating (8 scrap + 2 crystal → +25 max hull, once). Keys 1/2/3 or click.
- Objective tracking in the HUD and a success banner when the plating is crafted.
- localStorage save (schema v1) with validation; autosave at the ship, after workshop actions and rescues, every 15 s, and on page hide. `?newgame` wipes it.

**Verified:** typecheck ✅, 77 unit tests ✅, 20 browser tests ✅ (adds: fuel burn, out-of-fuel rescue, workshop actions incl. click without firing, no driving in the workshop, reload restores collected/destroyed/drops/plating/position, corrupted save starts fresh, `?newgame`).

Developer feedback: good; slow fuel use is fine for a casual exploration game.

## M5 — Small Polish Pass ✅ (awaiting playtest)

- PixelLab art: ground tile (seeded mirrored layout) and rocks in three sizes (2 small, 3 medium, 2 large).
- Synthesized sound effects with a remembered mute (M).
- Turret recoil, red hit flash, low-hull smoke.
- Pause (Esc/P) with the full controls list; low-fuel and hull-critical warnings; shorter hint that fades.
- Fixed: rock and ship collision circles were offset from their art; rocks jiggled while the camera moved (fractional positions); same-frame key presses could be handled twice; right-click menu over the game.

**Verified:** typecheck ✅, 84 unit tests ✅, 24 browser tests ✅ (adds: pause freezes drones/fuel/tank, Esc with the workshop open, mute survives reload, art loads from files with centered rock collision).

Developer feedback: good; rocks needed size variety and jiggled while moving (fixed), tread dust invisible on the new ground (fixed).

# v0.2 — Workshop & Wasteland (`docs/SPEC_v0.2.md`)

## M6 — UI kit and graphical HUD ✅

- Code-drawn pixel UI kit: nine-slice window, plate, button (3 states) and bar frames; 9×9 icons.
- HUD rebuilt with it: framed stats panel with icon bars, framed goal/prompt/warning/compass/toast plates, framed banner with icon, framed pause screen and workshop (buttons with hover and disabled states).

**Verified:** typecheck ✅, 88 unit tests ✅, 25 browser tests ✅ (adds: every HUD widget on whole pixels).

## M7 — Upgrade tree and workshop screen ✅

- 8 upgrade lines (22 tiers) as data, one stats module applying all effects, requirements between lines.
- Workshop screen: services, card grid with tier pips, detail pane with costs, Build button; mouse and keyboard.
- Circuits (pulled in from M8): every drone drops one; costs and HUD use them.
- Goal ladder replaces the single plating objective.
- Save v2 with migration from v0.1 saves.
- PixelLab art: 8 upgrade icons, circuit pickup.

**Verified:** typecheck ✅, 97 unit tests ✅, 30 browser tests ✅ (adds: services, keyboard and mouse building, locked lines, measurable effects, field repair, reload with upgrades/circuits/drops, v0.1 save migration).

## M8 — Economy ✅

- Salvage regrows after 4 minutes of play time (not next to the tank); drones return after 5 minutes (not while the tank is near their home). Both survive reloads.
- Drone drops get unique ids per kill.
- Outer salvage (800 px+ from the ship) holds one more unit.

**Verified:** typecheck ✅, 99 unit tests ✅, 34 browser tests ✅ (adds: salvage regrowth and its clearance, drone return and fresh drop ids, timers across reload, play time paused).

## Next

- M9 — Balance and polish.

## Known issues

- Phaser 4.2.1 issues worked around in our code, not yet reported upstream:
  - Multi-texture batching under software WebGL dropped parts of the rotated turret → `render.maxTextures: 1`; guarded by `e2e/render.spec.ts`. Not reproduced on a real GPU.
  - `StaticBody.setCircle` stores its offset without moving the body → offset applied with `setOffset`.
  - Keyboard queue re-dispatched when several keys arrive in one frame → `keyOnce` wrapper.
