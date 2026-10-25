# Lonely Tank — v0.5 Spec: "Running on Sunlight"

v0.5 gives the tank a hybrid drive. Running out of fuel no longer means an instant rescue: the tank can be stranded, and it has to recharge itself from the sun. All earlier rules stay in force.

## 1. Goals

- The motor runs on a battery; fuel charges the battery.
- With the fuel and battery both gone, the tank is stranded. Solar panels slowly recharge it, so a long trip home may take a couple of stops.
- Fuel lasts exactly as long as before. Fuel and battery are sized for a much bigger, possibly procedurally generated world later, not for today's map.

## 2. Out of scope for v0.5

- Upgrades for the battery, the generator or the solar panels (a natural follow-up).
- Day and night, or weather affecting solar charging.
- A bigger or generated world.

## 3. Features

- **Battery:**
  - 20 units, drained 1 per second at full speed (scaled by speed).
  - A generator refills it from fuel, 1:1, at up to 2 per second.
  - Shown as a third bar on the HUD and saved with the tank.
- **Stranded:** no fuel and no charge. The tank can't move; the turret still works. No rescue.
- **Solar panels:**
  - F while stopped slides a panel out from each side of the tank. They charge 0.5 per second once fully out.
  - Driving folds them away again once the battery holds 10%. F folds them any time.
- **Refills:** the ship charges the battery while the tank is inside, and a rescue (after being destroyed) refills everything.
- **Art:** the solar panel from PixelLab; a battery icon in the UI kit.

## 4. Milestone

### M13 — Hybrid drive and solar panels
- The pure power model, unit tested, including that fuel range is unchanged.
- Wiring in the scene, the HUD, saves and art.
- Browser tests:
  - getting stranded
  - solar charging, which stops while paused
  - the fold rule
  - panels only come out while stopped
  - the battery is saved and refilled
