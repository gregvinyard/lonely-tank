# LONELY TANK
## Game Design & Development Specification — v0.1

**Project:** Lonely Tank  
**Repository:** https://github.com/gregvinyard/lonely-tank  
**Engine:** Phaser 4  
**Language:** TypeScript  
**Build Tool:** Vite  
**Hosting:** Cloudflare Pages (Free)  
**Art Pipeline:** PixelLab.ai, operated by the coding agent via the PixelLab MCP server

---

## 1. Project Vision

Lonely Tank is a single-player, top-down, 2D pixel-art survival exploration game.

The player is stranded on an alien planet with a damaged spaceship serving as their home base. Their primary means of exploring the hostile environment is a small armored tank.

The player ventures into the wasteland, salvages resources, encounters occasional hostiles, and returns home to repair and improve their vehicle.

**Intended experience:**
- Relaxed exploration punctuated by moments of danger.
- A satisfying feeling of driving and operating a little tank.
- The mystery and loneliness of an unfamiliar alien world.
- Light resource management, salvage, and crafting.
- Short, satisfying play sessions with persistent progress.

The goal is not to create a full survival simulation or complex open-world game in v0.1.

Our first objective is a playable vertical slice demonstrating the central gameplay loop.

## 2. Essential Gameplay Loop

1. Start at the crashed spaceship.
2. Drive the tank into the surrounding wasteland.
3. Discover resources, wreckage, and hostile drones.
4. Collect salvage and survive encounters.
5. Return to the ship with collected materials.
6. Repair, refuel, and craft an upgrade.
7. Repeat, exploring farther as the tank improves.

Version 0.1 should make this entire loop functional.

## 3. Gameplay Specification

### 3.1 Camera and World

- Strictly top-down, orthographic 2D.
- Camera smoothly follows the player's tank.
- World built on a 32×32 pixel tile grid.
- Initial world approximately 64×64 tiles (2048×2048 pixels).
- One alien wasteland biome.
- Procedural placement of rocks, salvage, crystals, and enemies using a deterministic random seed.
- The spaceship occupies a fixed cleared region near the world's center.
- The world has boundaries; infinite world generation is deferred.
- No separate interior spaceship scene.

World generation must keep the starting region and the route immediately surrounding the spaceship traversable.

Use a small number of terrain textures and scattered environmental objects. A sophisticated terrain autotiling system is not required initially.

### 3.2 Tank Controls

**Desktop keyboard and mouse:**

| Input | Action |
|---|---|
| W/A/S/D | Move tank |
| Mouse | Aim turret |
| Left mouse | Fire weapon |
| E | Interact / salvage / dock |
| Escape | Pause game |

Tank behavior:
- Smooth omnidirectional movement.
- Diagonal movement normalized.
- Tank hull turns toward the direction of movement.
- Turret rotates independently toward the mouse cursor.
- Slight acceleration/deceleration for a sense of weight.
- Solid collision with large rocks and world boundaries.
- Phaser Arcade Physics is sufficient; realistic vehicle simulation is unnecessary.

The tank is one logical game entity composed of separate hull and turret sprites.

The tank should feel responsive and enjoyable to move before any other gameplay systems are added.

### 3.3 Survival Resources

Initial tank statistics:

| Statistic | Initial value |
|---|---:|
| Hull integrity | 100 |
| Fuel | 100 |
| Maximum speed | 160 px/sec |
| Weapon | Basic cannon |

Fuel decreases only while moving, initially at approximately one unit per second. These values are tunable game constants.

No hunger, thirst, sleep, radiation, or complex environmental status systems in v0.1.

If the tank runs out of fuel or is destroyed, an automatic rescue returns it to the spaceship. The player loses 25% of carried salvage, rounded down, but retains permanent upgrades.

No permanent death.

### 3.4 Salvaging

Two resource types initially:

**Scrap Metal**
- Found in metallic wreckage.
- Used for repairs and upgrades.

**Energy Crystals**
- Found in mineral deposits.
- Used for advanced upgrades.

When the tank gets within interaction range of a resource object, display a small contextual prompt.

Press E to collect the resource. The object disappears and inventory increases.

Resources have stable identifiers so collected items remain collected when saved and reloaded.

No inventory weight, grid inventory, or item stacking limits.

### 3.5 Combat

Implement one enemy type: an autonomous alien sentry drone.

Behavior:
- Wanders or patrols its local area.
- Detects the player within a limited radius.
- Moves toward the player.
- Causes damage on contact, subject to a cooldown.
- Can be destroyed by cannon fire.
- May drop scrap when destroyed.
- Cannot enter the spaceship's safe zone.

Player weapon:
- Fires projectiles in the turret's facing direction.
- Has a modest firing cooldown.
- Unlimited ammunition in v0.1.
- Projectiles collide with enemies and solid obstacles.
- Simple visual impact feedback.

No enemy pathfinding framework, factions, bosses, or advanced combat AI.

### 3.6 Spaceship / Home Base

The spaceship is a stationary object in the world.

When near it, pressing E opens a simple workshop interface.

