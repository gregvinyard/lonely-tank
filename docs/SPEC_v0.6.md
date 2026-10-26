# Lonely Tank — v0.6 Spec: "A Wider World"

v0.6 turns the 2 km wasteland into a planet about 63 km across. Like Minecraft, it is made of biomes: regions with their own ground, plants, terrain, salvage and dangers. The goal is a planet that feels varied and big enough that the player wants to go and look. All earlier rules stay in force.

## 1. Goals

- A much bigger world, generated from the seed and streamed in around the tank, with no loading screens and no stutter.
- Biomes, each with its own look, plants and salvage. Not everything is near home: a 2-minute drive (about 19 km) shows a few biomes, and the rarest ones lie farther out.
- Impassable terrain: cliffs (mesas), canyons and lakes of alien liquid. It must never wall anything in.
- Alien ruins, alien plants and landmarks to find.
- Exploration that pays: richer salvage farther out, fuel seeps for long trips, a map of where you've been.
- The original map and everyone's saves stay exactly as they are.

## 2. Out of scope for v0.6

- New resource kinds, recipes or upgrades (biomes vary the existing salvage).
- New enemy types (biomes vary how many drones and burrowers there are).
- Day and night, weather, and upgrades for the battery or solar panels.
- A second ship or a base you can move.

## 3. Features

- **World:**
  - The original 2048 px map stays where it was, as the "home square" at 0..2048.
  - The planet spreads out in every direction, negative coordinates included: −30,720 to 32,768 px on each axis.
  - It's built in 512 px chunks within 2 chunks of the tank (5×5) and removed past 3.
  - Ground is painted on a web worker.
- **Biomes:**
  - Six biomes: Dust Flats (home), Rust Badlands, Glass Fields, Fungal Bloom, Acid Mire, and Old City (ruins).
  - They're laid out as warped Voronoi cells about 4 km across.
  - Everything within about 5 km of the ship is dust flats. Glass, bloom, mire and ruins only appear past 6, 5, 7 and 9 km.
  - Borders blend with a dithered edge.
- **Impassable terrain:**
  - **Mesas:** raised plateaus with a cliff face and a cast shadow. They stop shells.
  - **Canyons:** long chasms with a lit north wall.
  - **Lakes:** acid or violet ichor, with a foam line, shallows and a wet shore.
  - At most one group per 2 km feature cell, kept inside the cell. Shapes are star-shaped blobs or bands along a wiggly curve, so nothing is ever sealed off; this is unit tested with a flood fill.
  - The home square plus 700 px around it has none.
- **Things to find:**
  - Biome plants you drive over.
  - Solid props: fungus trees whose caps hang over the tank, crystal spires, and ruin walls and towers on a street grid.
  - Tinted boulders.
  - Landmarks: Leviathan bones, The Monolith, and the Fallen saucer.
- **Salvage by biome:**
  - Badlands have scrap, glass has crystal, ruins have circuits (the first source besides drones), and the mire has fuel seeps.
  - Amounts grow by 1 for every 7 km from the ship (up to 3).
  - Siphoning a seep (E) puts fuel in the tank; seeps refill over time like salvage.
- **Hostiles:** drones and burrowers spawn by biome and grow more common farther out. Ruins are guarded.
- **Discovery:**
  - Crossing into a biome shows its name, with "New biome" the first time.
  - Landmarks are announced when found.
- **Map (Tab):**
  - Shows explored ground round the tank, coloured by biome, with lakes, canyons and mesas.
  - Marks the ship, the tank and landmarks found, with a legend of biomes found.
  - The game waits while it's open.
- **Saves:** explored chunks and discoveries are optional fields, so older saves still load. The tank can be saved and loaded anywhere on the planet.

## 4. Milestone

### M14 — The planet
- Pure, unit-tested generation:
  - noise, biomes, terrain features, chunk contents and the ground painter
  - nothing in the home square
  - everything reachable
- Streaming, collision, salvage and hostiles by chunk; respawns that work for chunk ids.
- HUD: discovery banner, seep prompt, map.
- PixelLab art: biome ground and materials, plants, props, landmarks and seeps.
- Browser tests:
  - terrain blocks the tank
  - streaming doesn't pile up objects
  - far saves with negative coordinates
  - discovery and the map
  - fuel seeps
