/**
 * Marks the map animates: short "moments" (an ink bloom when a hex is revealed, a burst for a find, a snap
 * for a sprung trap, a fire lit, a feeding, a linger), the small `via` mark on a path step (a hook where the grappling hook is used).
 * Each is a self-contained `<svg>` centred on its point (viewBox −24…24). A moment's parts carry
 * `data-part="0" | "1" | "2"` so the map can stage them (draw 0 first, 2 last); the drawing is the
 * finished frame.
 */
import { ellipsePath, poly, smoothOpen, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { stroke, wobblyRing } from './moment-kit.ts';
import { FIRE_MOMENT_KINDS, FIRE_MOMENTS } from './fire-art.ts';
import { FEEDBACK_MOMENT_KINDS, FEEDBACK_MOMENTS } from './feedback-marks.ts';
import { SEASON_MOMENT_KINDS, SEASON_MOMENTS } from './season-moments.ts';
import { el, type SvgNode } from './svg.ts';

export const MOMENT_KINDS = [
  'reveal',
  'find',
  'trap',
  'survey',
  'fire',
  'feed',
  'linger',
  ...SEASON_MOMENT_KINDS,
  'stayed',
  ...FEEDBACK_MOMENT_KINDS,
  ...FIRE_MOMENT_KINDS,
] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

const P = (x: number, y: number): Point => ({ x, y });

/** The ink bloom of a reveal: a wash spreading out in rings. */
function reveal(pal: Palette): SvgNode[] {
  return [
    el('path', { d: wobblyRing(9, 0.12, 0.4), fill: pal.hint, opacity: 0.25, 'data-part': '0' }),
    el('path', {
      d: wobblyRing(14, 0.1, 1.7),
      ...stroke(pal.inkSoft, 1.6, { opacity: 0.7 }),
      'data-part': '1',
    }),
    el('path', {
      d: wobblyRing(20, 0.08, 2.9),
      ...stroke(pal.inkSoft, 1.1, { opacity: 0.45, 'stroke-dasharray': '3 4' }),
      'data-part': '2',
    }),
  ];
}

/** A find: rays bursting out with small twinkles. */
function find(pal: Palette): SvgNode[] {
  const rays: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (Math.PI * 2 * i) / 10 - Math.PI / 2;
    const r0 = 8;
    const r1 = i % 2 ? 15 : 20;
    rays.push(
      poly([P(Math.cos(a) * r0, Math.sin(a) * r0), P(Math.cos(a) * r1, Math.sin(a) * r1)], false),
    );
  }
  const twinkle = (x: number, y: number, r: number): string =>
    poly([
      P(x, y - r),
      P(x + r * 0.3, y - r * 0.3),
      P(x + r, y),
      P(x + r * 0.3, y + r * 0.3),
      P(x, y + r),
      P(x - r * 0.3, y + r * 0.3),
      P(x - r, y),
      P(x - r * 0.3, y - r * 0.3),
    ]);
  return [
    el('path', {
      d: ellipsePath(0, 0, 6.5, 6.5),
      fill: pal.accents.ochre.light,
      stroke: pal.accents.ochre.shade,
      'stroke-width': 1.4,
      'data-part': '0',
    }),
    el('path', { d: rays.join(''), ...stroke(pal.accents.ochre.shade, 1.8), 'data-part': '1' }),
    el('path', {
      d: twinkle(15, -14, 3.5) + twinkle(-16, 11, 3) + twinkle(-13, -15, 2.4),
      fill: pal.paper,
      stroke: pal.hint,
      'stroke-width': 1.2,
      'stroke-linejoin': 'round',
      'data-part': '2',
    }),
  ];
}

/** A trap springing: a sharp snap of jagged strokes and flying ticks. */
function trap(pal: Palette): SvgNode[] {
  const jag = (pts: [number, number][]): string =>
    poly(
      pts.map(([x, y]) => P(x, y)),
      false,
    );
  const ticks: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI * 2 * i) / 6 + 0.3;
    ticks.push(
      poly([P(Math.cos(a) * 15, Math.sin(a) * 15), P(Math.cos(a) * 20, Math.sin(a) * 20)], false),
    );
  }
  return [
    el('path', {
      d: wobblyRing(8, 0.15, 0.9),
      fill: pal.accents.coral.light,
      opacity: 0.6,
      'data-part': '0',
    }),
    el('path', {
      d:
        jag([
          [-12, -9],
          [-5, -3],
          [-8, 1],
          [1, 6],
          [-1, 10],
        ]) +
        jag([
          [11, -10],
          [5, -4],
          [8, 0],
          [2, 4],
        ]),
      ...stroke(pal.accents.coral.shade, 2.4),
      'data-part': '1',
    }),
    el('path', { d: ticks.join(''), ...stroke(pal.ink, 1.4), 'data-part': '2' }),
  ];
}

