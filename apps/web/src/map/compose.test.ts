import {
  hexCenter,
  hexCorners,
  isometric,
  MORNING,
  renderScene,
  samplePatch,
} from '@behemoth-road/art';
import { describe, expect, it } from 'vitest';
import {
  chevronFor,
  trailClear,
  overlaps,
  placeClear,
  placePopover,
  type Polygon,
  splitScene,
} from './compose.ts';
import { MAP_TUNING } from './config.ts';

describe('scene layers', () => {
  it('splits the ground from the figures layer, keeping every node', () => {
    const scene = renderScene({
      ...samplePatch(),
      projection: isometric(),
      palette: MORNING,
      seed: 1,
      frame: 'none',
    });
    const layers = splitScene(scene);
    expect(layers.figures[0]?.attrs['data-layer']).toBe('objects');
    expect(layers.ground[0]?.tag).toBe('defs');
    expect([...layers.ground, ...layers.figures]).toEqual(scene.children);
  });
});

describe('popover placement', () => {
  const screen = { width: 390, height: 844 };
  const size = { width: 132, height: 76 };

  it('sits centred above the hex', () => {
    expect(placePopover({ x: 200, y: 400 }, 40, size, screen, 10)).toEqual({
      x: 134,
      y: 318,
      ...size,
    });
  });

  it('flips below the hex when there is no room above', () => {
    expect(placePopover({ x: 200, y: 50 }, 40, size, screen, 10).y).toBe(96);
  });

  it('goes below when asked and there is room, else above', () => {
    expect(placePopover({ x: 200, y: 400 }, 40, size, screen, 10, 'below').y).toBe(446);
    expect(placePopover({ x: 200, y: 780 }, 40, size, screen, 10, 'below').y).toBe(698);
  });

  it('stays on screen at the edges', () => {
    const left = placePopover({ x: 5, y: 400 }, 40, size, screen, 10);
    expect(left.x).toBe(10);
    const right = placePopover({ x: 389, y: 400 }, 40, size, screen, 10);
    expect(right.x + right.width).toBe(380);
    const bottom = placePopover({ x: 200, y: 900 }, 40, size, screen, 10);
    expect(bottom.y + bottom.height).toBeLessThanOrEqual(834);
  });
});

describe('popover chevron', () => {
  const tip = (d: string) => d.split('L')[1]!.split(' ').map(Number) as [number, number];
  const screen = { width: 390, height: 844 };
  const size = { width: 132, height: 76 };

  it('points down at the thing from a card above it, at its x', () => {
    const anchor = { x: 200, y: 400 };
    const rect = placePopover(anchor, 40, size, screen, 10);
    const c = chevronFor(rect, anchor, 40);
    const [x, y] = tip(c.fill);
    expect(rect.x + x).toBeCloseTo(200, 0);
    expect(rect.y + y).toBeGreaterThan(rect.y + rect.height - 2);
    expect(rect.y + y).toBeLessThanOrEqual(anchor.y);
  });

  it('points up from a card below the thing', () => {
    const anchor = { x: 200, y: 50 };
    const rect = placePopover(anchor, 40, size, screen, 10);
    const [, y] = tip(chevronFor(rect, anchor, 40).fill);
    expect(y).toBeLessThan(0);
    expect(rect.y + y).toBeGreaterThanOrEqual(anchor.y + 40);
  });

  it('slides along the edge when the card is clamped, but stays clear of the corners', () => {
    const near = { x: 30, y: 400 };
    const rect = placePopover(near, 40, size, screen, 10);
    expect(rect.x + tip(chevronFor(rect, near, 40).fill)[0]).toBeCloseTo(36, 0);
    const edge = { x: 2, y: 400 };
    const clamped = placePopover(edge, 40, size, screen, 10);
    expect(tip(chevronFor(clamped, edge, 40).fill)[0]).toBe(26);
  });
});

