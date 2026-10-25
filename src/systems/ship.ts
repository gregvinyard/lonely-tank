import type { Vec } from './drone';
import type { Circle } from './steer';

/**
 * The tank's relationship to the crashed ship.
 * outside: driving around. entering: rolling in through the cargo door.
 * inside: parked in the hold with the ship menu open. exiting: rolling back out.
 */
export type ShipState = 'outside' | 'entering' | 'inside' | 'exiting';

/** Ship geometry, all relative to the ship's center. */
export interface ShipLayout {
  /** Collision circles that make up the hull. */
  hull: readonly Circle[];
  /** The cargo door opening in the art: left, top, width, height. */
  door: { x: number; y: number; w: number; h: number };
  /** Where the tank comes to rest inside, hidden by the hull. */
  hold: Vec;
  /** Where the tank comes out and is placed after a rescue, just clear of the door. */
  exit: Vec;
  /** The door opens when the tank's center is this close to the bottom middle of the door. */
  openDistance: number;
  /** How far below the door the tank may be and still drive in. */
  mouthDepth: number;
}

const DOOR_SLACK = 12; // px either side of the door that still counts as the doorway
const FRONT_LANE = 40; // px either side of the door's middle where E takes the tank in

/** True while the tank is in the ship or rolling through the door: safe from everything. */
export function sheltered(state: ShipState): boolean {
  return state !== 'outside';
}

/** Bottom middle of the door, relative to the ship center. */
export function doorMouth(l: ShipLayout): Vec {
  return { x: l.door.x + l.door.w / 2, y: l.door.y + l.door.h };
}

/** How open the door should be: wide open while the tank is near or passing through. */
export function doorTarget(state: ShipState, tank: Vec, l: ShipLayout): number {
  if (state !== 'outside') return 1;
  const m = doorMouth(l);
  return Math.hypot(tank.x - m.x, tank.y - m.y) < l.openDistance ? 1 : 0;
}

/** Moves the door's openness (0 shut, 1 open) toward the target at a fixed speed. */
export function stepDoor(open: number, target: number, dtMs: number, fullMs: number): number {
  const step = dtMs / fullMs;
  return target > open ? Math.min(target, open + step) : Math.max(target, open - step);
}

/**
 * The tank is pushing into the open doorway: its center is within the door's
 * width and just below it (the hull stops it from getting any closer).
 */
export function atDoorway(tank: Vec, open: number, l: ShipLayout): boolean {
  if (open < 1) return false;
  const bottom = l.door.y + l.door.h;
  // A little wider than the door itself: the ship straightens the tank up as it rolls in.
  const inX = tank.x >= l.door.x - DOOR_SLACK && tank.x <= l.door.x + l.door.w + DOOR_SLACK;
  return inX && tank.y >= bottom && tank.y <= bottom + l.mouthDepth;
}

/**
 * In front of the door, close enough to be offered E to go in: a lane below
 * the door from which a straight run to the doorway can't clip the hull.
 */
export function inFrontOfDoor(tank: Vec, l: ShipLayout): boolean {
  const m = doorMouth(l);
  return Math.abs(tank.x - m.x) <= FRONT_LANE && tank.y >= m.y && Math.hypot(tank.x - m.x, tank.y - m.y) < l.openDistance;
}

/** The route the ship drives the tank in by: straight to the doorway, then into the hold. */
export function entryPath(l: ShipLayout): Vec[] {
  return [doorMouth(l), { ...l.hold }];
}

/** True if a point (relative to the ship center) is within `pad` of the hull. */
export function overHull(p: Vec, l: ShipLayout, pad = 0): boolean {
  return l.hull.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < c.r + pad);
}

/** The hull circles in world space, each grown by `grow`. */
export function hullAt(center: Vec, l: ShipLayout, grow = 0): Circle[] {
  return l.hull.map((c) => ({ x: center.x + c.x, y: center.y + c.y, r: c.r + grow }));
}