/** A survey: a spyglass at the lower left sweeping a fan of looking-lines over the hex. */
function survey(pal: Palette): SvgNode[] {
  const arc = (r: number): string => {
    const a0 = -Math.PI * 0.42;
    const a1 = -Math.PI * 0.08;
    const p0 = P(-12 + Math.cos(a0) * r, 12 + Math.sin(a0) * r);
    const p1 = P(-12 + Math.cos(a1) * r, 12 + Math.sin(a1) * r);
    return `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}A${r} ${r} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  };
  return [
    el('path', {
      d: 'M-12 12L-4.5 -12A25 25 0 0 1 12 4.5Z',
      fill: pal.hint,
      opacity: 0.18,
      'data-part': '0',
    }),
    el('path', {
      d: arc(14) + arc(21) + arc(28),
      ...stroke(pal.inkSoft, 1.4, { 'stroke-dasharray': '2.5 3' }),
      'data-part': '1',
    }),
    el('path', {
      d: 'M-19 19l9-9 3 3-9 9zM-10 10l4-4 3 3-4 4z',
      fill: pal.ramps.bark.base,
      stroke: pal.ink,
      'stroke-width': 1.2,
      'stroke-linejoin': 'round',
      'data-part': '2',
    }),
  ];
}

/** A fire lit: a warm glow, the flame leaping up, sparks flying. */
function fire(pal: Palette): SvgNode[] {
  const sparks = [
    [-11, -14, 1.6],
    [12, -12, 1.4],
    [-15, -3, 1.2],
    [16, -2, 1.3],
    [3, -20, 1.5],
  ]
    .map(([x, y, r]) => ellipsePath(x!, y!, r!, r!))
    .join('');
  return [
    el('path', {
      d: wobblyRing(14, 0.1, 0.6),
      fill: pal.accents.ochre.light,
      opacity: 0.6,
      'data-part': '0',
    }),
    el('path', {
      d: 'M0 13c-7 0-11-4-11-10 0-6 5-8 6-14 2 4 4 5 4 5 0-6 3-10 7-12 0 6 5 9 5 15 0 9-4 16-11 16z',
      fill: pal.accents.coral.base,
      stroke: pal.accents.coral.shade,
      'stroke-width': 1.4,
      'stroke-linejoin': 'round',
      'data-part': '1',
    }),
    el('path', { d: sparks, fill: pal.accents.ochre.base, 'data-part': '2' }),
  ];
}

/** A feeding: a soft rose wash, berries dropping in, and a contented ripple. */
function feed(pal: Palette): SvgNode[] {
  const berries = [
    [-6, -6, 4.2],
    [3, -9, 4],
    [7, -1, 3.8],
    [-2, 2, 4],
  ];
  return [
    el('path', {
      d: wobblyRing(12, 0.12, 1.1),
      fill: pal.accents.rose.light,
      opacity: 0.55,
      'data-part': '0',
    }),
    el('path', {
      d: berries.map(([x, y, r]) => ellipsePath(x!, y!, r!, r!)).join(''),
      fill: pal.accents.rose.base,
      stroke: pal.accents.rose.shade,
      'stroke-width': 1.3,
      'data-part': '1',
    }),
    el('path', {
      d: smoothOpen([P(-16, 12), P(-8, 17), P(0, 18), P(8, 17), P(16, 12)]),
      ...stroke(pal.inkSoft, 1.6),
      'data-part': '2',
    }),
  ];
}

/** A linger: the ground settling in flat rings, and three small down-strokes as it lies down. */
function linger(pal: Palette): SvgNode[] {
  const flat = (rx: number, ry: number): string => ellipsePath(0, 8, rx, ry);
  return [
    el('path', { d: flat(18, 7), fill: pal.accents.sage.light, opacity: 0.55, 'data-part': '0' }),
    el('path', {
      d: flat(12, 4.5) + flat(20, 8),
      ...stroke(pal.accents.sage.shade, 1.4),
      'data-part': '1',
    }),
    el('path', {
      d: 'M-8 -16v6M0 -19v7M8 -16v6M-10.5 -12.5l2.5 2.5 2.5-2.5M-2.5 -14.5l2.5 2.5 2.5-2.5M5.5 -12.5l2.5 2.5 2.5-2.5',
      ...stroke(pal.inkSoft, 1.5),
      'data-part': '2',
    }),
  ];
}

/**
 * Stayed: at day change the lingering creature did not move. Dust settling in puffs at the ground, the
 * curled rest marks of a sleeper (two nested crescents), and a few motes drifting down.
 */
function stayed(pal: Palette): SvgNode[] {
  const puff = (x: number, y: number, r: number): string => ellipsePath(x, y, r, r * 0.6);
  const crescent = (r: number): string => {
    const a0 = Math.PI * 0.15;
    const a1 = Math.PI * 1.35;
    const p0 = P(Math.cos(a0) * r, -4 + Math.sin(a0) * r);
    const p1 = P(Math.cos(a1) * r, -4 + Math.sin(a1) * r);
    return `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}A${r} ${r} 0 1 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  };
  return [
    el('path', {
      d: puff(-15, 13, 5) + puff(-6, 16, 6) + puff(5, 16, 6) + puff(15, 13, 5),
      fill: pal.ramps.earth.light,
      stroke: pal.inkSoft,
      'stroke-width': 1.1,
      opacity: 0.85,
      'data-part': '0',
    }),
    el('path', {
      d: crescent(10) + crescent(5.5),
      ...stroke(pal.accents.sage.shade, 2),
      'data-part': '1',
    }),
    el('path', {
      d:
        ellipsePath(-17, -12, 1.4, 1.4) +
        ellipsePath(16, -8, 1.2, 1.2) +
        ellipsePath(12, -19, 1, 1),
      fill: pal.inkSoft,
      'data-part': '2',
    }),
  ];
}

