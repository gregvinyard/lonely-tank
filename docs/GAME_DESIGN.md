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

## Ambiance

- **Day and night:** a 15-minute day on play time (so it pauses with the game and carries on after a reload), starting a little after sunrise. Dawn violet, golden morning, white noon, golden hour, red sunset, blue night. Night keeps about 55% brightness so the game stays readable; `?time=` picks the starting hour.
- **Light map** (`src/world/Atmosphere.ts`): a view-sized texture filled with the sky colour and multiplied over the world, with lamps added into it. A second texture adds halos for things that glow. Both are skipped when they'd do nothing (clear noon sky, no glows).
- **Night lights:** the tank's headlight beam and glow, the ship's floodlights, bay light and blinking wingtip beacons, crystals, circuits, seeps, drone eyes, shells, muzzle flashes and explosions, and the strange plants (fungus trees, spires, the Monolith, glowing ground plants of the bloom, glass fields and mire).
- **Light falls from the upper left**, as in all the art: drop shadows (a dark copy of the sprite) fall down and to the right, for the tank, the ship, rocks, props and landmarks. They fade by moonlight.
- **Cloud shadows** drift over the ground with the wind.
- **Rolling ground:** a slow height field lit from the upper left shades all open ground into swells and hollows, in dithered steps (`src/systems/relief.ts`). The home square gets it too (painted when the worker is idle).
- **Wind:** a slowly swinging direction with lulls and gusts (`src/systems/sky.ts`). It carries each biome's drift (sand and grit, glass glints, glowing bloom spores, mire vapour, city ash), moves the clouds, and sets the wind sound's volume.
- **Dust devils** wander over the flats and badlands by day; **glints** sparkle on lakes.
- **Tread tracks** fade behind the tank over 14 seconds.
- Purely visual: nothing in play changes at night.

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

- *v0.4 replaced the ship; see "The ship (v0.4)" below. Until then:* a 128 px ship with one collision circle (r = 46), a 200 px "safe zone" ring around it, and the spawn 110 px south of it.
- No workshop yet (M4).

## Resources (M2)

All numbers live in `RESOURCES` in `src/data/tuning.ts`; placement is `generateWorld()` in `src/systems/worldgen.ts`.

- 28 scrap piles (1–3 scrap each), at least 280 px from the ship.
- 12 crystal clusters (1–2 crystals each), at least 560 px from the ship, so they reward exploring. They pulse with a violet/teal halo to read from a distance.
- Each kind has its own RNG stream; nodes stay ≥48 px from rock centers and ≥64 px from each other.
- Stable ids (`scrap-00`, `crystal-07`, …) for the M4 save system.
- Not solid: drive over them. Within 44 px of the tank's center, the HUD prompts `[E] Salvage …`; E collects the nearest one.

## HUD (M2)

- Top-left: hull and fuel bars, scrap and crystal counts (with a `+N` pop on pickup) and the current goal.
- Bottom-center: interaction prompt.
- Compass: when the ship is off screen, a teal arrow sits on the screen edge pointing to it, with the distance (1 m = 10 px).

## Combat (M3)

All numbers live in `HULL`, `CANNON`, `DRONES` and `RESCUE` in `src/data/tuning.ts`.

- **Cannon:** hold left mouse to fire along the turret's facing (it lags the cursor slightly). 420 ms cooldown, shells fly 420 px/s for 0.9 s (~380 px). Shells stop at rocks, the ship and drones. Muzzle flash and spark impacts.
- **Drones:** 10, placed deterministically with stable ids (`drone-00`…). Each patrols within 120 px of its home, idling between waypoints at 36 px/s.
  - Chases the tank within 200 px at 95 px/s (the tank does 160, so you can always outrun one).
  - Gives up beyond 300 px from the tank, 420 px from home, or when the tank goes into the ship, then returns home.
  - **Shot drones** hunt the tank for 8 s from any range (leash 900 px), and drones within 260 px of them join in. Each hit refreshes it. Going into the ship still calms them.
  - **Steering** (v0.3): drones bend around rocks and the ship, treating touching rocks as one wall, and stick to one side until they're past. A drone that barely moves for 0.7 s while trying sidesteps 70 px for 0.9 s; a patrolling one picks a new waypoint. Patrol waypoints are never inside rocks. Pure logic in `src/systems/steer.ts`, simulated on the real map in `tests/steer.test.ts`.
  - Homes are placed so the patrol area stays 200 px or more from the ship's center. Since v0.4 there's no invisible line: a chasing drone can follow the tank right up to the hull (which it collides with and steers around).
  - 3 hits to destroy. White flash and knockback on hit; sparks, dust and a small camera shake on death.
  - 60% leave 1–2 scrap (decided at world generation; the drop has id `<drone id>-drop`).
  - Hovering is shown by a bobbing ground shadow; the sprite never scales or rotates, to stay on the pixel grid.
