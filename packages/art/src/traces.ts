/**
 * Traces: what the creature's walk leaves on a hex. They sit on the ground under characters and features,
 * low and light so they read over every terrain colour, the veil and the trodden ground, and never cover a
 * terrain prop. Ground marks are drawn flat on the hex plane; the cairn and the gate stand a little.
 * Each carries a thin paper halo under its dark strokes so it reads on dark ground (forest, swamp) too.
 */
import { ellipsePath, poly, smoothClosed, type Box, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { inkAttrs, riseFor, type Drawn, type PropContext } from './props.ts';
import { rngFor } from './rng.ts';
import { el, type SvgNode } from './svg.ts';

export const TRACE_KINDS = ['fire', 'trail', 'cairn', 'chain', 'gate'] as const;
export type TraceKind = (typeof TRACE_KINDS)[number];

/** Traces are drawn this much larger than their local units, so they fill about a third of a hex. */
export const TRACE_SCALE = 1.9;

export interface TraceOptions {
  /** The base point on the ground, in screen px (default 0, 0). */
  readonly origin?: Point;
  /** Scale against the reference hex size 64 (default 1). */
  readonly k?: number;
  /** Vertical squash of the ground plane (default 0.8, the isometric tilt). */
  readonly squash?: number;
  /** Ink width in px (default 1.4 × k). */
  readonly ink?: number;
  /** Varies the small details; the same seed draws the same trace. */
  readonly seed?: string | number;
  /** The trail's heading in degrees (0 runs left to right). */
  readonly heading?: number;
}

/** A drawing context from a palette and the options; shared with the waymarks. */
export function worldContext(
  palette: Palette,
  kind: string,
  o: Pick<TraceOptions, 'origin' | 'k' | 'squash' | 'ink' | 'seed'>,
): PropContext {
  const k = Number.isFinite(o.k) && (o.k ?? 0) > 0 ? o.k! : 1;
  const squash = Number.isFinite(o.squash) && (o.squash ?? 0) > 0 ? o.squash! : 0.8;
  return {
    palette,
    rng: rngFor('world', kind, o.seed ?? 0),
    origin: o.origin ?? { x: 0, y: 0 },
    k,
    squash,
    ink: o.ink ?? 1.4 * k,
    rise: riseFor(squash),
  };
}

/** Local → screen on the ground plane (y is depth) and standing upright (y is height, negative up). */
export function planes(c: PropContext) {
  const G = (x: number, y: number): Point => ({
    x: c.origin.x + x * c.k,
    y: c.origin.y + y * c.k * c.squash,
  });
  const U = (x: number, y: number): Point => ({
    x: c.origin.x + x * c.k,
    y: c.origin.y + y * c.k * c.rise,
  });
  return { G, U };
}

export function boxAround(c: PropContext, w: number, up: number, down: number): Box {
  return {
    x0: c.origin.x - w * c.k,
    x1: c.origin.x + w * c.k,
    y0: c.origin.y - up * c.k * c.rise,
    y1: c.origin.y + down * c.k * c.squash,
  };
}

/** A ring (or blot) with a slightly uneven edge, on the ground plane. */
function blot(c: PropContext, rx: number, ry: number, wobble: number, phase: number): string {
  const { G } = planes(c);
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 10;
    const f = 1 + wobble * Math.sin(i * 2.3 + phase);
    return G(Math.cos(a) * rx * f, Math.sin(a) * ry * f);
  });
  return smoothClosed(pts);
}

const fire = (c: PropContext): Drawn => {
  const pal = c.palette;
  const { G } = planes(c);
  const phase = c.rng.range(0, 6);
  const ring = blot(c, 14, 9.6, 0.09, phase);
  const sticks = [
    [-9, 2, -3, 4],
    [4, -5, 10, -3],
    [-4, -6, 0, -8],
  ] as const;
  const flecks = [0, 1, 2, 3, 4].map(() => {
    const p = G(c.rng.range(-16, 16), c.rng.range(-10, 10));
    return ellipsePath(p.x, p.y, 0.9 * c.k, 0.6 * c.k);
  });
  const nodes: SvgNode[] = [
    el('path', { d: blot(c, 15.5, 11, 0.07, phase), fill: pal.paper, opacity: 0.4 }),
    el('path', { d: ring, fill: pal.ink, opacity: 0.5 }),
    // The middle is paler where the heap burned out: a ring, not a disc.
    el('path', {
      d: blot(c, 6.5, 4.2, 0.1, phase + 1),
      fill: pal.ramps.stone.light,
      opacity: 0.55,
    }),
    el('path', { d: ring, ...inkAttrs(pal.ink, c.ink * 0.9), opacity: 0.6 }),
    el('path', {
      d: sticks.map(([x0, y0, x1, y1]) => poly([G(x0, y0), G(x1, y1)], false)).join(''),
      ...inkAttrs(pal.ink, c.ink * 1.3),
      opacity: 0.8,
    }),
    el('path', { d: flecks.join(''), fill: pal.ink, opacity: 0.55 }),
  ];
  return { nodes, box: boxAround(c, 17, 0, 11) };
};