const MOMENTS: Readonly<Record<MomentKind, (p: Palette) => SvgNode[]>> = {
  reveal,
  find,
  trap,
  survey,
  fire,
  feed,
  linger,
  ...SEASON_MOMENTS,
  stayed,
  ...FEEDBACK_MOMENTS,
  ...FIRE_MOMENTS,
};

/** A moment mark as a centred `<svg>` of `size` px. Unknown kinds draw the reveal bloom. */
export function drawMoment(kind: string, palette: Palette, size: number): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 48;
  const draw = (MOMENT_KINDS as readonly string[]).includes(kind)
    ? MOMENTS[kind as MomentKind]
    : reveal;
  return el('svg', { viewBox: '-24 -24 48 48', width: px, height: px }, draw(palette));
}

/** The `via` marks a path step can carry, by content id. */
export const VIA_MARKS: Readonly<Record<string, (p: Palette) => SvgNode[]>> = {
  // A small grappling hook on a paper disc, for a cliff step taken with the hook.
  'grappling-hook': (pal) => [
    el('path', {
      d: ellipsePath(0, 0, 11, 11),
      fill: pal.paper,
      stroke: pal.ink,
      'stroke-width': 1.6,
    }),
    el('path', {
      d: 'M0 -7V3M0 3c-4 0-6-2-6-5.5l-1.5 1M0 3c4 0 6-2 6-5.5l1.5 1M0 3v3.5',
      ...stroke(pal.ink, 2),
    }),
    el('path', {
      d: smoothOpen([P(1.5, -7), P(4.5, -8.5), P(6, -6)]),
      ...stroke(pal.ramps.bark.base, 1.3),
    }),
  ],
  // Climbing spikes: a short row of spikes under a band, for a cliff step taken with the spikes.
  'climbing-spikes': (pal) => [
    el('path', {
      d: ellipsePath(0, 0, 11, 11),
      fill: pal.paper,
      stroke: pal.ink,
      'stroke-width': 1.6,
    }),
    el('path', {
      d: 'M-6 -3h12l-1.5 3h-9z',
      fill: pal.ramps.stone.light,
      stroke: pal.ink,
      'stroke-width': 1.2,
    }),
    el('path', { d: 'M-4 0l.5 5M0 0v5M4 0l-.5 5', ...stroke(pal.ink, 1.6) }),
  ],
  // A raft: three lashed logs and a pole, for a step across deep water.
  raft: (pal) => [
    el('path', {
      d: ellipsePath(0, 0, 11, 11),
      fill: pal.paper,
      stroke: pal.ink,
      'stroke-width': 1.6,
    }),
    el('path', {
      d: 'M-7 -3h13l1 2.5h-14zM-7 .5h13l1 2.5h-14zM-7 4h13l1 2.5h-14z',
      fill: pal.ramps.bark.base,
      stroke: pal.ink,
      'stroke-width': 1,
    }),
    el('path', { d: 'M5 -8L2 3', ...stroke(pal.ramps.bark.shade, 1.4) }),
  ],
  // Marsh boards: two planks laid side by side, for a swamp step taken on the boards.
  'marsh-boards': (pal) => [
    el('path', {
      d: ellipsePath(0, 0, 11, 11),
      fill: pal.paper,
      stroke: pal.ink,
      'stroke-width': 1.6,
    }),
    el('path', {
      d: 'M-7 -1l9-3 2 2-9 3z',
      fill: pal.ramps.bark.base,
      stroke: pal.ink,
      'stroke-width': 1.2,
    }),
    el('path', {
      d: 'M-3 3l9-3 2 2-9 3z',
      fill: pal.ramps.bark.light,
      stroke: pal.ink,
      'stroke-width': 1.2,
    }),
  ],
};

