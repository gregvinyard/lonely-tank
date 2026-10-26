import { valueNoise } from './noise';

// Time of day and the wind. Both are pure functions of time, so the sky picks
// up where it left off when a save loads (it runs on play time), and pausing
// the game pauses the sun.

/** One full day and night, in play time. */
export const DAY_MS = 15 * 60_000;
/** A new game starts a little after sunrise. */
export const DAY_START = 0.3;

/** Where in the day `playTimeMs` falls: 0 is midnight, 0.5 is noon. */
export function dayPhase(playTimeMs: number, start = DAY_START): number {
  const p = (start + playTimeMs / DAY_MS) % 1;
  return p < 0 ? p + 1 : p;
}

export interface Sky {
  /** Light colour the world is multiplied by (0..1 per channel). */
  r: number;
  g: number;
  b: number;
  /** 0 by day, 1 at full night: how strongly lamps and glows show. */
  night: number;
  /** Drop-shadow opacity. */
  shadow: number;
  /** Cloud-shadow opacity. */
  clouds: number;
}

// The light through the day. Night stays readable: about 55% brightness, blue.
const NIGHT = [0.48, 0.54, 0.78] as const;
const KEYS: readonly (readonly [number, number, number, number])[] = [
  [0.0, ...NIGHT],
  [0.16, ...NIGHT],
  [0.21, 0.72, 0.58, 0.72], // dawn
  [0.26, 1.0, 0.8, 0.66], // sunrise
  [0.34, 1.0, 0.95, 0.88],
  [0.42, 1.0, 1.0, 1.0],
  [0.64, 1.0, 1.0, 1.0],
  [0.71, 1.0, 0.88, 0.72], // golden hour
  [0.77, 0.96, 0.64, 0.54], // sunset
  [0.82, 0.66, 0.52, 0.72], // dusk
  [0.87, ...NIGHT],
  [1.0, ...NIGHT],
];

const luma = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
const NIGHT_LUMA = luma(...NIGHT);
/** Lamps start to show once the light drops below this. */
const DUSK_LUMA = 0.92;

export function skyAt(phase: number): Sky {
  const p = ((phase % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= p) i++;
  const [p0, r0, g0, b0] = KEYS[i];
  const [p1, r1, g1, b1] = KEYS[i + 1];
  const t = p1 > p0 ? (p - p0) / (p1 - p0) : 0;
  const r = r0 + (r1 - r0) * t;
  const g = g0 + (g1 - g0) * t;
  const b = b0 + (b1 - b0) * t;
  const night = Math.max(0, Math.min(1, (DUSK_LUMA - luma(r, g, b)) / (DUSK_LUMA - NIGHT_LUMA)));
  return { r, g, b, night, shadow: 0.3 - 0.2 * night, clouds: 0.16 - 0.1 * night };
}

/** The sky colour as 0xRRGGBB. */
export function skyColor(s: Sky): number {
  const c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return (c(s.r) << 16) | (c(s.g) << 8) | c(s.b);
}

export interface Wind {
  /** Direction it blows toward, radians (0 = east, π/2 = south). */
  angle: number;
  /** 0 when calm, 1 in a strong gust. */
  gust: number;
  /** Velocity, px per second. */
  x: number;
  y: number;
}

const SALT_DIR = 71;
const SALT_GUST = 72;
const PREVAILING = 0.35; // a little south of east

/** The wind at `seconds` of play: a slowly swinging direction, with gusts. */
export function windAt(seconds: number): Wind {
  const angle = PREVAILING + 1.6 * (valueNoise(SALT_DIR, seconds, 0, 70) - 0.5);
  // Long lulls and blows, with short gusts on top.
  const raw = 0.65 * valueNoise(SALT_GUST, seconds, 0, 20) + 0.35 * valueNoise(SALT_GUST + 1, seconds, 0, 4);
  const gust = Math.max(0, Math.min(1, (raw - 0.25) / 0.55));
  const speed = 16 + 64 * gust;
  return { angle, gust, x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}
