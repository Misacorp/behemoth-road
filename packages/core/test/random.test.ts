import { describe, expect, it } from 'vitest';
import {
  createRng,
  hashInts,
  hashToUnit,
  isSeed,
  newSeed,
  pickWeighted,
  type Seed,
  toSeed,
} from '../src/index.ts';

describe('seeded randomness', () => {
  const S: Seed = [7, 0x12345678, 0x9abcdef0, 0xdeadbeef];

  it('hashes deterministically into [0, 1), sensitive to every part', () => {
    expect(hashInts(S, 1, 2)).toBe(hashInts(S, 1, 2));
    expect(hashInts(S, 1, 2)).not.toBe(hashInts(S, 2, 1));
    expect(hashInts(S, 1, 2)).not.toBe(hashInts(S, 1, 2, 0));
    for (let i = 0; i < 1000; i++) {
      const x = hashToUnit(S, i, -i);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('depends on all 128 bits of the seed', () => {
    // Flipping any one bit of any word changes most outputs.
    for (let word = 0; word < 4; word++) {
      for (const bit of [0, 13, 31]) {
        const flipped = S.map((w, i) =>
          i === word ? (w ^ (1 << bit)) >>> 0 : w,
        ) as unknown as Seed;
        let differ = 0;
        for (let i = 0; i < 200; i++) if (hashInts(S, 5, i) !== hashInts(flipped, 5, i)) differ++;
        expect(differ).toBeGreaterThan(190);
      }
    }
  });

  it('makes seeds from numbers for tests, and fresh random ones', () => {
    expect(toSeed(5)).toEqual([5, 0, 0, 0]);
    expect(toSeed(S)).toBe(S);
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN]) expect(() => toSeed(bad)).toThrow(RangeError);
    expect(() => toSeed([1, 2, 3] as unknown as Seed)).toThrow(RangeError);
    expect(() => toSeed([1, 2, 3, -4] as unknown as Seed)).toThrow(RangeError);
    const a = newSeed();
    const b = newSeed();
    expect(isSeed(a)).toBe(true);
    expect(a).not.toEqual(b);
    expect(isSeed(JSON.parse(JSON.stringify(a)))).toBe(true);
  });

  it('repeats a generator sequence for the same seed', () => {
    const a = createRng(99);
    const b = createRng(99);
    const seqA = Array.from({ length: 20 }, a);
    expect(Array.from({ length: 20 }, b)).toEqual(seqA);
    expect(Array.from({ length: 20 }, createRng(100))).not.toEqual(seqA);
  });

  it('picks by weight and never picks a zero weight', () => {
    const items = ['a', 'b', 'c'] as const;
    const weights = { a: 1, b: 0, c: 3 };
    const rng = createRng(1);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) counts[pickWeighted(items, (x) => weights[x], rng())]++;
    expect(counts.b).toBe(0);
    expect(counts.c / counts.a).toBeGreaterThan(2.5);
    expect(counts.c / counts.a).toBeLessThan(3.5);
    expect(() => pickWeighted(items, () => 0, 0.5)).toThrow(RangeError);
  });
});
