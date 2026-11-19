import { describe, expect, it } from 'vitest';
import {
  hex,
  hexDistance,
  hexesInRange,
  neighbours,
  noiseAt as noiseOf,
  type NoiseField,
  toSeed,
} from '../src/index.ts';

const noiseAt = (seed: number, stream: number, f: NoiseField, h: { q: number; r: number }) =>
  noiseOf(toSeed(seed), stream, f, h);

const field = { scale: 10, octaves: 2 };

describe('value noise', () => {
  it('is pure, in [0, 1), and differs between seeds and streams', () => {
    const hexes = hexesInRange(hex(-7, 30), 8);
    const a = hexes.map((h) => noiseAt(1, 0, field, h));
    expect(hexes.map((h) => noiseAt(1, 0, field, h))).toEqual(a);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hexes.map((h) => noiseAt(2, 0, field, h))).not.toEqual(a);
    expect(hexes.map((h) => noiseAt(1, 9, field, h))).not.toEqual(a);
  });

  it('changes little between neighbours compared with distant hexes', () => {
    const near: number[] = [];
    const far: number[] = [];
    for (const h of hexesInRange(hex(0, 0), 20)) {
      const v = noiseAt(3, 0, field, h);
      near.push(Math.abs(v - noiseAt(3, 0, field, neighbours(h)[0]!)));
      const away = hex(h.q + 37, h.r - 11);
      expect(hexDistance(h, away)).toBeGreaterThan(30);
      far.push(Math.abs(v - noiseAt(3, 0, field, away)));
    }
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(near) * 3).toBeLessThan(mean(far));
  });
});
