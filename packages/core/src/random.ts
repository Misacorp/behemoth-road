/**
 * Seeded randomness. Two tools:
 * - `hashToUnit(seed, ...parts)`: a pure hash to [0, 1), for values that must be a
 *   function of where and when (a tile's terrain, the creature's step on a day).
 * - `createRng(seed)`: a fast sequential generator (mulberry32) for local use
 *   inside one call. Never store it in state.
 */

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

/** Hashes a seed and integer parts to an unsigned 32-bit integer. */
export const hashInts = (seed: number, ...parts: readonly number[]): number => {
  let h = seed | 0;
  for (const p of parts) h = mix(h, p);
  return finalise(h ^ parts.length);
};

/** Hashes a seed and integer parts to a number in [0, 1). */
export const hashToUnit = (seed: number, ...parts: readonly number[]): number =>
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
