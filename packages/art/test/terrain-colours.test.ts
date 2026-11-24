import { describe, expect, it } from 'vitest';
import { deltaE, lightness, VISION } from '../src/colourblind.ts';
import { PALETTES, SPRING, type Material, type Palette } from '../src/palette.ts';
import { terrainLook, TERRAIN_LOOKS } from '../src/terrain.ts';
import { SIX_TERRAINS } from '../src/review-terrain.ts';

/** Lightest to darkest, by ground colour. Value separates terrains first, hue second. */
const ORDER = ['desert', 'plains', 'lake', 'cliff', 'forest', 'swamp'] as const;
const MIN_GAP = 6;
const MIN_SIM_DELTA_E = 12;

const base = (p: Palette, terrain: string): string => p.ramps[terrainLook(terrain).ground].base;

describe('terrain colours', () => {
  for (const palette of PALETTES) {
    describe(palette.id, () => {
      it('orders the six terrains by lightness with a gap between neighbours', () => {
        const ls = ORDER.map((t) => lightness(base(palette, t)));
        for (let i = 1; i < ls.length; i += 1) {
          expect(ls[i - 1]! - ls[i]!, `${ORDER[i - 1]} over ${ORDER[i]}`).toBeGreaterThanOrEqual(
            MIN_GAP,
          );
        }
      });

      it('keeps every pair of terrains apart under protan and deutan vision', () => {
        for (const vision of VISION) {
          for (let i = 0; i < ORDER.length; i += 1) {
            for (let j = i + 1; j < ORDER.length; j += 1) {
              const d = deltaE(base(palette, ORDER[i]!), base(palette, ORDER[j]!), vision);
              expect(d, `${ORDER[i]} and ${ORDER[j]} (${vision})`).toBeGreaterThanOrEqual(
                MIN_SIM_DELTA_E,
              );
            }
          }
        }
      });

      it('keeps water the only blue ground', () => {
        const blueness = (hex: string): number => {
          const m = /^#(..)(..)(..)$/.exec(hex)!;
          return parseInt(m[3]!, 16) - Math.max(parseInt(m[1]!, 16), parseInt(m[2]!, 16));
        };
        for (const terrain of Object.keys(TERRAIN_LOOKS)) {
          const b = blueness(base(palette, terrain));
          if (terrainLook(terrain).ground === 'water') expect(b, terrain).toBeGreaterThan(15);
          else expect(b, terrain).toBeLessThan(15);
        }
      });
    });
  }

  it('gives each of the six terrains its own ground material', () => {
    const grounds = SIX_TERRAINS.map((t) => terrainLook(t).ground);
    expect(new Set(grounds).size).toBe(6);
  });

  it('gives each terrain a prop or a texture besides its colour', () => {
    for (const t of SIX_TERRAINS) {
      const look = terrainLook(t);
      expect(look.props.length > 0 || look.marks !== 'none' || look.river === true, t).toBe(true);
    }
  });

  it('keeps ground ramps light to dark and inside plausible bounds', () => {
    const grounds: Material[] = ['plain', 'wood', 'dune', 'crag', 'upland', 'mire', 'water'];
    for (const palette of PALETTES) {
      for (const g of grounds) {
        const { light, base: b, shade } = palette.ramps[g];
        expect(lightness(light), `${palette.id} ${g}`).toBeGreaterThan(lightness(b));
        expect(lightness(b), `${palette.id} ${g}`).toBeGreaterThan(lightness(shade));
        expect(lightness(shade), `${palette.id} ${g}`).toBeGreaterThan(30);
      }
    }
  });

  it('keeps the trodden overlay lighter than the darkest grounds', () => {
    const trodden = lightness(SPRING.ramps.trodden.base);
    for (const t of ['forest', 'swamp', 'cliff']) {
      expect(trodden).toBeGreaterThan(lightness(base(SPRING, t)));
    }
  });
});
