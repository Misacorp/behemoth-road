import { describe, expect, it } from 'vitest';
import {
  BRAZIER_HEIGHT,
  BURNT_LOOKS,
  drawBrazier,
  drawBurnableMark,
  drawBurnt,
  drawFearsFireMark,
  drawFireRing,
  drawNightsLeft,
  drawPinned,
  FIRE_MOMENT_KINDS,
} from '../src/fire-art.ts';
import { drawIcon } from '../src/icons.ts';
import { drawMoment, MOMENT_KINDS } from '../src/marks.ts';
import { MIST, MORNING, PALETTES, paletteColours, SPRING, type Palette } from '../src/palette.ts';
import { isometric } from '../src/projection.ts';
import { buildReviewItems } from '../src/review.ts';
import { el, toSvgString, walk, type SvgNode } from '../src/svg.ts';

/** Every colour is the palette's, the tree serialises, no bad numbers, no text. */
function within(node: SvgNode, palette: Palette = SPRING): void {
  const allowed = paletteColours(palette);
  walk(node, (n) => {
    for (const name of ['fill', 'stroke']) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none')
        expect(allowed.has(v.toLowerCase()), `${name}=${v}`).toBe(true);
    }
  });
  const svg = toSvgString(node);
  expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  expect(svg).not.toMatch(/<text/);
}

const svgOf = (nodes: SvgNode[]): string => toSvgString(el('g', {}, nodes));
const count = (node: SvgNode, key: string, value: string): number => {
  let n = 0;
  walk(node, (x) => {
    if (x.attrs[key] === value) n += 1;
  });
  return n;
};

