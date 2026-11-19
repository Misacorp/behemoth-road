import { describe, expect, it } from 'vitest';
import { GENTLE_AMBLER, type CreatureLook } from '../src/creature.ts';
import { PALETTES, paletteColours, MORNING } from '../src/palette.ts';
import { isometric, topDown } from '../src/projection.ts';
import { samplePatch } from '../src/sample.ts';
import { renderScene } from '../src/scene.ts';
import { countNodes, toSvgString, walk, type SvgNode } from '../src/svg.ts';
import { FALLBACK_LOOK, TERRAIN_LOOKS, terrainLook } from '../src/terrain.ts';
import { bigScene } from './fixtures.ts';

const sample = (seed = 's') => {
  const { cells, creature, characters } = samplePatch();
  return { cells, creature, characters, projection: isometric(), palette: MORNING, seed };
};

describe('renderScene', () => {
  it('is deterministic: the same input draws the same SVG', () => {
    expect(toSvgString(renderScene(sample()))).toBe(toSvgString(renderScene(sample())));
    expect(toSvgString(renderScene(bigScene()))).toBe(toSvgString(renderScene(bigScene())));
  });

  it('changes with the seed', () => {
    expect(toSvgString(renderScene(sample('a')))).not.toBe(toSvgString(renderScene(sample('b'))));
  });

  it('keeps a tile the same when another tile is added', () => {
    const one = {
      ...sample(),
      cells: [{ q: 0, r: 0, terrain: 'forest' }],
      creature: null,
      characters: [],
    };
    const two = { ...one, cells: [...one.cells, { q: 6, r: 0, terrain: 'desert' }] };
    const objects = (svg: SvgNode): string[] => {
      const out: string[] = [];
      walk(svg, (n) => {
        if (String(n.attrs.filter ?? '').includes('ink'))
          walk(n, (c) => c.attrs.d && out.push(String(c.attrs.d)));
      });
      return out;
    };
    const forest = objects(renderScene(one));
    expect(forest.length).toBeGreaterThan(0);
    const both = new Set(objects(renderScene(two)));
    for (const d of forest) expect(both.has(d)).toBe(true);
  });

  it('never writes NaN, undefined or Infinity', () => {
    const svgs = [
      ...PALETTES.map((palette) => toSvgString(renderScene({ ...sample(), palette }))),
      toSvgString(renderScene({ ...sample(), projection: topDown() })),
      toSvgString(renderScene({ ...sample(), projection: isometric(64, 0.5) })),
      toSvgString(renderScene(bigScene())),
    ];
    for (const svg of svgs) expect(svg).not.toMatch(/NaN|undefined|Infinity|null/);
  });

  it('stays under the node budget for a 91-hex isometric scene (measured 837)', () => {
    expect(countNodes(renderScene(bigScene()))).toBeLessThanOrEqual(1250);
  });

  it('is self-contained: every url(#id) refers to a definition in the same SVG, and there is no text', () => {
    const svg = toSvgString(renderScene(sample()));
    const ids = new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids.has(m[1])).toBe(true);
    expect(svg).not.toMatch(/<text|<image|href=/);
  });

  it('uses only palette colours', () => {
    for (const palette of PALETTES) {
      const allowed = paletteColours(palette);
      walk(renderScene({ ...sample(), palette }), (node) => {
        for (const [name, value] of Object.entries(node.attrs)) {
          if (!['fill', 'stroke', 'stop-color', 'flood-color', 'color'].includes(name)) continue;
          const v = String(value).toLowerCase();
          if (v === 'none' || v.startsWith('url(#')) continue;
          expect(allowed.has(v), `${name}=${v} in ${palette.id}`).toBe(true);
        }
      });
    }
  });

  it('draws every creature part variant', () => {
    const variants: CreatureLook[] = [
      GENTLE_AMBLER,
      {
        ...GENTLE_AMBLER,
        body: 'long',
        legs: 'tall',
        markings: 'stripes',
        ears: 'round',
        horns: 'none',
        back: 'bare',
        tail: 'short',
      },
      { ...GENTLE_AMBLER, markings: 'none' },
    ];
    for (const look of variants) {
      const svg = toSvgString(
        renderScene({ ...sample(), creature: { q: 0, r: 0, facing: 'left', look } }),
      );
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });
});

describe('terrain looks', () => {
  it('has a look for every terrain in the sample, and unknown ids fall back to the neutral look', () => {
    for (const cell of samplePatch().cells)
      expect(Object.hasOwn(TERRAIN_LOOKS, cell.terrain)).toBe(true);
    expect(terrainLook('no-such-terrain')).toBe(FALLBACK_LOOK);
    expect(terrainLook('constructor')).toBe(FALLBACK_LOOK);
  });

  it('draws an unknown terrain without failing', () => {
    const svg = toSvgString(
      renderScene({
        ...sample(),
        cells: [{ q: 0, r: 0, terrain: 'mystery' }],
        creature: null,
        characters: [],
      }),
    );
    expect(svg).toContain(MORNING.ramps.neutral.base);
  });
});
