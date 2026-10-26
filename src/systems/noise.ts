// Deterministic hashing and smooth value noise for world generation.
// Everything here is a pure function of its inputs, so any part of the
// planet can be rebuilt on demand and always comes out the same.

/** A well-mixed 32-bit hash of a seed and two integers. */
export function hash3(seed: number, x: number, y: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.imul(x | 0, 0xc2b2ae35), 0x27d4eb2f);
  h = Math.imul(h ^ Math.imul(y | 0, 0x165667b1), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** A value in [0, 1) for a seed and integer cell. */
export function rand01(seed: number, x: number, y: number): number {
  return hash3(seed, x, y) / 4294967296;
}

/** A per-cell seed for an RNG stream (chunk contents, features). */
export function cellSeed(seed: number, salt: number, x: number, y: number): number {
  return hash3(seed + Math.imul(salt, 0x632be5ab), x, y);
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1], one lattice point per `scale` world pixels. */
export function valueNoise(seed: number, x: number, y: number, scale: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fade(fx - ix);
  const ty = fade(fy - iy);
  const a = rand01(seed, ix, iy);
  const b = rand01(seed, ix + 1, iy);
  const c = rand01(seed, ix, iy + 1);
  const d = rand01(seed, ix + 1, iy + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** A few octaves of value noise, in [0, 1]. */
export function fbm(seed: number, x: number, y: number, scale: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(seed + o * 101, x, y, scale) * amp;
    norm += amp;
    amp *= 0.5;
    scale *= 0.5;
  }
  return sum / norm;
}
