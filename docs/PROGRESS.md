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

- 8 upgrade lines (20 tiers) as data, one stats module applying all effects, requirements between lines.
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

## M9 — Balance and polish ✅

- Balance checked against world supply: one full sweep yields ~81 scrap, 23 crystal, 10 circuits; maxing all 20 tiers costs 261 / 73 / 29 (~3.2 sweeps), paced by the 4–5 minute regrow and return timers. Guarded by `tests/balance.test.ts` (2–5 sweeps; a first upgrade affordable from near the ship).
- "Goal complete!" notice when the goal ladder moves up a rung.
- Whole-tree build test: all 20 tiers, final goal text, final stats, no errors.

**Verified:** typecheck ✅, 101 unit tests ✅, 36 browser tests ✅ (adds: whole-tree build, clicks on the closed workshop do nothing, every asset PNG loads), locally and live.

## M10 — Smarter drones ✅ (v0.3, `docs/SPEC_v0.3.md`)

- Drones steer around rocks and the ship (touching rocks count as one wall) and commit to a side, so they no longer stall on rocks. A stalled drone sidesteps; a patrolling one picks a new waypoint; waypoints avoid rocks.
- A shot drone hunts the tank for 8 s from any range and wakes drones within 260 px. The safe zone and rescues calm them.

**Verified:** typecheck ✅, 113 unit tests ✅ (adds steering, real-map chase and return-home simulations, alerts), 38 browser tests ✅ (adds: long-range shot provokes a drone, a drone gets around a big rock).

## M11 — Burrowers ✅

- Five burrowers tunnel under the sand, leaving a fading trail of mounds; stopped, they're a single mound.
- They feel the tank (moving treads from further away), tunnel after it, shake and rumble as a warning, burst out to bite, and stay up for 1.6 s. Only then can they be shot or hurt the tank.
- They drop crystal, respawn like drones, and are saved. Placed last from their own seed, so the world layout is unchanged.
- PixelLab art: burrower, sand mound (4 generations). New synthesized sounds: rumble, burst.
- Balance: crystal per sweep 23 → 28 (maxing takes ~2.6 sweeps of crystal).
- Shared `damageTank` for drones and burrowers.

**Verified:** typecheck ✅, 124 unit tests ✅ (adds burrower placement and behaviour), 43 browser tests ✅ (adds: shells fly over a buried burrower, a surfaced one can be shot and drops crystal, it only bites after surfacing, the trail fades, destroyed burrowers survive a reload and return).

## M12 — The ship you drive into ✅ (v0.4, `docs/SPEC_v0.4.md`)

- New 320×256 PixelLab ship, about 2.5× bigger, with a cargo door that slides open as the tank approaches.
- Driving into the doorway (or pressing E by it) rolls the tank inside; the ship menu (workshop) opens. Leaving the menu (E, Esc or the Leave ship button) rolls the tank back out, facing away, with a moment of invulnerability.
- No more safe-zone ring: you're safe only inside the ship. Hostiles calm down when you go in; drones can now follow you right up to the hull.
- Compound hull collision; drones steer around it, burrowers never tunnel under it.
- The world is unchanged (locked by a fixture test). Old saves with the tank where the ship now stands load it outside the door.
- Game saves at start-up; saves made inside store the spot outside the door.

**Verified:** typecheck ✅, 136 unit tests ✅ (adds the world-layout lock, door logic, hull geometry and rock gaps, the E lane never clipping the hull, drones getting home from beside the ship), 49 browser tests ✅ (adds: door opens and shuts, driving in opens the menu and calms drones, the Leave ship button rolls the tank out facing south without firing, the hull is solid, old save relocation, saving from inside). The changed browser specs passed 3 times in a row.

### M12 follow-up (playtest feedback)

- **Driving in looked like driving under the ship.** The bay floor and a new loading ramp now draw beneath the tank. The tank parks in the open bay, the door shuts over it, then the menu opens. Leaving: the door opens, the tank backs down the ramp, turns, and drives off.
- **Menu clicks were off.** Every UI button's click area was shifted up and left by half its size (Phaser centres container hit areas). Fixed, with a corner-click test at 1× and 1.25× display scaling.

**Verified:** 136 unit tests ✅, 51 browser tests ✅.

## M13 — Hybrid drive and solar panels ✅ (v0.5, `docs/SPEC_v0.5.md`)

- The tank is electric: a 20-unit battery drives it, and a fuel generator keeps it charged (fuel range unchanged, plus one battery).
- No more fuel rescue. With the fuel and battery gone the tank is stranded; F deploys solar panels that recharge it (about 40 s for a full battery). Driving folds them once there's 10% charge.
- The battery bar is on the HUD, with warnings for charging, stranded, and running on battery; the battery is saved; the ship and rescues refill it.

