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
- **Sound:** synthesized effects (see `ART_REQUESTS.md`); M mutes and is remembered.
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
- Add `?newgame` to the URL to delete the save and start over (the flag is removed from the address so a reload resumes).

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

