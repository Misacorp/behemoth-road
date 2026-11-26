import { describe, expect, it } from 'vitest';
import {
  hex,
  hexesInRange,
  hexKey,
  neighbours,
  TERRAIN_GENERATION,
  TERRAIN_TYPES,
  terrainAt,
} from '../src/index.ts';

const SEEDS = [1, 2, 3, 4, 5];
const area = hexesInRange(hex(0, 0), 40);

/** Terrain ids over the test area, by hex key. */
const survey = (seed: number) => new Map(area.map((h) => [hexKey(h), terrainAt(seed, h).id]));

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
    const a = area.map((h) => terrainAt(1, h).id);
    const b = area.map((h) => terrainAt(2, h).id);
    expect(a).not.toEqual(b);
  });

  it('only places terrain that exists in the content', () => {
    const ids = new Set(TERRAIN_TYPES.map((t) => t.id));
    expect(ids.has(TERRAIN_GENERATION.fallback)).toBe(true);
    for (const rule of TERRAIN_GENERATION.rules) expect(ids.has(rule.terrain)).toBe(true);
  });

  it('gives every terrain a whole, non-negative extra move cost', () => {
    // Path search needs every step to cost at least something: base cost >= 1, extras >= 0.
    for (const t of TERRAIN_TYPES) {
      expect(Number.isInteger(t.extraMoveCost)).toBe(true);
      expect(t.extraMoveCost).toBeGreaterThanOrEqual(0);
    }
  });

  it('is mostly plain, with every terrain present', () => {
    for (const seed of SEEDS) {
      const counts = new Map<string, number>();
      for (const id of survey(seed).values()) counts.set(id, (counts.get(id) ?? 0) + 1);
      const plains = (counts.get('plains') ?? 0) / area.length;
      expect(plains).toBeGreaterThan(0.58);
      expect(plains).toBeLessThan(0.78);
      // Hazard terrain is laid across the route as the creature walks, not by the generation rules.
      for (const t of TERRAIN_TYPES.filter((x) => x.perilOnStep === undefined)) {
        expect(counts.get(t.id) ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('forms regions: neighbouring hexes agree far more often than chance', () => {
    for (const seed of SEEDS) {
      const terrain = survey(seed);
      const counts = new Map<string, number>();
      for (const id of terrain.values()) counts.set(id, (counts.get(id) ?? 0) + 1);
      // Chance agreement: two independent hexes share a terrain with probability sum(p²).
      const chance = [...counts.values()].reduce((s, n) => s + (n / area.length) ** 2, 0);
      let agree = 0;
      let pairs = 0;
      for (const h of area) {
        for (const n of neighbours(h)) {
          const other = terrain.get(hexKey(n));
          if (other === undefined) continue;
          pairs++;
          if (other === terrain.get(hexKey(h))) agree++;
        }
      }
      expect(agree / pairs).toBeGreaterThan(chance + 0.15);
    }
  });

  it('draws rivers as connected ribbons, not single hexes', () => {
    for (const seed of SEEDS) {
      const terrain = survey(seed);
      const rivers = area.filter((h) => terrain.get(hexKey(h)) === 'river');
      const joined = rivers.filter((h) =>
        neighbours(h).some((n) => terrainAt(seed, n).id === 'river'),
      );
      expect(rivers.length).toBeGreaterThan(0);
      expect(joined.length / rivers.length).toBeGreaterThan(0.95);
    }
  });

  it('crosses a river every few dozen hexes of walking north', () => {
    for (const seed of SEEDS) {
      let crossings = 0;
      let before = false;
      for (let r = 0; r > -300; r--) {
        const river = terrainAt(seed, hex(0, r)).id === 'river';
        if (river && !before) crossings++;
        before = river;
      }
      expect(crossings).toBeGreaterThanOrEqual(6);
      expect(crossings).toBeLessThanOrEqual(40);
    }
  });
});
