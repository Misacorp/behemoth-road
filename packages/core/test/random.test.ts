import { describe, expect, it } from 'vitest';
import { createRng, hashInts, hashToUnit, pickWeighted } from '../src/index.ts';

describe('seeded randomness', () => {
  it('hashes deterministically into [0, 1), sensitive to every part', () => {
    expect(hashInts(7, 1, 2)).toBe(hashInts(7, 1, 2));
    expect(hashInts(7, 1, 2)).not.toBe(hashInts(7, 2, 1));
    expect(hashInts(7, 1, 2)).not.toBe(hashInts(8, 1, 2));
    for (let i = 0; i < 1000; i++) {
      const x = hashToUnit(42, i, -i);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
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