describe('a card on your own hex', () => {
  // The map's projection at a phone's first zoom (about 3.5 hexes around you on a 390 px screen).
  const p = isometric(MAP_TUNING.hexSize, MAP_TUNING.tilt);
  const screen = { width: 390, height: 844 };
  const scale = 390 / ((MAP_TUNING.fitRadius * 2 * 1.5 + 2) * p.size);
  const ring = [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ] as const;
  /** Your hex and its six neighbours on screen, your hex's centre at `at`. */
  const around = (at: { x: number; y: number }): Polygon[] =>
    ring.map(([q, r]) =>
      hexCorners(p, hexCenter(p, q, r)).map((c) => ({
        x: at.x + c.x * scale,
        y: at.y + c.y * scale,
      })),
    );
  const here = { width: 58 + 2 * 54, height: 62 };
  // The here card's anchor: the top of your figure's head, above your feet at the hex centre.
  const anchorAt = (at: { x: number; y: number }) => ({ x: at.x, y: at.y - 0.9 * p.size * scale });
  const below = 0.9 * p.size * scale;

  it('the usual place above your head would cover the neighbour to the north', () => {
    const at = { x: 195, y: 420 };
    const usual = placePopover(anchorAt(at), below, here, screen, 10);
    expect(around(at).some((poly) => overlaps(usual, poly))).toBe(true);
  });

  it('sits clear of your hex and all six neighbours, below them when there is room', () => {
    const at = { x: 195, y: 420 };
    const polys = around(at);
    const rect = placeClear(anchorAt(at), below, here, screen, 10, polys);
    expect(polys.some((poly) => overlaps(rect, poly))).toBe(false);
    expect(rect.y).toBeGreaterThan(at.y);
    // Its chevron points back up toward you.
    const tipY = Number(chevronFor(rect, anchorAt(at), below).fill.split('L')[1]!.split(' ')[1]);
    expect(tipY).toBeLessThan(0);
  });

  it('goes above the neighbours when you stand low on the screen, still covering none', () => {
    const at = { x: 195, y: 790 };
    const polys = around(at);
    const rect = placeClear(anchorAt(at), below, here, screen, 10, polys);
    expect(polys.some((poly) => overlaps(rect, poly))).toBe(false);
    expect(rect.y + rect.height).toBeLessThan(at.y);
  });

  it('goes beside them near the top of a wide screen, with the chevron on that side', () => {
    const wide = { width: 1440, height: 240 };
    const at = { x: 700, y: 130 };
    const polys = around(at);
    const tall = { width: 170, height: 62 };
    const rect = placeClear(anchorAt(at), below, tall, wide, 10, polys);
    expect(polys.some((poly) => overlaps(rect, poly))).toBe(false);
    expect(rect.x).toBeGreaterThan(at.x);
    const tipX = Number(chevronFor(rect, anchorAt(at), below).fill.split('L')[1]!.split(' ')[0]);
    expect(tipX).toBeLessThan(0);
  });

  it('on a 320 px screen, clear of your hex and the neighbours near either edge', () => {
    const narrow = { width: 320, height: 568 };
    for (const at of [
      { x: 30, y: 280 },
      { x: 290, y: 280 },
      { x: 160, y: 40 },
      { x: 160, y: 540 },
    ]) {
      const polys = around(at);
      const rect = placeClear(anchorAt(at), below, here, narrow, 10, polys);
      expect(polys.some((poly) => overlaps(rect, poly))).toBe(false);
      expect(rect.x).toBeGreaterThanOrEqual(10);
      expect(rect.x + rect.width).toBeLessThanOrEqual(310);
    }
  });

  it('when nothing fits clear of the neighbours, it still leaves your own hex uncovered', () => {
    // A screen barely taller than the ring of hexes: every place covers a neighbour.
    const tight = { width: 320, height: 200 };
    const at = { x: 160, y: 100 };
    const polys = around(at);
    const rect = placeClear(anchorAt(at), below, here, tight, 10, polys);
    expect(overlaps(rect, polys[0]!)).toBe(false);
    // The usual place would have covered it.
    expect(overlaps(placePopover(anchorAt(at), below, here, tight, 10), polys[0]!)).toBe(true);
  });

  it('a rectangle and a hex overlap only when they share area', () => {
    const hex = around({ x: 100, y: 100 })[0]!;
    expect(overlaps({ x: 90, y: 90, width: 20, height: 20 }, hex)).toBe(true);
    expect(overlaps({ x: 200, y: 200, width: 20, height: 20 }, hex)).toBe(false);
  });
});

describe('trailClear', () => {
  const at = { q: 0, r: 0 };
  const path = [
    { q: 0, r: -1 },
    { q: 0, r: -2 },
  ];
  it("keeps a threat's own hex first, then any others, then its trail, each once", () => {
    expect(trailClear(at, path)).toEqual({ clear: [at, ...path] });
    const others = [at, { q: 1, r: -1 }, { q: 0, r: -1 }];
    expect(trailClear(at, path, others)).toEqual({
      clear: [at, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: 0, r: -2 }],
    });
  });
  it('changes nothing for a threat that does not move', () => {
    expect(trailClear(at, [])).toEqual({});
    expect(trailClear(at, [], [at])).toEqual({ clear: [at] });
  });
});
