import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS,
  hex,
  hexDistance,
  hexesInRange,
  hexKey,
  hexRing,
  isAdjacent,
  neighbour,
  neighbours,
  rotate,
} from '../src/index.ts';

describe('hex maths (axial, flat-top)', () => {
  it('has north, north-east and north-west as neighbours', () => {
    const o = hex(0, 0);
    expect(neighbour(o, 'n')).toEqual(hex(0, -1));
    expect(neighbour(o, 'ne')).toEqual(hex(1, -1));
    expect(neighbour(o, 'nw')).toEqual(hex(-1, 0));
    expect(neighbours(o)).toHaveLength(6);
    for (const n of neighbours(o)) expect(hexDistance(o, n)).toBe(1);
    expect(new Set(neighbours(o).map(hexKey)).size).toBe(6);
  });

  it('opposite directions cancel out', () => {
    for (const d of DIRECTIONS) {
      expect(neighbour(neighbour(hex(2, -3), d), rotate(d, 3))).toEqual(hex(2, -3));
    }
  });

  it('rotates clockwise and anticlockwise, wrapping around', () => {
    expect(rotate('n', 1)).toBe('ne');
    expect(rotate('n', -1)).toBe('nw');
    expect(rotate('nw', 1)).toBe('n');
    expect(rotate('s', 6)).toBe('s');
  });

  it('measures distance', () => {
    expect(hexDistance(hex(0, 0), hex(0, 0))).toBe(0);
    expect(hexDistance(hex(0, 0), hex(3, -1))).toBe(3);
    expect(hexDistance(hex(-2, 4), hex(1, -1))).toBe(5);
    expect(isAdjacent(hex(1, 1), hex(2, 0))).toBe(true);
    expect(isAdjacent(hex(1, 1), hex(1, 1))).toBe(false);
  });

  it('lists ranges and rings of the right size and distance', () => {
    const c = hex(3, -2);
    for (const r of [0, 1, 2, 5]) {
      const range = hexesInRange(c, r);
      expect(range).toHaveLength(1 + 3 * r * (r + 1));
      expect(new Set(range.map(hexKey)).size).toBe(range.length);
      expect(range.every((h) => hexDistance(h, c) <= r)).toBe(true);
      const ring = hexRing(c, r);
      expect(ring).toHaveLength(r === 0 ? 1 : 6 * r);
      expect(new Set(ring.map(hexKey)).size).toBe(ring.length);
      expect(ring.every((h) => hexDistance(h, c) === r)).toBe(true);
    }
  });

  it('has a stable string key', () => {
    expect(hexKey(hex(-3, 12))).toBe('-3,12');
  });
});
