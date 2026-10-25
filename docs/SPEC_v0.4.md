# Lonely Tank — v0.4 Spec: "Home Is a Cargo Hold"

v0.4 replaces the small crashed ship and its invisible safe zone with a big wreck you drive into. All earlier rules stay in force: pixel lock, data-driven tuning, save compatibility, and tests for every feature.

## 1. Goals

- The ship is much bigger and is a real place, not a marker.
- You're safe because you're **inside** the ship, not because you crossed a line.
- An intact cargo door opens as you approach. Driving in opens the ship menu, and leaving the menu drives you back out.

## 2. Out of scope for v0.4

- A drivable or explorable interior; the hold is a menu.
- Changes to the world layout. Rocks, salvage, drones and burrowers stay exactly where they were.
- New ship services beyond the existing workshop.

## 3. Features

- **Ship:** a 320×256 PixelLab wreck, nose north, with the cargo door at the bottom center, facing where the tank starts. Its hull is solid: several collision circles.
- **Door:** opens when the tank is within 120 px of it and closes when the tank leaves.
- **Entering:**
  - Push into the open doorway, or press E nearby.
  - The ship rolls the tank in, where it disappears into the dark hold, and the ship menu opens.
- **Inside:** the workshop menu, as in v0.2–0.3, plus a **Leave ship** button. E or Esc also leaves.
- **Leaving:** the tank rolls out to just below the door, facing away, with 1.2 s of invulnerability.
- **Safety:** only while entering, inside or leaving. The safe-zone ring and HUD tag are gone. Hostiles calm down when you go in, but can now follow you right up to the hull.
- **Rescue:** puts the tank just outside the door.
- **Saves:**
  - A save made inside stores the spot outside the door.
  - An old save with the tank where the bigger ship now stands is moved outside the door.
  - The game saves once on start-up.

## 4. Milestone

### M12 — The ship you drive into
- Art, door, entering and leaving, safety, and save handling.
- A test that locks the world layout to the v0.3 fixture.
- Browser tests:
  - the door opens and shuts
  - driving in opens the menu and calms drones
  - leaving faces away and doesn't fire
  - the hull is solid
  - an old save is relocated outside
  - saving from inside stores the spot outside the door
