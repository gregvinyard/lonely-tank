# Lonely Tank — v0.3 Spec: "Things in the Sand"

v0.3 makes the wasteland's hostiles smarter and adds a second kind of enemy. Everything from v0.1 and v0.2 stays in force (pixel lock, data-driven tuning, save compatibility, tests for every feature).

## 1. Goals

- Drones no longer get stuck on rocks.
- Shooting a drone always provokes it, however far away the tank is.
- A new enemy, the **burrower**, travels under the sand and can only fight, or be fought, when it surfaces.

## 2. Out of scope for v0.3

- New upgrade lines, or upgrades aimed at burrowers.
- Shooting or ranged drones, and other new enemy types.
- Pathfinding over the whole map (local steering is enough for the open wasteland).
- Changes to the world layout. Existing saves keep the same rocks, salvage and drones.

## 3. Features

### 3.1 Smarter drones

- **Steering:** drones bend their path around rocks and the ship, treating rocks that touch as one wall. They commit to one side until they're past it.
- **Unsticking:** a drone that keeps trying to move but barely does sidesteps for a moment. A patrolling drone picks a new waypoint instead.
- **Clear waypoints:** patrol waypoints are never inside a rock.
- **Alerts:** a shot drone hunts the tank for 8 s from any range, with a longer leash (900 px). Drones within 260 px of it join in. Each hit refreshes the alert.
- **Calming:** the ship's safe zone still calms every drone, alerted or not, and a rescue sends them all home calm.

### 3.2 Burrowers

- **Placement:** five burrowers live in the outer wasteland. Their homes are placed after the rest of the world is generated, from their own seed, so the existing layout doesn't change.
- **Underground:** a burrower moves under the sand and passes beneath rocks.
  - While moving, it leaves a trail of small sand mounds that fade after a few seconds.
  - When it stops, all you see is a single mound at its position.
  - While underground it can't be hit (shells pass over it) and can't hurt the tank.
- **Senses:** it feels the tank's treads.
  - It notices a moving tank within 260 px.
  - It notices a stopped tank only within 130 px.
  - It ignores a tank in the safe zone.
- **Attack cycle:**
  1. It burrows toward the tank.
  2. Close enough, and on open ground, it stops; the mound shakes and sprays sand for 0.7 s as a warning.
  3. It bursts out. A tank within 34 px takes a bite.
  4. It stays up for 1.6 s. Only then can shells hit it, and touching it hurts.
  5. It dives, rests a moment, and starts again.
- **Loot:** 2 HP. When destroyed it leaves a crystal, sometimes two (it lives on them). It returns home after the same respawn time as drones.
- **Saves:** destroyed burrowers are saved and respawn like drones.

## 4. Milestones

### M10 — Smarter drones
Steering, unsticking, alerts. Unit tests simulate drones on the real map. Browser tests show a drone getting around a rock and a long-range shot provoking a drone.

### M11 — Burrowers
- PixelLab art for the burrower and the sand mounds.
- Burrower placement, behaviour, trail, surfacing, bites, loot, saves and respawns.
- Balance check updated for burrower loot.
- Browser tests:
  - shells pass over a burrowed burrower
  - no bite while burrowed
  - a surfaced burrower can be destroyed and drops loot
  - the trail fades
  - destroyed burrowers survive a reload and respawn
