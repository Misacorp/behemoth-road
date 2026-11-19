import { describe, expect, it } from 'vitest';
import { hex, hexesInRange, TERRAIN_TYPES, terrainAt } from '../src/index.ts';

describe('map generation', () => {
  it('gives each tile the same terrain whenever and in whatever order it is asked', () => {
    const hexes = hexesInRange(hex(10, -40), 6);
    const first = hexes.map((h) => terrainAt(5, h).id);
    const reversed = hexes
      .slice()
      .reverse()
      .map((h) => terrainAt(5, h).id)
      .reverse();
    expect(reversed).toEqual(first);
  });

  it('differs between seeds', () => {
    const hexes = hexesInRange(hex(0, 0), 5);
    const a = hexes.map((h) => terrainAt(1, h).id);
    const b = hexes.map((h) => terrainAt(2, h).id);
    expect(a).not.toEqual(b);
  });

  it('follows the content weights: mostly plain, every type present', () => {
    const counts = new Map<string, number>();
    const hexes = hexesInRange(hex(0, 0), 40);
    for (const h of hexes) {
      const id = terrainAt(3, h).id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const total = TERRAIN_TYPES.reduce((s, t) => s + t.weight, 0);
    for (const t of TERRAIN_TYPES) {
      const share = (counts.get(t.id) ?? 0) / hexes.length;
      expect(Math.abs(share - t.weight / total)).toBeLessThan(0.02);
    }
  });
});
