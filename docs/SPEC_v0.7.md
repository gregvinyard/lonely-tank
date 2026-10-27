# Lonely Tank — v0.7 Spec: "Signal"

v0.6 made the planet big. v0.7 gives the tank reasons to cross it: each outer biome yields a rare material that the top upgrade tiers need, and the crew who left the ship left a trail of voice logs that ends at the far side of the world, with a job only the tank can finish. All earlier rules stay in force.

## 1. Goals

- Make the outer biomes worth the trip, with something there that home doesn't have.
- Give the game a story and an end: why the tank is alone, where the crew went, and what the tank can do about it.
- Keep the home economy as it was: everything built before v0.7 still comes from home salvage, and older saves load as they were.

## 2. Out of scope for v0.7

- New enemies, weather, music, characters you meet.
- Any change to how existing tiers cost or work.

## 3. Features

- **Rare materials**, one per outer biome, placed per chunk from their own random stream (so no other chunk content moves):

  | Material | Biome | Per chunk | Night light |
  |---|---|---|---|
  | Prism shard | Glass Fields | 0.25 | pale cyan |
  | Spore pod | Fungal Bloom | 0.3 | violet |
  | Acid salt | Acid Mire | 0.3 | acid green |
  | Relic core | Old City | 0.22 | amber |

  - Each holds 1 (sometimes 2) plus 1 per 14,000 px out. They regrow like other salvage, glow day and night, and are announced the first time one is picked up.
  - The HUD adds a row for them once any is found. The workshop header shows all seven.
- **Rare tiers:** a new top tier on every existing line, each needing one rare material:

  | Line | New tier | Needs |
  |---|---|---|
  | Plating | +25 hull | spores |
  | Fuel tanks | +40 fuel | salt |
  | Engine | +12% speed | relics |
  | Autoloader | −15% reload | salt, relic |
  | Long barrel | +30% range | prisms |
  | AP shells | +1 damage | salt |
  | Scanner | Marks the nearest rare material first | prisms |
  | Field repair | 3 hull/s | spores |

- **Power cells** (new line): +10 battery (salt), +60% solar charge (prisms), and +10 battery with +60% solar (salt, relic).
- **The crew's trail:**
  - Six orange emergency caches, one per biome in order: flats, badlands, glass, bloom, mire, ruins.
  - Each sits on open ground in a region of its biome, chosen near the ship but leaning toward the cache before it.
  - Only the next cache is out, with a blinking red beacon, plus the ones already heard.
  - The HUD shows a red arrow and distance to it ("Signal 840m"), and the map marks it, even in fog.
  - E plays the log in a panel that types out like a radio message, and the game waits. Heard logs can be played again.
- **The long-range array** (workshop line, three stages) is locked until all six logs are heard. Its last stage plays the ending; afterwards the ship sends out rings of signal and glows.
- **Goal ladder:**
  1. Build an upgrade.
  2. Follow the signal (log n/6).
  3. Rebuild the array (n/3).
  4. Signal answered.
- **Saves:**
  - Rare materials are optional inventory fields.
  - Logs heard (`log:n`), materials found (`material:kind`) and the ending (`ending`) go in the existing `discovered` list.
  - The save version stays 2.