Actions:
- **Refuel:** Refill the tank for free.
- **Repair:** Spend 3 scrap to restore 25 hull integrity (capped at maximum).
- **Craft Reinforced Plating:** Spend 8 scrap and 2 crystals to permanently increase maximum hull integrity by 25.

The plating upgrade can be crafted once in v0.1.

This upgrade is the initial progression objective. Once crafted, display a short success message, but allow continued exploration.

### 3.7 HUD

Display:
- Hull integrity bar
- Fuel bar
- Scrap quantity
- Crystal quantity
- Current objective
- Contextual interaction prompts

Add a simple compass arrow pointing toward the spaceship when it is off-screen.

Use Phaser text and simple shapes for the interface. Custom artwork is not necessary.

### 3.8 Save System

Use browser localStorage.

Persist:
- World generation seed
- Tank location and status
- Inventory
- Collected resource identifiers
- Destroyed enemy identifiers
- Permanent upgrades

Include a save schema version.

Autosave periodically and whenever the player docks at the spaceship. Restore saved progress on reload.

Handle missing, corrupted, or incompatible saved data without crashing.

No authentication, backend database, or cloud saves.

---

## 4. Art Direction

**Style:** Stylized, readable, top-down pixel art with a muted science-fiction wasteland palette.

Visual inspiration:
- Dusty alien deserts.
- Salvaged industrial machinery.
- Weathered metal.
- Strange luminous minerals.
- Cassette-futurism accents.
- Warm rust and sand contrasted with cool teal and violet technology.

All assets must share a consistent viewpoint and approximate pixel density.

Avoid isometric projection, perspective views, photorealism, excessive noise, or elaborate animation.

### Art Production Workflow

The coding agent creates the artwork itself using PixelLab.ai through the PixelLab MCP server at development time. The human developer reviews the results and may request changes.

The coding agent must not require completed artwork to begin development.

**Rules:**

1. All required artwork is referenced through a centralized asset manifest.
2. Use code-generated placeholder shapes until the corresponding artwork is supplied.
3. Artwork must be replaceable without changing gameplay logic.
4. Do not integrate PixelLab's API into the game runtime in v0.1. (Generating art with PixelLab at development time, via MCP, is expected.)
5. Maintain an `ART_REQUESTS.md` document listing required or desired assets, their generation status, and the PixelLab prompts/settings used.
6. Give each asset a filename, dimensions, purpose, transparency requirement, and the PixelLab prompt used to create it.
7. Accept either individual PNGs or sprite sheets, with explicit frame metadata for sheets.
8. Do not use, purchase, or substitute external copyrighted game assets. All art is generated with PixelLab or drawn programmatically.

### Initial Art Asset Contract

| Filename | Dimensions | Description |
|---|---|---|
| `terrain_ground.png` | 32×32 | Seamlessly repeating alien wasteland ground, opaque |
| `tank_hull.png` | 64×64 | Player tank chassis, transparent |
| `tank_turret.png` | 64×64 | Separate cannon turret, transparent |
| `spaceship.png` | 128×128 | Crashed spacecraft/home base, transparent |
| `rock.png` | 64×64 | Large alien boulder, transparent |
| `scrap.png` | 32×32 | Metallic salvage pile, transparent |
| `crystal.png` | 32×32 | Glowing alien mineral formation, transparent |
| `drone.png` | 48×48 | Hostile alien sentry drone, transparent |

These are logical canvas sizes, not required full-object dimensions.

Tank hull and turret images must be centered on their canvases, with the forward direction pointing right (+X). Both should use the same rotation pivot at canvas center.

The turret artwork should place its main barrel along the right-facing horizontal axis.

Effects such as shots, dust, muzzle flashes, shadows, and explosions should initially be generated through Phaser.

Additional assets may be requested when justified, but should not block earlier milestones.

Store final image assets under `public/assets/`.

---

## 5. Technical Architecture

Use:
- Phaser 4.2.1 or a newer verified stable Phaser 4 release.
- TypeScript.
- Vite.
- Phaser Arcade Physics where appropriate.
- Static client-side hosting.

Keep dependencies minimal.

Recommended separation of responsibilities:

- **Scenes:** Loading, gameplay, interface.
- **Entities:** Player tank, enemy drone, resources.
- **Systems:** World generation, interaction, combat, inventory, crafting, saving.
- **Data:** Tuning constants, recipes, and asset definitions.

These are conceptual boundaries, not a mandate to create a large number of classes.

Prefer small, readable modules over generic frameworks, event buses, plugin architectures, or premature abstraction.

Use deterministic simulation where practical, particularly for world generation.

Reference Phaser 4 documentation and actual installed APIs rather than assuming Phaser 3 compatibility.

### Deployment

Repository: `gregvinyard/lonely-tank`

Configure Cloudflare Pages with:

- Production branch: `main`
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: repository root

Use GitHub integration for automatic production deployments and preview deployments where available.

No backend services or database infrastructure should be necessary.

Do not commit API keys, secrets, credentials, or configuration containing sensitive information.