/** Taller grass and small flowers along a path: low, sparse tufts with a pale underline, no wash. */
const trail = (c: PropContext, heading: number): Drawn => {
  const pal = c.palette;
  const { G } = planes(c);
  const a = (heading * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const under: string[] = [];
  const blades: string[] = [];
  const light: string[] = [];
  const dots: { p: Point; tone: number }[] = [];
  for (let i = 0; i < 7; i += 1) {
    const t = -20 + i * 6.7;
    const wob = c.rng.range(-2.4, 2.4);
    const bx = t * dx - wob * dy;
    const by = (t * dy + wob * dx) * 0.7;
    const base = G(bx, by);
    const s = c.rng.range(3.2, 5);
    for (const [ox, lean] of [
      [-1.6, -0.5],
      [0, 0.1],
      [1.6, 0.6],
    ] as const) {
      const top = {
        x: base.x + (ox + lean * 2) * c.k,
        y: base.y - s * (1 - Math.abs(ox) * 0.1) * c.k * c.rise,
      };
      const d = poly([{ x: base.x + ox * c.k, y: base.y }, top], false);
      under.push(d);
      (ox === 0 ? light : blades).push(d);
    }
    if (i % 2 === 1)
      dots.push({ p: { x: base.x + 2.4 * c.k, y: base.y - (s + 0.8) * c.k * c.rise }, tone: i });
  }
  const nodes: SvgNode[] = [
    el('path', { d: under.join(''), ...inkAttrs(pal.paper, c.ink * 1.9), opacity: 0.5 }),
    el('path', { d: blades.join(''), ...inkAttrs(pal.ramps.foliage.shade, c.ink * 0.9) }),
    el('path', { d: light.join(''), ...inkAttrs(pal.accents.sage.base, c.ink * 0.9) }),
    ...dots.map(({ p, tone }) =>
      el('path', {
        d: ellipsePath(p.x, p.y, 1.3 * c.k, 1.2 * c.k),
        fill: [pal.accents.rose.light, pal.paper, pal.accents.ochre.light][tone % 3]!,
        stroke: pal.ink,
        'stroke-width': c.ink * 0.6,
      }),
    ),
  ];
  return { nodes, box: boxAround(c, 24, 8, 8) };
};

const cairn = (c: PropContext): Drawn => {
  const pal = c.palette;
  const { G, U } = planes(c);
  const stones = [
    { x: 0, y: -2.2, rx: 8, ry: 3.2, tone: 'shade' },
    { x: 0.8, y: -6.2, rx: 5.6, ry: 2.6, tone: 'base' },
    { x: -0.6, y: -9.6, rx: 3.6, ry: 2.1, tone: 'light' },
  ] as const;
  const g = G(0, 0);
  const nodes: SvgNode[] = [
    el('path', {
      d: ellipsePath(g.x + 2 * c.k, g.y, 11 * c.k, 4 * c.k * c.squash),
      fill: pal.shadow,
      opacity: 0.2,
    }),
    ...stones.flatMap((s) => {
      const p = U(s.x, s.y);
      const d = ellipsePath(p.x, p.y, s.rx * c.k, s.ry * c.k * c.rise * 1.2);
      return [
        el('path', { d, fill: pal.ramps.stone[s.tone] }),
        el('path', { d, ...inkAttrs(pal.ink, c.ink * 0.9) }),
      ];
    }),
    // A tuft of green that has grown in between the lowest stones: it lingered long.
    el('path', {
      d: poly([U(-8.5, -1.5), U(-9.4, -5.2), U(-7.2, -2.4), U(-6.6, -5.8), U(-5.6, -2)], false),
      ...inkAttrs(pal.ramps.foliage.shade, c.ink * 0.8),
    }),
  ];
  return { nodes, box: boxAround(c, 11, 13, 4) };
};

/** One chain link: an open loop on the ground at (x, y), turned by `a` radians. */
function link(c: PropContext, x: number, y: number, a: number, rx = 3.2, ry = 1.7): string {
  const { G } = planes(c);
  const pts = Array.from({ length: 8 }, (_, i) => {
    const t = (Math.PI * 2 * i) / 8;
    const lx = Math.cos(t) * rx;
    const ly = Math.sin(t) * ry;
    return G(x + lx * Math.cos(a) - ly * Math.sin(a), y + lx * Math.sin(a) + ly * Math.cos(a));
  });
  return smoothClosed(pts);
}

const chain = (c: PropContext): Drawn => {
  const pal = c.palette;
  const { G } = planes(c);
  // Two runs of links with a gap between, one open link and a stub of ring at the end.
  const left = [-15, -10, -5.4].map((x, i) => link(c, x, 2 + i * 0.6, i % 2 ? 0.2 : 0.9));
  const right = [5, 10.2, 15].map((x, i) => link(c, x, -1 - i * 0.5, i % 2 ? -0.1 : -0.8));
  const open = poly([G(-2.4, 2.6), G(-0.4, 4.4), G(1.6, 3.4), G(0.6, 1.2)], false);
  const all = [...left, ...right];
  return {
    nodes: [
      el('path', { d: all.join(''), ...inkAttrs(pal.paper, c.ink * 2.3), opacity: 0.45 }),
      el('path', { d: all.join(''), fill: pal.accents.slate.light, opacity: 0.9 }),
      el('path', { d: all.join(''), ...inkAttrs(pal.ink, c.ink * 1.1) }),
      el('path', { d: open, ...inkAttrs(pal.ink, c.ink * 1.1) }),
    ],
    box: boxAround(c, 19, 0, 7),
  };
};

/** A small open gate: two posts, two leaves swung wide, a pale patch of ground, a stone. Quiet, not grim. */
const gate = (c: PropContext): Drawn => {
  const pal = c.palette;
  const { G, U } = planes(c);
  const g = G(0, 0);
  const post = (x: number): string =>
    poly([U(x - 1.5, 0), U(x - 1.5, -17), U(x + 1.5, -17), U(x + 1.5, 0)]);
  // A leaf hangs from a post and swings out toward the viewer: a trapezoid in a flattened perspective.
  const leaf = (x: number, dir: 1 | -1): string =>
    poly([
      U(x + dir * 1.5, -13),
      U(x + dir * 7.5, -10.5),
      U(x + dir * 7.5, -2.5),
      U(x + dir * 1.5, -3.5),
    ]);
  const bars = (x: number, dir: 1 | -1): string =>
    poly([U(x + dir * 1.5, -8.5), U(x + dir * 7.5, -6.5)], false);
  const nodes: SvgNode[] = [
    el('path', {
      d: ellipsePath(g.x, g.y, 14 * c.k, 5 * c.k * c.squash),
      fill: pal.accents.sage.light,
      opacity: 0.55,
    }),
    el('path', {
      d: ellipsePath(g.x + 2 * c.k, g.y, 13 * c.k, 3.6 * c.k * c.squash),
      fill: pal.shadow,
      opacity: 0.16,
    }),
    ...[-8, 8].flatMap((x) => [
      el('path', { d: post(x), fill: pal.ramps.bark.light }),
      el('path', { d: post(x), ...inkAttrs(pal.ink, c.ink) }),
    ]),
    el('path', { d: leaf(-8, 1) + leaf(8, -1), fill: pal.ramps.bark.base, opacity: 0.9 }),
    el('path', { d: leaf(-8, 1) + leaf(8, -1), ...inkAttrs(pal.ink, c.ink * 0.9) }),
    el('path', { d: bars(-8, 1) + bars(8, -1), ...inkAttrs(pal.ink, c.ink * 0.7) }),
  ];
  const s = G(1.5, 5);
  nodes.push(
    el('path', {
      d: ellipsePath(s.x, s.y, 1.9 * c.k, 1.2 * c.k),
      fill: pal.paper,
      stroke: pal.ink,
      'stroke-width': c.ink * 0.7,
    }),
  );
  return { nodes, box: boxAround(c, 15, 18, 7) };
};

/**
 * A trace for a hex: `fire`, `trail`, `cairn`, `chain` or `gate`. An unknown kind draws the cairn. The
 * result's `box` is its screen bounds; draw it above the terrain and below features and characters.
 */
export function drawTrace(palette: Palette, kind: string, opts: TraceOptions = {}): Drawn {
  const k: TraceKind = (TRACE_KINDS as readonly string[]).includes(kind)
    ? (kind as TraceKind)
    : 'cairn';
  const base = worldContext(palette, `trace-${k}`, opts);
  const c = { ...base, k: base.k * TRACE_SCALE, ink: opts.ink ?? 1.4 * base.k * 1.2 };
  const heading = Number.isFinite(opts.heading) ? opts.heading! : 0;
  switch (k) {
    case 'fire':
      return fire(c);
    case 'trail':
      return trail(c, heading);
    case 'chain':
      return chain(c);
    case 'gate':
      return gate(c);
    default:
      return cairn(c);
  }
}