**Verified:** typecheck ✅, 139 unit tests ✅ (the power model, including that fuel range is unchanged; saves with and without a battery), 55 browser tests ✅ (adds: driving on battery and getting stranded, solar charging and pause, the 10% fold rule, panels only when stopped, battery saved and refilled).

## M14 — The planet ✅ (v0.6, `docs/SPEC_v0.6.md`)

- The world grows from the 2,048 px map to a planet 63,500 px across (6.3 km on the HUD), generated from the seed and streamed in 512 px chunks round the tank (ground painted on a web worker). The original map is untouched in the middle.
- Six biomes: Dust Flats, Rust Badlands, Glass Fields, Fungal Bloom, Acid Mire and Old City. Each has its own PixelLab ground, plants, props and salvage mix; the rarer ones lie farther out.
- Impassable mesas (cliff faces, shadows), canyons and acid or ichor lakes, built so they can never wall anything in (flood-fill tested).
- Alien ruins on a street grid (with circuits), fungus trees, crystal spires, three kinds of landmark, and fuel seeps you can siphon.
- Biome and landmark discovery banners, and a planet map on Tab (explored ground, ship, tank, landmarks, biome legend).
- Saves keep the explored map and discoveries; old saves load unchanged.

**Verified:** typecheck ✅, 152 unit tests ✅ (adds biomes, home-square guarantees, features in their cells, the 26,000 px reachability flood fill, push-out, chunk determinism and ids, saves with explored data and negative positions), 61 browser tests ✅ (adds: mesas, lakes and canyons stop the tank, streaming three laps without piling up objects, a far save at negative coordinates, discovery and the map, the map fitting a squarish window, siphoning a seep).

## Title screen

- A title screen is the first thing on load or refresh: a PixelLab "Lonely Tank" logo over a PixelLab dusk backdrop (ringed planet, wreck, a tank on the dunes).
- **Continue** shows play time, distance from the ship and biome; **New game** asks before wiping a save. Keyboard or mouse.
- `?play` (or `?newgame`) goes straight into the game; the browser tests use it.

**Verified:** typecheck ✅, 155 unit tests ✅ (adds the save summary line), 63 browser tests ✅ (adds: title first, New game without a save, Continue resumes, New game asks and Cancel keeps the save).

## Sound effects

- 29 sound events, all Mirelo samples (`public/assets/sfx/`, listed event by event in `ART_REQUESTS.md`). They replace the synth blips, which remain as stand-ins until the files load.
- New sounds for events that were silent: a drone spotting you, scraping cliffs and rocks, siphoning, refuel vs repair, a pickup sound per resource, biome and landmark discoveries, map, menu clicks, and the title start.
- Loops: the tank's motor (follows speed) and the wind. They go quiet on pause, map, workshop and hidden page.

**Verified:** typecheck ✅, 156 unit tests ✅ (adds: every sound file exists), 64 browser tests ✅ (adds: every sound file loads and decodes with no 404s). Loop levels checked in a browser across title, idle, driving and pause. Not yet listened to.

## Ambiance

- **Day and night:** a 15-minute cycle on play time with dawn, golden hour, sunset and a blue night (still readable). Night brings out lights: a headlight beam, the ship's floodlights and blinking beacons, glowing crystals, seeps, drone eyes, fungus, spires and plants, and flashes from the cannon and explosions.
- **Shadows:** the tank, ship, rocks, props and landmarks cast drop shadows, faint by moonlight. Cloud shadows drift across the land with the wind.
- **Rolling ground:** every biome's open ground, the home square included, is shaded into low dunes and hollows.
- **Wind:** gusts and lulls. Each biome has its own drift: blowing sand, glass glints, glowing spores, mire vapour, ash. Dust devils wander the flats; lakes sparkle. The wind sound rises in the gusts. The title screen has blowing sand too.
- **Tread tracks** trail behind the tank and fade.
- `?time=0.9` starts the day at a chosen hour.

**Verified:** typecheck ✅, 166 unit tests ✅ (adds: the day's light stays smooth, in range and readable at night; wind range and gusts; ground relief matches across chunk edges), 68 browser tests ✅ (adds: night darkens the world but stays readable, `?time=`, tracks, shadows, drift and dust devils, shadows torn down with their chunks). Browser tests now run four at a time (software WebGL is CPU-bound; more at once only made timing tests flaky).

## Next

- Developer playtest of v0.6, the title screen and the sounds.

## Known issues

- Phaser 4.2.1 issues worked around in our code, not yet reported upstream:
  - Multi-texture batching under software WebGL dropped parts of the rotated turret → `render.maxTextures: 1`; guarded by `e2e/render.spec.ts`. Not reproduced on a real GPU.
  - `StaticBody.setCircle` stores its offset without moving the body → offset applied with `setOffset`.
  - Keyboard queue re-dispatched when several keys arrive in one frame → `keyOnce` wrapper.
- The small boulder in the two-boulder rock (`rock_3`) isn't solid.
- `circuit.png` is diamond-shaped without an outline; readable, but could be regenerated.