describe('brazier', () => {
  for (const palette of PALETTES) {
    for (const lit of [false, true]) {
      it(`draws ${lit ? 'lit' : 'cold'} in ${palette.id} palette colours`, () => {
        const d = drawBrazier(palette, { lit, nightsLeft: 2, origin: { x: 100, y: 120 }, seed: 1 });
        expect(d.nodes.length).toBeGreaterThan(5);
        within(el('g', {}, d.nodes), palette);
      });
    }
  }

  it('is deterministic for a seed and varies between seeds', () => {
    const a = svgOf(drawBrazier(SPRING, { lit: true, seed: 1 }).nodes);
    expect(svgOf(drawBrazier(SPRING, { lit: true, seed: 1 }).nodes)).toBe(a);
    expect(svgOf(drawBrazier(SPRING, { lit: true, seed: 2 }).nodes)).not.toBe(a);
  });

  it('lit has a flame and a glow, cold has neither; notches follow nights left', () => {
    const lit = el('g', {}, drawBrazier(SPRING, { lit: true, nightsLeft: 3 }).nodes);
    const cold = el('g', {}, drawBrazier(SPRING, { lit: false, nightsLeft: 3 }).nodes);
    expect(count(lit, 'data-fire', 'flame')).toBeGreaterThan(0);
    expect(count(lit, 'data-fire', 'glow')).toBeGreaterThan(0);
    expect(count(cold, 'data-fire', 'flame')).toBe(0);
    expect(count(cold, 'data-fire', 'glow')).toBe(0);
    const nights = (n: number): string =>
      svgOf(drawBrazier(SPRING, { lit: true, nightsLeft: n }).nodes);
    expect(new Set([0, 1, 2, 3, 4].map(nights)).size).toBe(5);
    // Out-of-range and bad values clamp, they never throw.
    expect(nights(9)).toBe(nights(4));
    expect(nights(Number.NaN)).toBe(nights(0));
    // Cold ignores nights: the same ash whatever is passed.
    expect(svgOf(drawBrazier(SPRING, { lit: false, nightsLeft: 1 }).nodes)).toBe(
      svgOf(drawBrazier(SPRING, { lit: false, nightsLeft: 3 }).nodes),
    );
  });

  it('cold and stocked lays sticks in the bowl instead of ash; lit ignores it', () => {
    const stocked = el('g', {}, drawBrazier(SPRING, { lit: false, stocked: true, seed: 1 }).nodes);
    const plain = el('g', {}, drawBrazier(SPRING, { lit: false, seed: 1 }).nodes);
    expect(count(stocked, 'data-stocked', 'true')).toBe(1);
    expect(count(plain, 'data-stocked', 'true')).toBe(0);
    within(stocked, SPRING);
    expect(svgOf(drawBrazier(SPRING, { lit: true, stocked: true, seed: 1 }).nodes)).toBe(
      svgOf(drawBrazier(SPRING, { lit: true, seed: 1 }).nodes),
    );
  });

  it('is tall: its box rises well above a hex-wide footing, and scales with k', () => {
    const one = drawBrazier(SPRING, { lit: false, k: 1 });
    expect(one.box.y1 - one.box.y0).toBeGreaterThan(BRAZIER_HEIGHT * 0.8);
    const two = drawBrazier(SPRING, { lit: false, k: 2 });
    expect(two.box.y1 - two.box.y0).toBeGreaterThan((one.box.y1 - one.box.y0) * 1.7);
    for (const v of Object.values(one.box)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('nights-left mark', () => {
  it('shows one lit ember per night, four slots, no numbers', () => {
    for (const n of [0, 1, 2, 3, 4]) {
      const m = drawNightsLeft(SPRING, n, 30);
      expect(count(m, 'data-ember', 'lit')).toBe(n);
      expect(count(m, 'data-ember', 'spent')).toBe(4 - n);
      within(m);
    }
    expect(drawNightsLeft(SPRING, 7).children).toEqual(drawNightsLeft(SPRING, 4).children);
  });

  it('sizes itself, falling back on a bad size', () => {
    expect(drawNightsLeft(SPRING, 2, 40).attrs.height).toBe(40);
    expect(drawNightsLeft(SPRING, 2, 40).attrs.width).toBe(120);
    expect(drawNightsLeft(SPRING, 2, Number.NaN).attrs.height).toBe(24);
  });
});

describe('fire ring', () => {
  const p = isometric(64);
  it('covers the hexes within the radius and nothing else, in the palette', () => {
    const one = drawFireRing(p, { q: 2, r: -1 }, SPRING);
    expect(one.attrs['data-fire-ring']).toBe('2,-1');
    within(one);
    const fillOf = (n: SvgNode): string => String(n.children[0]!.attrs.d);
    // Seven hexes at radius 1, nineteen at radius 2.
    expect(fillOf(one).match(/M/g)).toHaveLength(7);
    expect(fillOf(drawFireRing(p, { q: 0, r: 0 }, SPRING, 2)).match(/M/g)).toHaveLength(19);
    expect(fillOf(drawFireRing(p, { q: 0, r: 0 }, SPRING, 0)).match(/M/g)).toHaveLength(1);
  });

  it('draws only the outer edge as a line (18 edges for radius 1) and stays faint', () => {
    const ring = drawFireRing(p, { q: 0, r: 0 }, MIST);
    const rim = ring.children[1]!;
    expect(String(rim.attrs.d).match(/M/g)).toHaveLength(18);
    expect(Number(ring.children[0]!.attrs.opacity)).toBeLessThanOrEqual(0.2);
    expect(Number(rim.attrs.opacity)).toBeLessThanOrEqual(0.5);
  });

  it('moves with the hex and survives bad radii', () => {
    const a = toSvgString(drawFireRing(p, { q: 0, r: 0 }, SPRING));
    expect(toSvgString(drawFireRing(p, { q: 1, r: 0 }, SPRING))).not.toBe(a);
    expect(toSvgString(drawFireRing(p, { q: 0, r: 0 }, SPRING, Number.NaN))).not.toMatch(/NaN/);
  });
});

describe('marks', () => {
  for (const palette of [SPRING, MORNING, MIST]) {
    it(`fears-fire and burnable draw in ${palette.id} colours, each different`, () => {
      const a = drawFearsFireMark(palette, 48);
      const b = drawBurnableMark(palette, 48);
      within(a, palette);
      within(b, palette);
      expect(toSvgString(a)).not.toBe(toSvgString(b));
      expect(a.attrs.width).toBe(48);
      expect(drawBurnableMark(palette, -3).attrs.width).toBe(24);
    });
  }
});

describe('pinned', () => {
  it('draws rocks over a standee, in the palette, deterministic, within a sensible box', () => {
    for (const palette of PALETTES) {
      const d = drawPinned(palette, { x: 50, y: 100 }, 150, 0.8, 1.6);
      within(el('g', {}, d.nodes), palette);
      expect(d.box.x0).toBeLessThan(50);
      expect(d.box.x1).toBeGreaterThan(50);
      expect(d.box.y0).toBeLessThan(100);
    }
    const a = svgOf(drawPinned(SPRING, { x: 0, y: 0 }, 100, 0.8, 1.4).nodes);
    expect(svgOf(drawPinned(SPRING, { x: 0, y: 0 }, 100, 0.8, 1.4).nodes)).toBe(a);
  });

  it('scales with the character size', () => {
    const small = drawPinned(SPRING, { x: 0, y: 0 }, 60, 0.8, 1);
    const big = drawPinned(SPRING, { x: 0, y: 0 }, 120, 0.8, 1);
    expect(big.box.x1 - big.box.x0).toBeGreaterThan((small.box.x1 - small.box.x0) * 1.8);
  });
});

describe('burnt', () => {
  it('draws both looks in every palette, differing from each other and by seed', () => {
    for (const palette of PALETTES)
      for (const look of BURNT_LOOKS)
        within(el('g', {}, drawBurnt(palette, look, { seed: 1 }).nodes), palette);
    const dead = svgOf(drawBurnt(SPRING, 'deadfall', { seed: 1 }).nodes);
    expect(svgOf(drawBurnt(SPRING, 'deadfall', { seed: 1 }).nodes)).toBe(dead);
    expect(svgOf(drawBurnt(SPRING, 'snare', { seed: 1 }).nodes)).not.toBe(dead);
    expect(svgOf(drawBurnt(SPRING, 'unknown', { seed: 1 }).nodes)).toBe(dead);
  });

  it('is low: lower than a brazier and within a hex', () => {
    const d = drawBurnt(SPRING, 'deadfall', { k: 1 });
    expect(d.box.x1 - d.box.x0).toBeLessThanOrEqual(64 * 2 * 0.75);
    expect(d.box.y1 - d.box.y0).toBeLessThan(20);
  });
});

describe('rockslide moment and dig-out icon', () => {
  it('is a registered moment with three parts, in every palette', () => {
    for (const kind of FIRE_MOMENT_KINDS) expect(MOMENT_KINDS).toContain(kind);
    for (const palette of PALETTES) {
      const m = drawMoment('rockslide', palette, 96);
      within(m, palette);
      const parts = new Set<string>();
      walk(m, (n) => {
        if (typeof n.attrs['data-part'] === 'string') parts.add(n.attrs['data-part']);
      });
      expect([...parts].sort()).toEqual(['0', '1', '2']);
    }
    expect(toSvgString(drawMoment('rockslide', SPRING, 96))).not.toBe(
      toSvgString(drawMoment('reveal', SPRING, 96)),
    );
  });

  it('draws dig-out as an action icon, different from light-fire, within the palette', () => {
    for (const palette of PALETTES) within(drawIcon('dig-out', palette, 48), palette);
    expect(toSvgString(drawIcon('dig-out', SPRING, 48))).not.toBe(
      toSvgString(drawIcon('light-fire', SPRING, 48)),
    );
    expect(toSvgString(drawIcon('dig-out', SPRING, 48))).not.toBe(
      toSvgString(drawIcon('no-such-action', SPRING, 48)),
    );
  });
});

describe('review sheets', () => {
  it('adds the fire items with unique ids, files and clean svg', () => {
    const items = buildReviewItems().filter((i) => i.id.startsWith('fire/'));
    expect(items.map((i) => i.id)).toEqual([
      'fire/brazier',
      'fire/ring',
      'fire/marks',
      'fire/pinned-burnt',
    ]);
    for (const i of items) {
      expect(i.svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(i.svg.startsWith('<svg')).toBe(true);
    }
  });
});
