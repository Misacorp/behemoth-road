import { describe, expect, it } from 'vitest';
import { GENTLE_AMBLER, type CreatureLook } from '../src/creature.ts';
import { PALETTES, paletteColours, MORNING } from '../src/palette.ts';
import { DIRECTIONS, isometric, topDown } from '../src/projection.ts';
import { samplePatch } from '../src/sample.ts';
import { paperGrain, renderScene, renderSceneFramed } from '../src/scene.ts';
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

  it('stays under the node budget for a 91-hex isometric scene (measured 859)', () => {
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
      for (const heading of DIRECTIONS) {
        const svg = toSvgString(
          renderScene({ ...sample(), creature: { q: 0, r: 0, heading, look } }),
        );
        expect(svg).not.toMatch(/NaN|undefined/);
      }
    }
  });
});

describe('scene options', () => {
  it('rejects an idPrefix that could break out of an id', () => {
    for (const idPrefix of ['a b', 'x)', 'a"', '', 'é']) {
      expect(() => renderScene({ ...sample(), idPrefix }), idPrefix).toThrow(/idPrefix/);
    }
    expect(() => renderScene({ ...sample(), idPrefix: 'map_2-a' })).not.toThrow();
  });

  it('reports its frame as numbers matching the viewBox', () => {
    const { svg, viewBox } = renderSceneFramed(sample());
    expect(svg.attrs.viewBox).toBe(`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    expect(svg.attrs.width).toBe(viewBox.width);
    expect(toSvgString(svg)).toBe(toSvgString(renderScene(sample())));
  });

  it('ignores zoom and minInkPx that are not finite positive numbers', () => {
    const plain = toSvgString(renderScene(sample()));
    for (const zoom of [Number.NaN, Infinity, -1, 0]) {
      expect(toSvgString(renderScene({ ...sample(), zoom }))).toBe(plain);
    }
    for (const minInkPx of [Number.NaN, Infinity, -2]) {
      expect(toSvgString(renderScene({ ...sample(), minInkPx }))).toBe(plain);
    }
  });

  it('lite effects leave out the filters but keep the drawing', () => {
    const full = toSvgString(renderScene(sample()));
    const lite = toSvgString(renderScene({ ...sample(), effects: 'lite' }));
    expect(full).toMatch(/<filter/);
    expect(lite).not.toMatch(/<filter|filter=/);
    expect(countNodes(renderScene({ ...sample(), effects: 'lite' }))).toBeLessThan(
      countNodes(renderScene(sample())),
    );
  });

  it('holds ink at its minimum width on screen when zoomed out', () => {
    const widths = (zoom: number): number[] => {
      const out: number[] = [];
      walk(renderScene({ ...sample(), zoom }), (n) => {
        if (n.attrs.stroke === MORNING.ink && n.attrs['stroke-width'] !== undefined)
          out.push(Number(n.attrs['stroke-width']));
      });
      return out;
    };
    const near = Math.max(...widths(1));
    const far = widths(0.4);
    expect(Math.min(...far) * 0.4).toBeGreaterThanOrEqual(0.5);
    expect(Math.max(...far)).toBeGreaterThan(near);
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

describe('scene frame', () => {
  const rects = (node: SvgNode): SvgNode[] => node.children.filter((c) => c.tag === 'rect');

  it("draws the page (paper, vignette, grain) by default and leaves it out with frame 'none'", () => {
    const page = renderScene(sample());
    expect(rects(page)).toHaveLength(3);
    const none = renderScene({ ...sample(), frame: 'none' });
    expect(rects(none)).toHaveLength(0);
    // Everything else is the same drawing.
    expect(none.children.filter((c) => c.tag !== 'rect')).toEqual(
      page.children.filter((c) => c.tag !== 'rect'),
    );
    // The grain filter is still defined, for a screen-space `paperGrain`.
    expect(toSvgString(none)).toContain('id="br-grain"');
  });

  it('paperGrain fills its viewport by default and matches the in-scene grain otherwise', () => {
    expect(paperGrain(MORNING).attrs).toMatchObject({
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      filter: 'url(#br-grain)',
    });
    const { svg, viewBox } = renderSceneFramed(sample());
    expect(svg.children.at(-1)).toEqual(paperGrain(MORNING, 'br', viewBox));
  });
});
