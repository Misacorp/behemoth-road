import { describe, expect, it } from 'vitest';
import { drawCreature, GENTLE_AMBLER, type CreatureLook } from '../src/creature.ts';
import { PALETTES, paletteColours, MORNING } from '../src/palette.ts';
import { DIRECTIONS, isometric, topDown } from '../src/projection.ts';
import { samplePatch } from '../src/sample.ts';
import { paperGrain, renderScene, renderSceneFramed, type SceneInput } from '../src/scene.ts';
import { countNodes, el, toSvgString, walk, type SvgNode } from '../src/svg.ts';
import { riseFor } from '../src/props.ts';
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

  it('stays under the node budget for a 91-hex isometric scene (measured 879)', () => {
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
        body: 'longneck',
        markings: 'none',
        horns: 'none',
        back: 'bare',
        tail: 'plain',
      },
      { ...GENTLE_AMBLER, body: 'low', back: 'moss', scale: 0.6 },
      { ...GENTLE_AMBLER, scale: Number.NaN },
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

describe('the creature', () => {
  it('fills its seven-hex footprint at scale 1, and scale sizes it', () => {
    const p = isometric();
    const width = (scale: number): number => {
      const { box } = drawCreature(
        MORNING,
        { ...GENTLE_AMBLER, scale },
        { x: 0, y: 0 },
        p.size,
        p.squash,
        1.4,
        { q: 1, r: 0 },
      );
      return box.x1 - box.x0;
    };
    // The footprint is about three hexes (about 4 hex sizes) across; head and tail reach past it.
    expect(width(1)).toBeGreaterThan(4 * p.size);
    expect(width(0.5)).toBeCloseTo(width(1) / 2, -1);
  });

  it('draws a character on its back over it, with a contact shadow', () => {
    const cells = [{ q: 0, r: 0 }, ...DIRECTIONS].map((h) => ({
      ...h,
      terrain: 'plains',
      props: [],
    }));
    const base: SceneInput = { ...sample(), cells, characters: [] };
    const on: SceneInput = { ...base, characters: [{ id: 'c', q: 1, r: 0, accent: 'teal' }] };
    const objects = (input: SceneInput): SvgNode[] => {
      let layer: SvgNode | undefined;
      walk(renderScene(input), (n) => {
        if (n.attrs['data-layer'] === 'objects') layer = n;
      });
      return [...(layer?.children ?? [])];
    };
    const without = objects(base);
    const withChar = objects(on);
    // Everything the creature scene drew comes first; the character (and its shadow) after it.
    expect(withChar.slice(0, without.length).map((n) => n.attrs.d)).toEqual(
      without.map((n) => n.attrs.d),
    );
    const extra = withChar.slice(without.length);
    expect(extra[0]?.attrs.fill).toBe(MORNING.shadow);
    expect(Number(extra[0]?.attrs.opacity)).toBeGreaterThan(0.3);
  });
});

describe('creature guards and back order', () => {
  it('faces north for a heading that is zero or not a number, and survives a bad squash', () => {
    const draw = (heading: { q: number; r: number }, squash = 0.8): string =>
      toSvgString(
        el(
          'g',
          {},
          drawCreature(MORNING, GENTLE_AMBLER, { x: 0, y: 0 }, 64, squash, 1.4, heading).nodes,
        ),
      );
    const north = draw({ q: 0, r: -1 });
    expect(draw({ q: Number.NaN, r: 0 })).toBe(north);
    expect(draw({ q: 0, r: 0 })).toBe(north);
    expect(draw({ q: Infinity, r: -1 })).toBe(north);
    expect(draw({ q: 0, r: -1 }, Number.NaN)).not.toMatch(/NaN|Infinity/);
  });

  it('orders characters on its back by their own depth, not by list order', () => {
    const cells = [{ q: 0, r: 0 }, ...DIRECTIONS].map((h) => ({
      ...h,
      terrain: 'plains',
      props: [],
    }));
    const back = { id: 'back', q: 0, r: -1, accent: 'teal' };
    const front = { id: 'front', q: 0, r: 1, accent: 'plum' };
    const order = (characters: (typeof back)[]): string[] => {
      const out: string[] = [];
      walk(renderScene({ ...sample(), cells, characters }), (n) => {
        if (n.attrs.fill === MORNING.accents.teal.base) out.push('back');
        if (n.attrs.fill === MORNING.accents.plum.base) out.push('front');
      });
      return out;
    };
    expect(order([front, back])).toEqual(['back', 'front']);
    expect(order([back, front])).toEqual(['back', 'front']);
  });
});

describe('riseFor', () => {
  it('is 1 at the reference tilt, 0.875 at 0.8 and shrinks towards top-down', () => {
    expect(riseFor(0.6)).toBeCloseTo(1, 6);
    expect(riseFor(0.8)).toBeCloseTo(0.875, 6);
    expect(riseFor(1)).toBeCloseTo(0.5, 6);
    expect(riseFor(0.3)).toBe(1);
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