/** A `via` mark as a centred `<svg>` of `size` px; an unknown `via` draws a small plain dot. */
export function drawViaMark(via: string, palette: Palette, size: number): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 24;
  const children = Object.hasOwn(VIA_MARKS, via)
    ? VIA_MARKS[via]!(palette)
    : [
        el('path', {
          d: ellipsePath(0, 0, 4, 4),
          fill: palette.paper,
          stroke: palette.inkSoft,
          'stroke-width': 1.4,
        }),
      ];
  return el('svg', { viewBox: '-12 -12 24 24', width: px, height: px }, children);
}

/**
 * The step hint for a creature that stays put (it lingers): two paw prints side by side inside a dashed
 * ring, drawn where it stands instead of the paw prints ahead. A centred `<svg>` of `size` px.
 */
export function drawStayMark(palette: Palette, size: number): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 48;
  const paw = (cx: number): string =>
    ellipsePath(cx, 3, 3.2, 2.7) +
    [
      [-2.6, -1.8],
      [0, -3],
      [2.6, -1.8],
    ]
      .map(([dx, dy]) => ellipsePath(cx + dx!, 3 + dy! - 1.4, 1.15, 1.15))
      .join('');
  return el('svg', { viewBox: '-12 -12 24 24', width: px, height: px }, [
    el('path', {
      d: ellipsePath(0, 0, 10.5, 10.5),
      fill: palette.paper,
      'fill-opacity': 0.6,
      stroke: palette.inkSoft,
      'stroke-width': 1.2,
      'stroke-dasharray': '2 2.4',
      'stroke-linecap': 'round',
    }),
    el('path', { d: paw(-4) + paw(4), fill: palette.inkSoft }),
  ]);
}

/**
 * One of the creature's likely steps as a paw print, sized and darkened by its `chance` (0 to 1), pointing
 * along `angle` (screen radians, 0 is east, the way it would walk). A centred `<svg>` of `size` px; the
 * paw fills at most about two thirds of it at chance 1.
 */
export function drawStepHint(palette: Palette, size: number, chance: number, angle = 0): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 32;
  const c = Number.isFinite(chance) ? Math.min(1, Math.max(0, chance)) : 0;
  const a = Number.isFinite(angle) ? angle : 0;
  const s = 2.2 + 2.6 * c;
  const rot = (dx: number, dy: number): Point =>
    P((dx * Math.cos(a) - dy * Math.sin(a)) * s, (dx * Math.sin(a) + dy * Math.cos(a)) * s);
  const pad = rot(-0.6, 0);
  const toes = [
    [1.15, -1.25],
    [1.6, 0],
    [1.15, 1.25],
  ].map(([dx, dy]) => rot(dx!, dy!));
  return el('svg', { viewBox: '-12 -12 24 24', width: px, height: px }, [
    el('path', {
      d:
        ellipsePath(pad.x, pad.y, 1.25 * s, 1.1 * s) +
        toes.map((t) => ellipsePath(t.x, t.y, 0.5 * s, 0.5 * s)).join(''),
      fill: c >= 0.5 ? palette.ink : palette.inkSoft,
      opacity: Math.round((0.3 + 0.65 * c) * 100) / 100,
      'data-chance': Math.round(c * 100) / 100,
    }),
  ]);
}
