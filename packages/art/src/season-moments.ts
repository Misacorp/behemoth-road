/**
 * The season's moments (Milestone 5), drawn like the others in `marks.ts`: three parts tagged `data-part`
 * on the −24…24 grid, the finished frame. A threat appearing, a strike on the creature, a character struck,
 * a threat hit and cleared, a defence holding, a settlement befriended or angered, a boon, the season's end.
 */
import { ellipsePath, poly, smoothOpen, type Point } from './geom.ts';
import { stroke, wobblyRing } from './moment-kit.ts';
import type { Palette } from './palette.ts';
import { el, type SvgNode } from './svg.ts';

export const SEASON_MOMENT_KINDS = [
  'threat-appears',
  'creature-struck',
  'character-struck',
  'threat-hit',
  'threat-cleared',
  'defence-holds',
  'befriended',
  'angered',
  'boon',
  'season-end',
] as const;
export type SeasonMomentKind = (typeof SEASON_MOMENT_KINDS)[number];

const P = (x: number, y: number): Point => ({ x, y });

/** Rays from radius r0 to r1, `n` of them, starting at angle `a0`. */
function rays(n: number, r0: number, r1: number, a0 = -Math.PI / 2): string {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = a0 + (Math.PI * 2 * i) / n;
    out.push(
      poly([P(Math.cos(a) * r0, Math.sin(a) * r0), P(Math.cos(a) * r1, Math.sin(a) * r1)], false),
    );
  }
  return out.join('');
}

