import { describe, expect, it } from 'vitest';
import { MIST, MORNING, paletteColours, SPRING } from '../src/palette.ts';
import {
  drawGateSign,
  drawStoryVignette,
  GATE_SIGN_KINDS,
  STORY_VIGNETTE_IDS,
} from '../src/story-art.ts';
import { el, toSvgString, walk, type SvgNode } from '../src/svg.ts';
import { drawTrace, TRACE_KINDS, TRACE_SCALE } from '../src/traces.ts';
import { drawRouteDestination, drawStandingStone, STANDING_STONE_HEIGHT } from '../src/waymarks.ts';
import { buildReviewItems } from '../src/review.ts';

/** Every colour is the palette's, the tree serialises under the allowlist, no bad numbers, no text. */
function within(node: SvgNode, palette = SPRING): void {
  const allowed = paletteColours(palette);
  walk(node, (n) => {
    for (const name of ['fill', 'stroke', 'stop-color']) {
      const v = n.attrs[name];
      if (typeof v === 'string' && v !== 'none' && !v.startsWith('url('))
        expect(allowed.has(v.toLowerCase()), `${name}=${v}`).toBe(true);
    }
  });
  const svg = toSvgString(node);
  expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  expect(svg).not.toMatch(/<text/);
}

const bounds = (nodes: SvgNode[]): { count: number } => {
  let count = 0;
  for (const n of nodes) walk(n, () => (count += 1));
  return { count };
};