- **Hull:** 100. Drone contact does 10 damage, then the tank is invulnerable (blinking) for 0.6 s, so a pack can't stack hits. Screen shake and a brief red flash.
- **Rescue:** at 0 hull the tank is returned to the ship, fully repaired and refueled, losing 25% of each carried resource (rounded down). Chasing drones go home. (Until v0.5, running out of fuel also triggered a rescue; see "Hybrid drive".)

## Expedition loop (M4)

Numbers live in `FUEL`, `WORKSHOP` and `SAVE` in `src/data/tuning.ts`.

- **Fuel:** 100. Burns 1 unit per second at full speed, scaled by speed, nothing while stopped. That's about 100 s of full-throttle driving; the map edge is ~6 s from the ship. The HUD bar turns red and blinks below 20%. *(v0.5: fuel now feeds a generator that charges the drive battery; see "Hybrid drive".)*
- **Workshop:** *(v0.4: it's the menu inside the ship; see below.)* Originally: within 130 px of the ship's center, press E. The tank stops while it's open; keys 1/2/3 or clicking a row run an action, E or Esc closes it. Unavailable actions are dimmed and pressing them says why.
  - Refuel: free.
  - Repair: 3 scrap for +25 hull, capped at max.
  - Craft reinforced plating: 8 scrap + 2 crystal, +25 max hull (also adds 25 to current hull). Once only. Shows a success banner; exploration continues.
- **Hull bar** length grows with max hull (48 px → 60 px with plating) so the upgrade reads as more, not as damage.
- **Objective:** the goal strip tracks progress (`scrap 3/8 crystal 0/2`), then says to return to the ship, then that the plating is installed.
- **Save:** localStorage key `lonely-tank.save`, schema version 1. Stores the world seed, tank position/hull/fuel, inventory, collected resource ids, destroyed drone ids, uncollected drone drops (with positions) and the plating flag. Max hull is derived from the plating flag, never stored.
  - Saved on reaching the ship, on opening the workshop, after every successful workshop action, after a rescue, every 15 s, and when the page is hidden or closed.
  - Missing, corrupted or other-version saves are ignored (with a console warning) and a new game starts; storage errors never stop the game. Loaded values are clamped (position inside the world, hull 1..max, fuel 1..max).
  - Drones always restart at home on load.

## Polish (M5)

- **Art:** PixelLab ground and seven rock images in three sizes. Rocks are mirrored but never rotated, because their lighting is baked in.
- **Rock sizes:** small (collision radius 12), medium (22), large (36), weighted 30/40/30. Sizes are assigned after placement (seed + 4) and a rock without room for its size (10 px clear of other rocks, resources, drone homes and the spawn) is made smaller, so positions and resource ids are unchanged and saves stay valid.
- **Whole-pixel positions:** rocks, resources and drone homes are rounded to whole pixels at generation. Fractional positions rounded to the screen grid at different moments than the ground as the camera moved, so rocks visibly jiggled.
- **Feedback:** turret recoil (3 px, whole pixels), a red flash on the tank when hit, dark smoke while hull is at or below 30%.
- **Sound:** Mirelo-generated samples for every event, a motor loop that follows speed and a wind loop (see `ART_REQUESTS.md`); synthesized blips stand in until they load. M mutes and is remembered.
- **Pause:** Esc or P pauses the game (drones, fuel, autosave timer all stop) and shows the full controls list. With the workshop open, Esc only closes it.
- **Warnings:** outside the ship, "Low fuel · return to ship" or "Hull critical · repair at ship" appears at the top of the screen.
- **Hint bar:** shortened; fades after 45 s (the pause screen keeps the full list).
- **Fixes:** static collision circles (rocks, ship) were 10–18 px up-left of their art (Phaser's `StaticBody.setCircle` ignores its offset; `setOffset` applies it). Keys pressed in the same frame could be handled twice (Phaser re-dispatches its per-frame key queue on every DOM key event); handlers are wrapped with `keyOnce`. Right-click menu disabled over the game; crosshair cursor.

## UI kit (v0.2 M6)

- Frames and HUD icons are pixel maps in `src/data/uiKit.ts`, drawn into textures at boot (like the font). Frames are nine-slice: fixed corners, edges that are one colour along their length so stretching never shows (unit-tested).
- Frames: `ui_panel` (bevelled metal window with rivets and a teal trim), `ui_plate` (label plate), `ui_button` / `_hover` / `_disabled`, `ui_bar` (recessed bar track). Icons (9×9): hull, fuel, circuit, warning, upgrade.
- Widgets in `src/ui/widgets.ts`: `Plate` (self-sizing text plate with optional icon), `Bar` (icon + track + fill; length grows with the maximum), `Button` (hover/focus/disabled states, mouse). All laid out from the top-left on whole pixels; a browser test walks the HUD and fails on any fractional position.
- The compass stays above the prompt and hint plates; banners sit under the goal plate, or under the workshop while it's open.

## Upgrades (v0.2 M7)

- Data in `src/data/upgrades.ts` (8 lines, 20 tiers); every effect is applied in `src/systems/stats.ts` (`computeStats`), which the tank, cannon, fuel, HUD and workshop all read.
- Effects per tier: plating +25 max hull; fuel tanks +40 max fuel; engine +12% top speed and acceleration; autoloader −15% reload; long barrel +30% shell range; AP shells +1 damage (needs Autoloader 1); scanner T1 marks the nearest salvage (overhead chevron, or an edge arrow coloured by type), T2 adds type and distance; field repair kit 0.5 / 1.5 hull per second while stopped and not hit for 5 s (needs Plating 1).
- New hull/fuel capacity arrives filled. Costs rise per tier; later tiers need circuits.
- **Circuits:** every destroyed drone drops one (id `<drone>-chip`) beside its chance of scrap. Rescue loses 25% of circuits too.
- **Goal ladder:** first upgrade → tier 2 in any line → 6 tiers → 3 lines maxed → everything (20) → "Fully upgraded · explore freely".
- **Workshop screen:** services (refuel, repair), a 4×2 grid of cards (icon + tier pips: teal built, amber next when affordable, faded icon when locked), a detail pane (tier, next effect, cost with red numbers when short, requirement) and a Build button.
- **Save v2:** upgrade levels, circuits, play time, collected/destroyed entries with the play time they happened, drops with their kind. v1 saves are migrated (plating flag → Plating 1; everything collected/destroyed at time 0).

## Economy (v0.2 M8)

- Numbers in `RESPAWN` and `RESOURCES.outerBonus` (`src/data/tuning.ts`).
- **Salvage regrows** at the same spot 4 minutes of play time after it was collected, checked once a second, but never within 260 px of the tank. It fades in.
- **Drones return** to their home 5 minutes of play time after being destroyed, but not while the tank is within 320 px of that home. They fade in and patrol as before.
- **Drops** from destroyed drones are one-offs: their ids include the kill time (`drone-03@123456-chip`), they're saved with their position until picked up, and they don't regrow.
- **Outer bonus:** scrap and crystal nodes 800 px or more from the ship hold one extra unit.
- **Play time** only advances while the Game scene runs (not paused) and counts at most 250 ms per frame, so a tab returning from the background doesn't fast-forward respawns.

## Debug

- Add `?debug` to the URL to draw physics bodies.
- The game opens on a title screen: the PixelLab logo over a backdrop, **Continue** (with a line about the save: play time, distance from the ship, biome) and **New game**, which asks before wiping an existing save (Cancel is the default). Keys W/S or arrows, Enter; or the mouse.
- `?play` skips the title. Add `?newgame` to the URL to delete the save and start over without asking (the flag is removed from the address so a reload resumes).

## Burrowers (v0.3)

All numbers live in `BURROWERS` in `src/data/tuning.ts`; logic in `src/systems/burrower.ts` (pure, unit tested), visuals in `src/entities/Burrower.ts`.

- **Placement:** 5 (`burrower-00`…), 500 px or more from the ship, clear of rocks, drone homes and salvage. They're placed last from seed + 5, so the v0.2 world layout and existing saves are unchanged.
- **Underground:** shown only as a sand mound. While tunnelling it leaves small mounds every 9 px that fade over 3.2 s (pooled, whole-pixel positions, not drawn over rocks). It passes under rocks and has no physics body. Shells fly over it and it can't hurt the tank.
- **Senses:** feels a moving tank within 260 px, a stopped one within 130 px. It ignores a tank in the ship, and gives up beyond 340 px from the tank or 520 px from home.
- **Attack:**
  1. It tunnels toward the tank at 80 px/s (the tank does 160, so keep moving and you get away).
  2. Within 22 px, on open ground (never under a rock or by the ship), the mound shakes and sprays sand for 0.7 s, with a low rumble.
  3. It bursts out: a tank within 34 px takes 15 damage.
  4. It stays up for 1.6 s. Shells hit it then, and touching it does 8 damage.
  5. It dives and rests for 1.4 s before it can stalk again.
- **Hits and damage:** 2 HP. Hits and contact are checked by distance in `GameScene.updateBurrowers`. All tank damage goes through `damageTank`, so invulnerability, the field-repair calm timer and rescue apply.
- **Loot:** 1 crystal, 40% chance of 2 (`<id>@<kill time>-crystal`). It returns home after the same 5 minutes as drones and is saved in the same `destroyed` list. A rescue sends burrowers home underground.

## The ship (v0.4)

Geometry and timings in `SHIP` (`src/data/tuning.ts`). Pure door and footprint logic in `src/systems/ship.ts`, unit tested in `tests/ship.test.ts`.

- **Size and solidity:** a 320×256 wreck at the world center, nose north, about 2.5× the old one. Its hull is eleven invisible collision circles (nose, fuselage, cargo bay, wings, wing roots, engine pods), checked against the art with `?debug`. Tanks, drones and shells all hit it, and drones steer around it.
- **Cargo door:** at the bottom center, facing the spawn. It slides up into the hull when the tank's center comes within 120 px of the doorway, and shuts again when the tank leaves. The shutter is a separate sprite cropped in whole-pixel steps, drawn above the tank. The opening is cut out of the ship image and filled by a separate `ship_bay` sprite drawn *below* the tank: the bay floor, the door sill and a loading ramp outside it.
- **Going in:**
  - Drive into the open doorway. The hull stops the tank just below it, and that counts; it may be up to 12 px off either side of the door.
  - Or press E in front of the door: within 40 px either side of its middle and 120 px below it. A unit test checks that the run in from anywhere in that lane never cuts through the hull.
  - The ship takes over: physics off, it rolls the tank up the ramp at 110 px/s, turning smoothly, and parks it in the open bay. The tank is drawn on the bay floor the whole way, so it never looks like it drives under the ship.
  - The door then shuts over the parked tank and the ship menu (the workshop) opens. The game saves on the way in.
- **Safety:** you're safe only inside. While entering, inside or leaving:
  - the tank can't be damaged, burns no fuel and can't fire
  - drones and burrowers lose interest
  - there's no visible "safe zone" any more
- **Leaving:**
  - E, Esc, or the **Leave ship** button closes the menu. The door opens, the tank backs down the ramp, turns round clear of the ship, and drives to the spawn point 60 px below the door, facing south.
  - You then get control back with 1.2 s of invulnerability (the tank blinks), and fire is held until the mouse is released.
  - The door shuts once you drive away.
- **Rescue:** puts the tank at the spawn point outside the door, door open.
- **Saves:**
  - A save made while the tank is in the ship stores the spot outside the door.
  - The game also saves once at start-up.
  - Older saves that parked the tank where the bigger ship now stands are moved to the spawn point on load.
- **World unchanged:** rocks, salvage, drones and burrowers are exactly where they were. The old spawn point is still used as a keep-out when rock sizes are assigned, and `tests/worldlock.test.ts` compares the whole world to a v0.3 fixture.
- **Hostile reach:**
  - No drone patrols within detection range of the door; the closest has 235 px to spare.
  - Burrower-01's roaming range plus its tread sense overlaps the door area by about 64 px, so it can come for a tank sitting by the door.
  - Burrowers never surface within 70 px of the doorway or under the ship.
- **Wreck dressing:** scorch marks under the ship and a wisp of smoke from the right engine.
- **UI buttons (fix):** Phaser hit-tests a container as if its contents were centred on it, but the kit's buttons draw from their top-left. Every button's click area was therefore shifted up and left by half its size, which you notice most with display scaling. The hit rectangle is now offset by half a size, and a browser test clicks near all four corners of a card at 1× and 1.25× display scaling.

## Hybrid drive (v0.5)

Numbers in `BATTERY` (`src/data/tuning.ts`). Pure logic in `src/systems/power.ts`, unit tested in `tests/fuel.test.ts`.

- **How it works:**
  - The motor runs off a 20-unit battery, which drains 1 unit per second at full speed (scaled by speed, nothing at rest).
  - A fuel generator tops the battery up at up to 2 units per second, burning fuel 1:1. So while there's fuel the battery stays full, and fuel lasts exactly as long as it always did.
  - Parked with a full battery burns nothing.
- **Running dry:**
  - Once the fuel is gone, the battery is all that's left: about 20 s of full-throttle driving, roughly 3,200 px at base speed.
  - At 0 the tank stops where it is. There's no rescue any more; it's **stranded**.
- **Solar panels:**
  - F, only while stopped and outside the ship, slides two PixelLab panels out from under the tank, one each side (0.7 s).
  - Once fully out they charge 0.5 units per second, so a flat battery fills in about 40 s. The turret still turns and fires.
  - Driving folds them away again, but only once the battery holds 10%. Below that they stay out and the HUD says "drive at 10%", so the tank can't trap itself folding and unfolding. F folds them at any time.
  - The charge time is play time: it stops while paused.
- **Refills:** in the ship the battery charges off the ship (full while inside). A rescue (after being destroyed) refills fuel and battery.
- **HUD:**
  - A third bar (teal, battery icon). It turns red below 25% and blinks while running on the battery alone.
  - Warnings, most important first:
    1. "Solar charging · N%" (in teal)
    2. "Battery flat · [F] deploy solar panels"
    3. "Fuel empty · battery N%"
    4. "Low fuel"
    5. "Hull critical"
  - F is in the pause screen's controls list.
- **Saves:** the battery is stored with the tank (an optional field, so v0.4 saves load with it full). Fuel and battery may load at 0, so a tank saved stranded loads stranded.
- **Not tuned to today's map:** fuel and battery are sized for a much bigger world later. On today's map one battery reaches the ship from anywhere.
- **Pressing E by the door while stranded** still takes the tank in: the ship pulls it in.

## Signal (v0.7)

Numbers in `BIOMES` (rare rates), `UPGRADES`, `UPGRADE_EFFECTS` and `src/data/story.ts` (the logs). Pure logic in `src/systems/story.ts` (cache sites, logs heard), unit tested in `tests/story.test.ts`.

- **Rare materials:**
  - Prism (glass, 0.25 per chunk), spore (bloom, 0.3), salt (mire, 0.3) and relic (ruins, 0.22).
  - Each holds 1, or 2 (35%), plus 1 per 14,000 px from the ship.
  - They come from their own random stream per chunk (salt 37), so v0.6 chunk contents are unchanged.
  - They glow in their colour.
  - The first of each kind is announced and saved as `material:kind`.
- **Rare tiers:**
  - Every line's top tier needs a rare material; everything below it costs only home salvage.
  - New tiers: plating 4 (spores), fuel 4 (salt), engine 4 (relic), autoloader 4 (salt + relic), barrel 3 (prism), AP 3 (salt), scanner 3 (prism: rare materials first), repair 3 (3 hull/s, spores).
  - **Power cells:** +10 battery (salt), ×1.6 solar (prism), then +10 battery and ×2.2 solar (salt + relic).
- **Crew caches:**
  - One per log, in a biome region of the log's biome.
  - Candidate regions are scored by distance from the ship + 0.35 × distance from the previous cache. The lowest wins, and the cache goes on open ground nearest its centre.
  - Caches keep at least 3,000 px from the ship and 1,500 px from the planet's edge, stay off chunk borders, and have 90 px of clear ground.
  - The chunk keeps props 48 px away from it.
  - Seed 1337 puts them 354, 973, 672, 599, 1155 and 948 m from the ship.
- **Signal:**
  - Only the next unheard cache and the heard ones are out.
  - The next one blinks a red beacon. The HUD shows its arrow and distance while it's off screen, and the map marks it (pinned to the edge when it's off the map).
- **Logs:**
  - E within 48 px plays a log (heard ones replay).
  - The panel types at 90 characters per second and the game is paused.
  - E, Space, Enter, Esc or a click first finishes the text, then closes it.
  - Heard logs are saved as `log:n`.
- **The array:**
  - A workshop line, locked until all six logs are heard.
  - Stage 3 flashes the screen, plays `transmit` and then the ending text (saved as `ending`).
  - Afterwards the ship pulses with light and sends out signal rings.

## The planet (v0.6)

Numbers in `PLANET` (`src/data/tuning.ts`) and `BIOMES` (`src/data/biomes.ts`). Distances are in world px; the HUD shows px / 10 as metres. Pure logic, all unit tested in `tests/planet.test.ts`:

- `src/systems/noise.ts`: hashing and value noise.
- `src/systems/biome.ts`: the biome map.
- `src/systems/terrain.ts`: mesas, canyons, lakes, and collision.
- `src/systems/chunks.ts`: what sits on each chunk.
- `src/systems/paintGround.ts`: the ground painter.

The Phaser side is `src/world/Planet.ts` (streaming) with `src/world/groundWorker.ts`.

- **Layout:**
  - The original map is the home square at 0..2048, untouched; `tests/worldlock.test.ts` still guards it.
  - The planet runs from −30,720 to 32,768 px on both axes: 63,500 px (6.3 km on the HUD) across, or ~200 s of straight driving edge to edge.
  - A full tank (about 120 s, ~19,000 px of driving) gets you roughly 9,000 px out and back.
- **Streaming:**
  - 512 px chunks within 2 of the tank's chunk are built (ground image, props with their collision, decor). The scene adds their salvage, seeps, drones and burrowers.
  - Chunks past 3 away are torn down; nothing is lost, since all of it is regenerated from the seed.
  - Ground is painted on a web worker (about 10–30 ms a chunk). After a teleport the 3×3 round the tank is painted at once.
- **Biomes:**
  - The nearest of a jittered grid of sites, 4,200 px apart, after warping the point by up to 1,100 px of noise.
  - Sites within 5,000 px of the ship are dust flats. The distance limits below are for sites, so a region's edge can come up to a few thousand px closer.
  - Odds and minimum distances:

    | Biome | Odds | Min. distance |
    |---|---|---|
    | flats | 3 | — |
    | badlands | 2.4 | — |
    | glass | 2 | 6,000 px |
    | bloom | 2 | 5,000 px |
    | mire | 1.6 | 7,000 px |
    | ruins | 0.5 | 9,000 px |

  - Borders blend over 36 px with a 2 px dither.
- **Ground:**
  - Each biome has a seamless 128 px PixelLab tile.
  - The painter mixes two offset copies of it along wandering noise lines and adds a slow light/dark drift, so neither the repeat nor the tile seams show.
  - Dust flats use the same flipped sand pattern as the home square, so the border is invisible.
- **Impassable terrain:**
  - One feature group per 2048 px cell, chosen by the biome at the cell's centre.
  - The group is kept 140 px inside the cell and 700 px clear of the home square.
  - **Mesas:** a blob base outline whose top is drawn 34 px higher. Between them is the cliff face, darkening toward its foot, with a shadow down and to the right. The base and top are both solid, and mesas stop shells.
  - **Canyons:**
    - A band 50–100 px wide along a sine-wiggled line up to 1,700 px long.
    - The north wall shows 14 px of lit rock, then dark depths.
    - The ends taper.
  - **Lakes:**
    - Acid (green) or ichor (violet), as a blob plus up to 4 ponds.
    - Each has a foam line and bright shallows, then calmer, darker deep water.
    - The shore is wet.
  - **Why nothing gets walled in:**
    - Blobs are star-shaped (the wobble amplitudes add up to under 0.32), so they have no holes or pockets.
    - Canyon centre lines are graphs over their axis, so they never loop.
    - Features never touch: each is kept inside its own cell, and ponds and buttes keep a tank-wide gap.
    - Props in a chunk keep a 50 px gap and stay 25 px inside their chunk.
    - A 26,000 px-square flood-fill test checks every open spot is reachable from the ship.
  - **Collision:**
    - The tank is pushed out of any impassable ground along the blocked side of its rim, and loses the speed it had into it, so it slides along shores and walls.
    - Drones fly over all of it. Burrowers won't tunnel into it. Shells fly over canyons and lakes.
- **Per chunk (512 px), the expected counts:**

  | Biome | Rocks | Props | Plants | Scrap | Crystal | Circuit | Seeps | Drones | Burrowers |
  |---|---|---|---|---|---|---|---|---|---|
  | flats | 2.2 | — | 0.6 | 0.55 | 0.12 | — | — | 0.12 | 0.1 |
  | badlands | 3 | — | 1.5 | 1.1 | 0.15 | — | — | 0.22 | 0.05 |
  | glass | 0.6 | 2.6 spires | 1 | 0.15 | 1.1 | — | — | 0.25 | — |
  | bloom | 0.6 | 3 fungus | 10 | 0.35 | 0.5 | — | — | 0.08 | 0.32 |
  | mire | 1.2 | 0.4 | 6 | 0.45 | 0.1 | — | 0.45 | 0.08 | 0.2 |
  | ruins | 0.3 | 5 walls (street grid) | 3 | 0.8 | 0.1 | 0.7 | — | 0.45 | — |

  - Hostile counts are multiplied by 1 + distance / 20,000 px.
  - Nothing hostile, and no salvage, within 2,600 px of the ship.
  - Salvage gets +1 for every 7,000 px out (max +3).
  - Seeps hold 35 fuel, +10 per 7,000 px.
  - About 1 chunk in 70–100 has a landmark: Leviathan bones (driven over), The Monolith, or the Fallen saucer (solid).
- **Ids** carry their chunk: `scrap@12,-3#1`, `seep@…`, `drone@…`, `burrower@…`, `lm@…`. Collected and destroyed events work as before. A respawn whose chunk isn't loaded is simply dropped, since the chunk puts it out next time it loads.
- **Discovery:**
  - Crossing into a biome shows its name and a line about it ("New biome: …" the first time).
  - Coming within 260 px of a landmark announces it.
  - Both are saved in `discovered`.
- **Map (Tab):**
  - 400×250 px at 96 world px per pixel, centred on the tank.
  - Explored chunks (the tank's chunk and its neighbours) are shown in biome colours, with lakes, canyons and mesas. The rest is fog.
  - Marks the ship, the tank and landmarks found, with a legend of the biomes found.
  - The game waits while it's open. Esc closes it too.
- **Saves:** `explored` and `discovered` are optional string lists, so v0.5 saves still load. The tank's position is clamped to the planet's bounds, and a tank saved somewhere impassable is moved to open ground.

