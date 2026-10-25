# Lonely Tank — v0.2 Specification: "Workshop & Wasteland"

v0.1 delivered the vertical slice: drive, salvage, fight, return, craft one upgrade, save. v0.2 turns the workshop into the heart of the game with a real upgrade tree, gives the interface a proper graphical look, and makes the wasteland's economy last long enough to support it.

Everything in `SPEC.md` still applies (stack, hosting, pixel lock, art workflow, testing and reporting rules) unless this document changes it.

---

## 1. Goals

1. **A reason to keep playing.** Roughly 30–60 minutes of upgrade goals instead of one.
2. **A graphical interface.** Framed panels, icons, bars and upgrade cards drawn as pixel art on the same grid as the world, replacing the plain dark strips.
3. **An economy that keeps up.** Salvage and drones come back over time, and the outer wasteland pays better than the area around the ship.
4. **No regression.** v0.1 saves load (migrated), every v0.1 feature still works, and the game stays casual: no permadeath, no timers that punish.

## 2. Out of scope for v0.2

- New biomes, procedural map regions or a larger world.
- Multiple save slots, cloud saves, accounts.
- Mobile/touch controls.
- Story, dialogue, NPCs.
- Music (sound effects only, as in v0.1).

---

## 3. Features

### 3.1 Graphical UI

All UI stays on the pixel grid (game pixels, whole-number positions, the existing pixel font).

- **UI kit:** a nine-slice panel frame (sci-fi metal plate with rivets and a teal trim), a button frame (normal / hover / disabled), a progress-bar frame, and a small icon set. Generated with PixelLab where it works, drawn in code otherwise. Listed in the asset manifest like all art, with placeholders.
- **HUD:** framed status panel with icons next to the hull and fuel bars; resource counters with item icons; framed goal, prompt and warning plates. Same information as v0.1.
- **Workshop screen:** replaces the text list.
  - Header with the ship name and current resources.
  - **Services** row: Refuel and Repair as buttons with costs.
  - **Upgrades** grid: one card per upgrade line, with its icon, name, current tier as pips (e.g. ●●○), the next tier's effect and cost (cost icons turn red when you can't afford them), and a Build button. Maxed lines show "MAX".
  - Mouse (hover highlight, click a card to select it, click Build) and keyboard (arrows/WASD to move the selection, Space/Enter to build, 1/2 for refuel/repair, E or Esc to close). *(Changed during M7: E closes, as it opens, so it can't build by accident.)*
- **Pause screen** uses the same frame.
- **Toast/banners** use the frame with an icon (e.g. the upgrade's icon when one is built).

### 3.2 Upgrade tree

Upgrades are data-driven (`src/data/upgrades.ts`): id, name, icon, tiers (cost + effect), and an optional requirement on another upgrade's tier. Effects modify tank **stats** computed in one place (`src/systems/stats.ts`), never scattered through gameplay code.

| Line | Tiers | Effect per tier | Notes |
|---|---|---|---|
| Reinforced Plating | 3 | +25 max hull | Tier 1 is v0.1's plating |
| Fuel Tanks | 3 | +40 max fuel | |
| Engine Tuning | 3 | +12% top speed and acceleration | |
| Autoloader | 3 | −15% cannon cooldown | |
| Long Barrel | 2 | +30% shell range | |
| AP Shells | 2 | +1 shell damage | Needs Autoloader 1 |
| Salvage Scanner | 2 | T1: compass marks the nearest salvage; T2: also shows its type and distance | |
| Field Repair Kit | 2 | Regenerate hull slowly while stopped outside combat (T1 0.5/s, T2 1.5/s) | Needs Plating 1 |

- Costs rise per tier and use three resources (below). Tier 1 costs are reachable on a first expedition; final tiers need several trips and circuits.
- The v0.1 objective ("craft plating") is replaced by a short **goal ladder** shown in the HUD: build your first upgrade → reach tier 2 in any line → build 6 tiers total → max out three lines → max everything. Completing the last shows a "Fully upgraded" banner; play continues.

### 3.3 Economy

- **Circuits:** a third resource. Destroyed drones always drop 1 circuit (in addition to v0.1's chance of scrap). Shown in the HUD and the workshop.
- **Respawning salvage:** collected scrap and crystal nodes regrow at the same spot after a delay (default 4 minutes of play time), but only while the tank is not nearby, so they don't appear under it.
- **Respawning drones:** destroyed drones return to their home after a delay (default 5 minutes of play time), while the tank is outside their detection range.
- **Outer richness:** resource amounts scale with distance from the ship (about +1 at the map edge), so exploring pays.
- Play time only advances while the game is running (not paused, not with the tab hidden).

### 3.4 Save system

- Schema version 2: upgrade levels instead of the plating flag; circuits; play time; collected and destroyed entries record when they happened so respawns survive reloads.
- **Migration:** a valid v1 save is converted (plating flag → Plating tier 1; everything collected/destroyed counts as having happened at time 0). Invalid saves still start a fresh game without crashing.

---

## 4. Milestones

Each milestone ends as in v0.1: type check, unit and browser tests, commit, deploy, verify the live build, report.

### M6 — UI kit and graphical HUD
- UI art (panel, button, bar frames, icons) in the manifest.
- Reusable UI helpers (framed panel, icon bar, button with states) on the pixel grid.
- HUD, prompts, warnings, banners and pause screen rebuilt with the kit. Same behavior as v0.1.

**Acceptance:** the HUD shows everything it did in v0.1 with framed, iconed visuals at 800×600 and 1080p; all v0.1 tests still pass.

### M7 — Upgrade tree and workshop screen
- Upgrade data, stats system and effects for all eight lines.
- Save schema v2 with v1 migration.
- New workshop screen (services + upgrade cards, mouse and keyboard).
- Goal ladder replaces the single objective.

**Acceptance:** each upgrade line can be built to max and its effect is measurable in game; a v1 save with plating loads as Plating 1; reload keeps all tiers.

### M8 — Economy
- ~~Circuits from drones; HUD and costs use them.~~ *(Moved into M7: upgrade costs needed all three resources.)*
- Drone drops get a unique id per kill, so a respawned drone's drop isn't already "collected".
- Respawning salvage and drones on play time, persisted in the save.
- Distance-scaled resource amounts.

**Acceptance:** after collecting a node and waiting out the delay away from it, it reappears; the same for drones; both survive a reload; circuits drop and are spent.

### M9 — Balance and polish
- Tune costs and effects for a 30–60 minute climb.
- Upgrade-built feedback (sound, banner with icon), visual hints of upgrades on the tank where cheap (e.g. plating tint).
- Fix rough edges found while playing; verify the deployed build.

**Acceptance:** a full climb to max is possible without exploits; no console errors; live tests pass.