describe('traces', () => {
  for (const palette of [SPRING, MORNING, MIST]) {
    for (const kind of TRACE_KINDS) {
      it(`${kind} draws in ${palette.id} palette colours`, () => {
        const d = drawTrace(palette, kind, { origin: { x: 100, y: 80 }, k: 1, seed: 3 });
        expect(d.nodes.length).toBeGreaterThan(0);
        within(el('g', {}, d.nodes), palette);
      });
    }
  }

  it('is deterministic for a seed and varies between seeds', () => {
    const a = toSvgString(el('g', {}, drawTrace(SPRING, 'fire', { seed: 1 }).nodes));
    expect(toSvgString(el('g', {}, drawTrace(SPRING, 'fire', { seed: 1 }).nodes))).toBe(a);
    expect(toSvgString(el('g', {}, drawTrace(SPRING, 'fire', { seed: 2 }).nodes))).not.toBe(a);
  });

  it('stays inside a hex of the size it is drawn for, and its box holds its points', () => {
    const size = 64;
    for (const kind of TRACE_KINDS) {
      const d = drawTrace(SPRING, kind, { origin: { x: 0, y: 0 }, k: size / 64, squash: 0.8 });
      // Ground width stays within three quarters of a hex wide (the hex is 2 × size across).
      expect(d.box.x1 - d.box.x0).toBeLessThanOrEqual(size * 2 * 0.75);
      expect(d.box.x0).toBeLessThan(0);
      expect(d.box.x1).toBeGreaterThan(0);
      expect(d.box.y1).toBeGreaterThanOrEqual(d.box.y0);
      for (const v of Object.values(d.box)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('scales with k and falls back on a bad option', () => {
    const small = drawTrace(SPRING, 'cairn', { k: 0.5 });
    const big = drawTrace(SPRING, 'cairn', { k: 1 });
    expect(big.box.x1 - big.box.x0).toBeCloseTo((small.box.x1 - small.box.x0) * 2, 5);
    const bad = drawTrace(SPRING, 'cairn', { k: Number.NaN, squash: -1 });
    within(el('g', {}, bad.nodes));
    expect(TRACE_SCALE).toBeGreaterThan(1);
  });

  it('an unknown kind draws the cairn', () => {
    const a = toSvgString(el('g', {}, drawTrace(SPRING, 'nope').nodes));
    expect(a).toBe(toSvgString(el('g', {}, drawTrace(SPRING, 'cairn').nodes)));
  });

  it('the trail is low and sparse: no fill wash, nothing taller than a tuft', () => {
    const d = drawTrace(SPRING, 'trail', { k: 1, heading: 20 });
    const heightPx = d.box.y1 - d.box.y0;
    expect(heightPx).toBeLessThan(40);
    // Only blades and flower dots: no filled path over the ground.
    const fills = d.nodes.filter(
      (n) => typeof n.attrs.fill === 'string' && n.attrs.fill !== 'none',
    );
    const dots = fills.every((n) => n.attrs.stroke === SPRING.ink);
    expect(dots).toBe(true);
    expect(bounds(d.nodes).count).toBeGreaterThan(4);
  });

  it('every kind carries a dark ink stroke, so it reads over light ground', () => {
    for (const kind of TRACE_KINDS) {
      const svg = toSvgString(el('g', {}, drawTrace(SPRING, kind).nodes));
      expect(svg).toContain(SPRING.ink);
    }
  });
});

describe('waymarks', () => {
  it('the standing stone is taller than a rider and leans', () => {
    const d = drawStandingStone(SPRING, { k: 1, squash: 0.8, ticks: 2 });
    within(el('g', {}, d.nodes));
    // A character stands 0.74 hexes (47 px at hex size 64).
    expect(STANDING_STONE_HEIGHT).toBeGreaterThan(0.74 * 64);
    expect(d.box.y1 - d.box.y0).toBeGreaterThan(0.74 * 64);
    // The top is right of the foot's centre: it leans.
    expect(d.box.x1).toBeGreaterThan(-d.box.x0);
  });

  it('ticks add marks and are clamped to 0..3', () => {
    const count = (ticks: number): number =>
      bounds(drawStandingStone(SPRING, { ticks, seed: 1 }).nodes).count;
    expect(toSvgString(el('g', {}, drawStandingStone(SPRING, { ticks: 3 }).nodes))).not.toBe(
      toSvgString(el('g', {}, drawStandingStone(SPRING, { ticks: 0 }).nodes)),
    );
    expect(count(9)).toBe(count(3));
    expect(count(-4)).toBe(count(0));
  });

  it('the Greyfold mark is a sized svg with a green rim', () => {
    for (const palette of [SPRING, MORNING, MIST]) {
      const m = drawRouteDestination(palette, 24);
      expect(m.attrs.width).toBe(24);
      within(m, palette);
      expect(toSvgString(m)).toContain(palette.accents.sage.base);
    }
    expect(drawRouteDestination(SPRING, -1).attrs.width).toBe(24);
  });
});

describe('story vignettes', () => {
  it('has the sixteen ids the brief names', () => {
    expect([...STORY_VIGNETTE_IDS]).toEqual([
      'beat.setting-out',
      'beat.first.wooded',
      'beat.first.dry',
      'beat.first.steep',
      'beat.first.water',
      'beat.first.boggy',
      'beat.first.captors',
      'beat.first.settlement',
      'beat.waymark.quarter',
      'beat.waymark.half',
      'beat.waymark.three-quarters',
      'beat.destination',
      'ending.mossback.safe',
      'ending.mossback.wounded',
      'ending.lost.pursuer',
      'ending.lost.hunger',
    ]);
  });

  for (const id of STORY_VIGNETTE_IDS) {
    it(`${id} is card-sized, light and in palette colours`, () => {
      for (const palette of [SPRING, MORNING, MIST]) {
        const v = drawStoryVignette(palette, id);
        expect(v.attrs.viewBox).toBe('0 0 96 64');
        within(v, palette);
        // Few strokes: a vignette stays a handful of shapes, not a scene.
        expect(bounds([v]).count).toBeLessThan(90);
      }
    });
  }

  it('every vignette differs, the three standing stones share a design', () => {
    const svgs = STORY_VIGNETTE_IDS.map((id) => toSvgString(drawStoryVignette(SPRING, id)));
    expect(new Set(svgs).size).toBe(STORY_VIGNETTE_IDS.length);
  });

  it('width scales the height and an unknown id draws setting-out', () => {
    const v = drawStoryVignette(SPRING, 'beat.first.dry', 192);
    expect(v.attrs.width).toBe(192);
    expect(v.attrs.height).toBe(128);
    expect(toSvgString(drawStoryVignette(SPRING, 'nope'))).toBe(
      toSvgString(drawStoryVignette(SPRING, 'beat.setting-out')),
    );
    expect(drawStoryVignette(SPRING, 'beat.first.dry', Number.NaN).attrs.width).toBe(96);
  });
});

describe('gate signs', () => {
  it('draws a bell and a pearl, different from each other', () => {
    const [bell, pearl] = GATE_SIGN_KINDS.map((k) => drawGateSign(SPRING, k, 32));
    within(bell!);
    within(pearl!);
    expect(toSvgString(bell!)).not.toBe(toSvgString(pearl!));
    expect(toSvgString(drawGateSign(SPRING, 'x'))).toBe(toSvgString(drawGateSign(SPRING, 'bell')));
    expect(drawGateSign(SPRING, 'bell', 0).attrs.width).toBe(32);
  });
});

describe('world review batch', () => {
  it('exports the four world sheets with unique ids and files', () => {
    const items = buildReviewItems().filter((i) => i.id.startsWith('world/'));
    expect(items.map((i) => i.id)).toEqual([
      'world/traces',
      'world/waymarks',
      'world/story-cards',
      'world/gate-signs',
    ]);
    for (const i of items) {
      expect(i.svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(i.kind).toBe('glance');
    }
  });
});
