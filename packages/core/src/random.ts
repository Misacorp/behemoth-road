/**
 * Seeded randomness.
 * - A game's `Seed` is 128 bits (four 32-bit words), so it cannot be found by
 *   trying every value against the terrain a player can see.
 * - `hashToUnit(seed, ...parts)`: a pure hash to [0, 1), for values that must be a
 *   function of where and when (a tile's terrain, the creature's step on a day).
 *   It keeps a 128-bit state until the last step, so the seed never narrows to a
 *   32-bit key. It is a fast mixing hash, not a cryptographic one.
 * - `createRng(n)`: a fast sequential generator (mulberry32) for local use
 *   inside one call, started from a hash. Never store it in state.
 */

/** A game seed: four unsigned 32-bit words. Plain JSON. */
export type Seed = readonly [number, number, number, number];

const isWord = (n: unknown): boolean =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;

export const isSeed = (x: unknown): x is Seed =>
  Array.isArray(x) && x.length === 4 && x.every(isWord);

/**
 * A seed from a seed, or from one 32-bit number (the other words 0). Numbers are
 * for tests and local play only: a real game uses `newSeed()`.
 */
export const toSeed = (seed: Seed | number): Seed => {
  if (typeof seed === 'number') {
    if (!isWord(seed)) throw new RangeError('A number seed must be an integer from 0 to 2^32 - 1');
    return [seed, 0, 0, 0];
  }
  if (!isSeed(seed)) throw new RangeError('A seed is four integers from 0 to 2^32 - 1');
  return seed;
};

/** A fresh random 32-bit number for cosmetic use (`artSeed`), unrelated to any game seed. */
export const newArtSeed = (): number => newSeed()[0];

/** A fresh random seed from the platform's secure generator (server side). */
export const newSeed = (): Seed => {
  // The core has no DOM or Node types; Workers, browsers and Node all provide Web Crypto.
  const { crypto } = globalThis as unknown as {
    crypto: { getRandomValues: (array: Uint32Array) => Uint32Array };
  };
  const words = crypto.getRandomValues(new Uint32Array(4));
  return [words[0] ?? 0, words[1] ?? 0, words[2] ?? 0, words[3] ?? 0];
};

const mix = (h: number, k: number): number => {
  let x = Math.imul(k | 0, 0xcc9e2d51);
  x = (x << 15) | (x >>> 17);
  x = Math.imul(x, 0x1b873593);
  let y = h ^ x;
  y = (y << 13) | (y >>> 19);
  return (Math.imul(y, 5) + 0xe6546b64) | 0;
};

const finalise = (h: number): number => {
  let x = h ^ (h >>> 16);
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
};

/** A 32-bit FNV-1a hash of a string, to name random streams. */
export const hashString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/**
 * Hashes a seed and integer parts to an unsigned 32-bit integer. Four lanes, one
 * per seed word, each absorb every part and feed the next, so the whole 128-bit
 * state carries through to the end (shaped like MurmurHash3's x86 128-bit variant).
 */
export const hashInts = (seed: Seed, ...parts: readonly number[]): number => {
  let a = seed[0] | 0;
  let b = seed[1] | 0;
  let c = seed[2] | 0;
  let d = seed[3] | 0;
  for (const p of parts) {
    a = (mix(a, p) + b) | 0;
    b = (mix(b, p ^ 0x239b961b) + c) | 0;
    c = (mix(c, p ^ 0x38b34ae5) + d) | 0;
    d = (mix(d, p ^ 0x5d4b7f9a) + a) | 0;
  }
  const n = parts.length;
  a ^= n;
  b ^= n;
  c ^= n;
  d ^= n;
  a = (a + b + c + d) | 0;
  b = (b + a) | 0;
  c = (c + a) | 0;
  d = (d + a) | 0;
  return (finalise(a) + finalise(b) + finalise(c) + finalise(d)) >>> 0;
};

/** Hashes a seed and integer parts to a number in [0, 1). */
export const hashToUnit = (seed: Seed, ...parts: readonly number[]): number =>
  hashInts(seed, ...parts) / 0x100000000;

/** mulberry32: a small, fast generator returning numbers in [0, 1). */
export const createRng = (seed: number): (() => number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
};

/**
 * Picks an item by weight using `roll` in [0, 1). Items with weight 0 are never
 * picked. Throws if no item has a positive weight.
 */
export const pickWeighted = <T>(
  items: readonly T[],
  weight: (item: T) => number,
  roll: number,
): T => {
  const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
  if (!(total > 0)) throw new RangeError('pickWeighted: no item has a positive weight');
  let target = roll * total;
  let last: T | undefined;
  for (const item of items) {
    const w = Math.max(0, weight(item));
    if (w === 0) continue;
    last = item;
    if (target < w) return item;
    target -= w;
  }
  return last as T; // Only reached through floating-point rounding.
};
