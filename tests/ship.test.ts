import { describe, expect, it } from 'vitest';
import { DRONES, OBSTACLES, SHIP, TANK, WORLD_SEED } from '../src/data/tuning';
import { atDoorway, doorMouth, doorTarget, entryPath, hullAt, inFrontOfDoor, overHull, sheltered, stepDoor } from '../src/systems/ship';
import { generateWorld } from '../src/systems/worldgen';

const L = SHIP.layout;
const mouth = doorMouth(L);

describe('ship door', () => {
  it('opens for a nearby tank and stays open while it passes through', () => {
    expect(doorTarget('outside', { x: mouth.x, y: mouth.y + 60 }, L)).toBe(1);
    expect(doorTarget('outside', { x: mouth.x, y: mouth.y + L.openDistance + 5 }, L)).toBe(0);
    for (const s of ['entering', 'inside', 'exiting'] as const) expect(doorTarget(s, { x: 9999, y: 9999 }, L)).toBe(1);
  });

  it('slides at a steady rate and stops at its target', () => {
    expect(stepDoor(0, 1, 100, 400)).toBeCloseTo(0.25);
    expect(stepDoor(0.9, 1, 100, 400)).toBe(1);
    expect(stepDoor(0.1, 0, 100, 400)).toBe(0);
  });

  it('lets the tank in only through the open doorway', () => {
    const pushing = { x: mouth.x, y: mouth.y + TANK.bodyRadius + 2 };
    expect(atDoorway(pushing, 1, L)).toBe(true);
    expect(atDoorway(pushing, 0.5, L)).toBe(false); // still opening
    expect(atDoorway({ x: L.door.x - 8, y: pushing.y }, 1, L)).toBe(true); // a little off-center is fine
    expect(atDoorway({ x: L.door.x - 20, y: pushing.y }, 1, L)).toBe(false); // beside the door
    expect(atDoorway({ x: mouth.x, y: mouth.y + L.mouthDepth + 10 }, 1, L)).toBe(false); // too far out
  });

  it('E only offers the way in from in front of the door', () => {
    expect(inFrontOfDoor(L.exit, L)).toBe(true);
    expect(inFrontOfDoor({ x: -115, y: 95 }, L)).toBe(false); // beside the engine pod
    expect(inFrontOfDoor({ x: mouth.x, y: mouth.y + L.openDistance + 5 }, L)).toBe(false);
  });

  it('the drive in never passes through the hull, from anywhere E is offered', () => {
    const bay = L.hull.find((c) => c.x === 0 && c.y + c.r === Math.max(...L.hull.map((h) => h.y + h.r)))!;
    const [door] = entryPath(L);
    for (let x = -60; x <= 60; x += 2) {
      for (let y = mouth.y; y <= mouth.y + L.openDistance; y += 2) {
        const p = { x, y };
        if (!inFrontOfDoor(p, L) || overHull(p, L, TANK.bodyRadius)) continue;
        // Every point along the run to the doorway clears the hull (the cargo bay itself is where it's going).
        for (let t = 0; t <= 1; t += 0.05) {
          const q = { x: p.x + (door.x - p.x) * t, y: p.y + (door.y - p.y) * t };
          for (const c of L.hull) {
            if (c === bay) continue;
            expect(Math.hypot(q.x - c.x, q.y - c.y), `from ${x},${y}`).toBeGreaterThanOrEqual(c.r + TANK.bodyRadius - 1);
          }
        }
      }
    }
  });

  it('only "outside" is exposed', () => {
    expect(sheltered('outside')).toBe(false);
    expect(sheltered('entering') && sheltered('inside') && sheltered('exiting')).toBe(true);
  });
});

describe('ship geometry', () => {
  it('a tank pushing against the hull below the door can reach the doorway', () => {
    // The hull stops the tank's center one body radius below the hull edge.
    const stop = Math.max(...L.hull.filter((c) => Math.abs(c.x) < 10).map((c) => c.y + c.r)) + TANK.bodyRadius;
    expect(stop).toBeGreaterThanOrEqual(mouth.y);
    expect(stop).toBeLessThanOrEqual(mouth.y + L.mouthDepth - 4);
  });

  it('hides the hold and keeps the exit clear', () => {
    expect(overHull(L.hold, L)).toBe(true);
    expect(overHull(L.exit, L, TANK.bodyRadius + 10)).toBe(false);
    expect(Math.hypot(L.exit.x - mouth.x, L.exit.y - mouth.y)).toBeLessThan(L.openDistance);
  });

  it('leaves no tight gaps between the hull and nearby rocks', () => {
    const world = generateWorld(WORLD_SEED);
    for (const r of world.rocks) {
      for (const c of hullAt(world.center, L)) {
        const gap = Math.hypot(r.x - c.x, r.y - c.y) - c.r - OBSTACLES.sizes[r.size].radius;
        // Either touching-free with room for a tank, never a slot something wedges into.
        expect(gap, `rock at ${r.x},${r.y}`).toBeGreaterThan(TANK.bodyRadius * 2 + 10);
      }
    }
  });

  it('keeps drone and burrower homes clear of the hull', () => {
    const world = generateWorld(WORLD_SEED);
    for (const h of [...world.drones, ...world.burrowers]) {
      expect(overHull({ x: h.x - world.center.x, y: h.y - world.center.y }, L, DRONES.patrolRadius)).toBe(false);
    }
  });
});