If an account authorization or manual Cloudflare dashboard action is required, provide exact instructions rather than abandoning deployment.

---

## 6. Implementation Milestones

Complete these milestones sequentially. Each must produce a runnable game, and no milestone should begin until the preceding one is functional.

### M0 — Project Foundation

Deliverables:
- Initialize TypeScript/Vite/Phaser 4.
- Configure development and production builds.
- Create a minimal game with a visible background.
- Configure responsive desktop browser rendering.
- Enable pixel-art rendering.
- Configure GitHub repository and Cloudflare Pages deployment.
- Create a README explaining local development.

**Acceptance:** The game loads locally and from a publicly accessible Cloudflare Pages URL.

### M1 — The Tank Drives

Deliverables:
- Tank entity with hull and rotating turret.
- WASD movement, acceleration, and deceleration.
- Mouse turret aiming.
- Camera follow.
- World boundaries.
- A few solid obstacles using placeholder graphics.

**Acceptance:** The player can drive around an area, aim independently, and cannot pass through solid obstacles.

This is the first major gameplay checkpoint. Stop and request the developer's feedback on movement feel.

### M2 — Wasteland Exploration

Deliverables:
- Deterministic wasteland world.
- Spaceship safe area.
- Procedurally scattered rocks.
- Scrap and crystal resource nodes.
- Interaction prompts and collection.
- Simple inventory HUD.
- Home-base compass direction.

**Acceptance:** The player can leave the ship, explore, locate resources, collect them, and return.

### M3 — Hostile Encounters

Deliverables:
- Cannon projectiles and firing cooldown.
- One drone enemy.
- Simple enemy movement and pursuit.
- Damage and destruction.
- Basic combat feedback.
- Scrap drops.
- Automatic rescue on tank destruction or fuel depletion.

**Acceptance:** The player can encounter, fight, destroy, or escape a hostile drone.

### M4 — Complete Expedition Loop

Deliverables:
- Fuel consumption.
- Home-base workshop.
- Refueling and repairs.
- Reinforced plating upgrade.
- Objective completion feedback.
- localStorage save/load.
- Correct persistence of collected resources and upgrades.

**Acceptance:** The player can complete a full expedition, return with salvage, craft the upgrade, reload the page, and continue with saved progress.

This is the **v0.1 vertical-slice completion milestone**.

### M5 — Small Polish Pass

Only after M4:

- Integrate remaining PixelLab-generated art.
- Improve visual effects and tank feedback.
- Basic sound effects if readily available or simple to generate.
- Improve readability and contextual instructions.
- Fix gameplay rough edges.
- Verify the deployed build.

Do not add substantial new gameplay systems during this milestone.

---

## 7. Explicitly Out of Scope

Do not implement the following without future approval:

- Infinite terrain or chunk streaming
- Multiple biomes
- Multiplayer
- NPC conversations or quests
- Hunger/thirst or detailed survival meters
- Tech trees
- Complex crafting interfaces
- Multiple tank chassis
- Base building
- Advanced enemy AI
- Story generation or LLM-driven gameplay
- PixelLab API integration in the game runtime
- Cloud databases or user accounts
- Mobile/touch controls
- Day/night simulation
- Dynamic weather

These may become future features, but must not influence v0.1 scope beyond avoiding obviously irreversible design decisions.

---

## 8. Development & Quality Rules

1. Work milestone by milestone.
2. Keep the game runnable after every milestone.
3. Use placeholders rather than blocking on missing artwork.
4. Maintain straightforward documentation.
5. Run type checking and production builds before declaring a milestone complete.
6. Add focused tests for pure logic, especially world generation, inventory, crafting, and save/load behavior.
7. Use automated browser smoke tests when practical.
8. Commit completed milestone work with clear commit messages.
9. Do not begin implementing unapproved features.
10. Prefer a simple playable implementation over an elaborate technically impressive architecture.

Maintain these files:

- `README.md` — Setup, gameplay, deployment
- `docs/GAME_DESIGN.md` — Current gameplay decisions
- `docs/ART_REQUESTS.md` — Human-readable art requirements and delivery status
- `docs/PROGRESS.md` — Completed milestones, known issues, next actions

### Milestone Report Format

After each milestone, report:

- What was implemented
- How to test it
- Build/test results
- Deployment URL and status
- Any missing artwork
- Known limitations
- Recommendation for the next milestone

Do not claim that a deployment, build, or test succeeded unless verified.

---

## 9. First Instruction to the Coding Agent

Begin with **Milestone M0**, then proceed to **M1**.

Inspect the repository before making changes. Verify the installed Phaser version and consult the matching documentation.

Use temporary programmatically drawn art for all game objects.

Deploy the initial build to Cloudflare Pages as soon as M0 is functional.

After M1, stop and provide a playable link along with a short assessment of the movement and camera implementation.

Do not begin M2 until the human developer has had an opportunity to play and evaluate how the tank feels.

**Primary objective: Get a little tank moving around an alien wasteland in a browser as quickly as possible. Everything else follows that.**