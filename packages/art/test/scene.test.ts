import { describe, expect, it } from 'vitest';
import { drawCreature, GENTLE_AMBLER, type CreatureLook } from '../src/creature.ts';
import { PALETTES, paletteColours, MORNING } from '../src/palette.ts';
import { DIRECTIONS, hexCenter, isometric, topDown } from '../src/projection.ts';
import { samplePatch } from '../src/sample.ts';
import { paperGrain, renderScene, renderSceneFramed } from '../src/scene.ts';
import { countNodes, el, toSvgString, walk, type SvgNode } from '../src/svg.ts';
import { riseFor } from '../src/props.ts';
import { FALLBACK_LOOK, TERRAIN_LOOKS, terrainLook } from '../src/terrain.ts';
import { bigScene } from './fixtures.ts';
import type { ArtCell } from '../src/tile.ts';

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
});

describe('the creature on the map', () => {
  const p = isometric();
  const inside = (
    pt: { x: number; y: number },
    poly: readonly { x: number; y: number }[],
  ): boolean => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!;
      const b = poly[j]!;
      if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x)
        c = !c;
    }
    return c;
  };
  /** Share of a hex's top face covered by the creature's drawn parts, sampled on a grid. */
  const coverage = (
    parts: readonly (readonly { x: number; y: number }[])[],
    q: number,
    r: number,
  ): number => {
    const ctr = hexCenter(p, q, r);
    let n = 0;
    let hit = 0;
    for (let i = -10; i <= 10; i += 1) {
      for (let j = -10; j <= 10; j += 1) {
        const x = i / 10;
        const y = (j / 10) * 0.866;
        if (Math.abs(x) + Math.abs(y) / Math.sqrt(3) > 1) continue;
        n += 1;
        const pt = { x: ctr.x + x * p.size, y: ctr.y + y * p.size * p.squash };
        if (parts.some((s) => inside(pt, s))) hit += 1;
      }
    }
    return hit / n;
  };
  const ring2: { q: number; r: number }[] = [];
  for (let q = -2; q <= 2; q += 1) {
    for (let r = -2; r <= 2; r += 1) {
      if ((Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 === 2) ring2.push({ q, r });
    }
  }

  it('stays mostly inside its footprint for every heading: no hex beyond it is covered even by a third', () => {
    for (const heading of DIRECTIONS) {
      const { silhouettes } = drawCreature(
        MORNING,
        GENTLE_AMBLER,
        hexCenter(p, 0, 0),
        p.size,
        p.squash,
        1.4,
        heading,
      );
      for (const h of ring2) {
        const share = coverage(silhouettes, h.q, h.r);
        expect(share, `heading ${heading.q},${heading.r} over ${h.q},${h.r}`).toBeLessThan(0.33);
        expect(silhouettes.some((s) => inside(hexCenter(p, h.q, h.r), s))).toBe(false);
      }
      // It still stands over the middle of its footprint.
      expect(coverage(silhouettes, 0, 0)).toBeGreaterThan(0.9);
    }
  });

  it('scale sizes it', () => {
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
    expect(width(0.5)).toBeCloseTo(width(1) / 2, -1);
  });

  it('draws its footprint hexes as trodden ground, and only those', () => {
    const cells: ArtCell[] = [];
    for (let q = -2; q <= 2; q += 1) {
      for (let r = -2; r <= 2; r += 1) {
        if ((Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 <= 2)
          cells.push({ q, r, terrain: 'plains', props: [] });
      }
    }
    const svg = (creature: boolean): string =>
      toSvgString(
        renderScene({
          ...sample(),
          cells,
          characters: [],
          creature: creature ? sample().creature : null,
        }),
      );
    expect(svg(true)).toContain(MORNING.ramps.trodden.base);
    expect(svg(false)).not.toContain(MORNING.ramps.trodden.base);
    // Seven tops in the trodden paint: one path with seven closed hexagons.
    const m = new RegExp(`<path d="([^"]+)" fill="${MORNING.ramps.trodden.base}"`).exec(svg(true));
    expect(m?.[1]?.split('Z').filter(Boolean).length).toBe(7);
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