/** A jagged ring: `n` points alternating between radii r and r * dip. */
function jagged(n: number, r: number, dip: number, a0 = 0): string {
  const pts: Point[] = [];
  for (let i = 0; i < n * 2; i += 1) {
    const a = a0 + (Math.PI * i) / n;
    const rr = i % 2 ? r * dip : r;
    pts.push(P(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  return poly(pts);
}

/** A threat appears: a dark plum blot spreading, a jagged coral rim, and a pointed drop landing. */
function threatAppears(pal: Palette): SvgNode[] {
  return [
    el('path', {
      d: wobblyRing(11, 0.16, 2.1),
      fill: pal.accents.plum.base,
      opacity: 0.45,
      'data-part': '0',
    }),
    el('path', {
      d: jagged(9, 19, 0.78, 0.2),
      fill: 'none',
      stroke: pal.accents.coral.shade,
      'stroke-width': 1.8,
      'stroke-linejoin': 'round',
      'data-part': '1',
    }),
    el('path', {
      d: 'M0 -17L5 -4 0 4-5 -4z',
      fill: pal.accents.coral.base,
      stroke: pal.ink,
      'stroke-width': 1.4,
      'stroke-linejoin': 'round',
      'data-part': '2',
    }),
  ];
}

/** A strike on the creature: a coral star of impact, cracks running out, flecks of hide flying. */
function creatureStruck(pal: Palette): SvgNode[] {
  const flecks = [
    [-15, -12, 2],
    [16, -9, 1.7],
    [-12, 15, 1.6],
    [14, 14, 2],
  ]
    .map(([x, y, r]) => ellipsePath(x!, y!, r!, r! * 0.8))
    .join('');
  return [
    el('path', {
      d: jagged(7, 12, 0.5, 0.3),
      fill: pal.accents.coral.base,
      opacity: 0.85,
      'data-part': '0',
    }),
    el('path', {
      d: 'M4 -4l8-6 3 2 6-5M-4 2l-9 4-1 4-6 3M2 5l2 9-3 4M-3 -5l-3-9 3-3',
      ...stroke(pal.ink, 1.8),
      'data-part': '1',
    }),
    el('path', {
      d: flecks,
      fill: pal.ramps.hide.shade,
      stroke: pal.ink,
      'stroke-width': 0.9,
      'data-part': '2',
    }),
  ];
}

/** A character struck: two slashes across a rose wash, and the bandage that follows. */
function characterStruck(pal: Palette): SvgNode[] {
  return [
    el('path', {
      d: wobblyRing(10, 0.14, 0.7),
      fill: pal.accents.rose.light,
      opacity: 0.75,
      'data-part': '0',
    }),
    el('path', {
      d: 'M-13 -12L6 7M-6 -15L12 2',
      ...stroke(pal.accents.coral.shade, 2.6),
      'data-part': '1',
    }),
    el('path', {
      d: 'M-15 10C-6 6 6 4 15 5V11C6 10-6 12-15 16z',
      fill: pal.paper,
      stroke: pal.ink,
      'stroke-width': 1.5,
      'stroke-linejoin': 'round',
      'data-part': '2',
    }),
  ];
}

/** A threat hit: a spear head striking in, impact ticks, and one strength mark knocked loose. */
function threatHit(pal: Palette): SvgNode[] {
  return [
    el('path', {
      d: rays(8, 9, 15, -Math.PI / 8),
      ...stroke(pal.accents.coral.shade, 1.8),
      'data-part': '0',
    }),
    el('g', { 'data-part': '1' }, [
      el('path', {
        d: 'M-20 20L-4 4',
        ...stroke(pal.ramps.bark.shade, 3.2),
      }),
      el('path', {
        d: 'M-6.5 1.5L4 -4-1.5 6.5z',
        fill: pal.ramps.stone.base,
        stroke: pal.ink,
        'stroke-width': 1.4,
        'stroke-linejoin': 'round',
      }),
    ]),
    el('path', {
      d: 'M14 -17l3 4-3 4-3-4z',
      fill: pal.accents.coral.base,
      stroke: pal.accents.coral.shade,
      'stroke-width': 1.2,
      'stroke-linejoin': 'round',
      'data-part': '2',
    }),
  ];
}

/** A threat cleared: a dust cloud puffing apart, breeze lines carrying it off, a small clear sparkle. */
function threatCleared(pal: Palette): SvgNode[] {
  const puffs = [
    [-9, 4, 6],
    [0, -2, 7],
    [9, 4, 5.5],
    [2, 8, 5],
  ]
    .map(([x, y, r]) => ellipsePath(x!, y!, r!, r! * 0.8))
    .join('');
  return [
    el('path', {
      d: puffs,
      fill: pal.ramps.rock.light,
      stroke: pal.inkSoft,
      'stroke-width': 1.2,
      'data-part': '0',
    }),
    el('path', {
      d:
        smoothOpen([P(-20, -10), P(-12, -13), P(-4, -11)]) +
        smoothOpen([P(8, -15), P(15, -17), P(21, -13)]) +
        smoothOpen([P(12, 16), P(18, 18), P(22, 15)]),
      ...stroke(pal.inkSoft, 1.3),
      'data-part': '1',
    }),
    el('path', {
      d: 'M14 -4l1.2 3.6 3.6 1.2-3.6 1.2L14 5.6l-1.2-3.6L9.2 .8l3.6-1.2z',
      fill: pal.paper,
      stroke: pal.accents.sage.shade,
      'stroke-width': 1.2,
      'stroke-linejoin': 'round',
      'data-part': '2',
    }),
  ];
}

/** A defence holds: a slate shield, a blow glancing off it in arcs. */
function defenceHolds(pal: Palette): SvgNode[] {
  return [
    el('path', {
      d: wobblyRing(14, 0.08, 1.3),
      fill: pal.accents.slate.light,
      opacity: 0.6,
      'data-part': '0',
    }),
    el('g', { 'data-part': '1' }, [
      el('path', {
        d: 'M0 -14l11 4v9c0 8-5.5 12.5-11 15.5-5.5-3-11-7.5-11-15.5v-9z',
        fill: pal.ramps.stone.light,
        stroke: pal.ink,
        'stroke-width': 1.8,
        'stroke-linejoin': 'round',
      }),
      el('path', { d: 'M0 -12.5v26', ...stroke(pal.accents.slate.base, 2.4) }),
    ]),
    el('path', {
      d: 'M-14 -18c-4 2-6 6-6 10M14 -18c4 2 6 6 6 10M-17 4c-2 3-2 6 0 9M17 4c2 3 2 6 0 9',
      ...stroke(pal.accents.slate.shade, 1.7),
      'data-part': '2',
    }),
  ];
}

/** Befriended: a sage wash, a banner raised, two small twinkles. */
function befriended(pal: Palette): SvgNode[] {
  return [
    el('path', {
      d: wobblyRing(15, 0.1, 0.5),
      fill: pal.accents.sage.light,
      opacity: 0.7,
      'data-part': '0',
    }),
    el('g', { 'data-part': '1' }, [
      el('path', { d: 'M-6 18V-18', ...stroke(pal.ramps.bark.shade, 2.6) }),
      el('path', {
        d: 'M-5.5 -16.5H13l-4 6 4 6H-5.5z',
        fill: pal.accents.sage.base,
        stroke: pal.ink,
        'stroke-width': 1.5,
        'stroke-linejoin': 'round',
      }),
    ]),
    el('path', {
      d: 'M15 6l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM-15 -2l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z',
      fill: pal.paper,
      stroke: pal.accents.ochre.shade,
      'stroke-width': 1.1,
      'stroke-linejoin': 'round',
      'data-part': '2',
    }),
  ];
}

/** Angered: a red wash, two torch flames flaring, sharp ticks. */
function angered(pal: Palette): SvgNode[] {
  const flame = (x: number): string =>
    `M${x} 10c-4 0-6-2.5-6-6 0-4 3.5-5.5 4-9.5 1.5 2 2 3.5 2 3.5.5-3 2-5.5 4-6.5 0 3.5 2.5 5.5 2.5 9.5 0 5-2.5 9-6.5 9z`;
  return [
    el('path', {
      d: wobblyRing(15, 0.14, 2.4),
      fill: pal.accents.coral.light,
      opacity: 0.85,
      'data-part': '0',
    }),
    el('g', { 'data-part': '1' }, [
      el('path', { d: 'M-9 20V9M9 20V9', ...stroke(pal.ramps.bark.shade, 2.6) }),
      el('path', {
        d: flame(-9) + flame(9),
        fill: pal.accents.coral.base,
        stroke: pal.accents.coral.shade,
        'stroke-width': 1.3,
        'stroke-linejoin': 'round',
      }),
    ]),
    el('path', {
      d: rays(6, 17, 22, -Math.PI / 2 + 0.3),
      ...stroke(pal.ink, 1.6),
      'data-part': '2',
    }),
  ];
}

/** A boon: a warm glow, a tied gift bundle, rays around it. */
function boon(pal: Palette): SvgNode[] {
  return [
    el('path', {
      d: wobblyRing(14, 0.1, 1.9),
      fill: pal.accents.ochre.light,
      opacity: 0.8,
      'data-part': '0',
    }),
    el('g', { 'data-part': '1' }, [
      el('path', {
        d: 'M-9 13c-3.5-5.5-2.5-12.5 3-16l-2.5-5h17l-2.5 5c5.5 3.5 6.5 10.5 3 16z',
        fill: pal.ramps.sand.base,
        stroke: pal.ink,
        'stroke-width': 1.6,
        'stroke-linejoin': 'round',
      }),
      el('path', { d: 'M-6.5 -3.5h13', ...stroke(pal.accents.rose.shade, 2.4) }),
    ]),
    el('path', { d: rays(10, 17, 21), ...stroke(pal.accents.ochre.shade, 1.6), 'data-part': '2' }),
  ];
}

/** The season's end: dawn over a hill, rays rising, paw prints walking up to it. */
function seasonEnd(pal: Palette): SvgNode[] {
  const paw = (x: number, y: number, s: number): string =>
    ellipsePath(x, y, 2.2 * s, 1.8 * s) +
    [
      [-2, -2],
      [0, -2.9],
      [2, -2],
    ]
      .map(([dx, dy]) => ellipsePath(x + dx! * s, y + dy! * s, 0.8 * s, 0.8 * s))
      .join('');
  return [
    el('g', { 'data-part': '0' }, [
      el('path', { d: 'M-22 4A22 22 0 0 1 22 4z', fill: pal.accents.ochre.light }),
      el('path', { d: ellipsePath(0, 4, 8, 8), fill: pal.accents.ochre.base, opacity: 0.9 }),
    ]),
    el('g', { 'data-part': '1' }, [
      el('path', {
        d: 'M0 -8V-16M-8 -4.5l-6-6M8 -4.5l6-6M-12 1.5h-7M12 1.5h7',
        ...stroke(pal.accents.ochre.shade, 1.6),
      }),
      el('path', { d: 'M-24 6C-12 0 12 0 24 6', ...stroke(pal.ink, 1.6) }),
    ]),
    el('path', {
      d: paw(-8, 19, 1.1) + paw(-2, 13, 1) + paw(4, 9, 0.85),
      fill: pal.ink,
      'data-part': '2',
    }),
  ];
}

export const SEASON_MOMENTS: Readonly<Record<SeasonMomentKind, (p: Palette) => SvgNode[]>> = {
  'threat-appears': threatAppears,
  'creature-struck': creatureStruck,
  'character-struck': characterStruck,
  'threat-hit': threatHit,
  'threat-cleared': threatCleared,
  'defence-holds': defenceHolds,
  befriended,
  angered,
  boon,
  'season-end': seasonEnd,
};
