/**
 * Skill node icons: 30 nodes (five roles, two branches of three tiers), id `skill:<role>-<branch><tier>`
 * (`skill:scout-a1`, `skill:warden-b3`). Each is drawn so its effect reads without words: a tag icon with
 * a mark (plus, minus), a ring for range, a crossed action arrow for cheaper, a doubled material for yield.
 * A node sits on a round tile with a ring in its role's tint, and `drawSkillNode` gives it a look by state:
 * plain, veiled (under the map's hatch veil), available (glowing ring), taken (inked ring and a seal) or
 * closed (the other branch: faded, cut). `drawBranchPath` draws the path between two nodes.
 */
import { ellipsePath, f, poly, type Point } from './geom.ts';
import {
  ACTION_MOTIFS,
  ink,
  ITEM_MOTIFS,
  leafPath,
  MATERIAL_MOTIFS,
  MOTIFS,
  solid,
  type IconMotif,
} from './icon-motifs.ts';
import { accentRamp, type Palette } from './palette.ts';
import { ROLE_TINT } from './role-tint.ts';
import { actionArrowNodes, sealParts } from './team-marks.ts';
import { el, type SvgNode } from './svg.ts';

export type SkillRole = keyof typeof ROLE_TINT;
export type SkillState = 'plain' | 'veiled' | 'available' | 'taken' | 'closed';
export type BranchPathState = 'open' | 'taken' | 'closed';

export const SKILL_STATES: readonly SkillState[] = [
  'plain',
  'veiled',
  'available',
  'taken',
  'closed',
];

const P = (x: number, y: number): Point => ({ x, y });

// --- Small vocabulary -------------------------------------------------------------------------------

/** A motif drawn at `scale` about (cx, cy) instead of the grid centre (24, 24). */
function sub(motif: IconMotif, pal: Palette, cx: number, cy: number, scale: number): SvgNode {
  const tx = f(cx - 24 * scale);
  const ty = f(cy - 24 * scale);
  return el('g', { transform: `translate(${tx} ${ty}) scale(${scale})` }, motif(pal));
}

/** A pointy-top hexagon outline of circumradius r. */
function hexPath(cx: number, cy: number, r: number): string {
  return poly(
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (-90 + 60 * i);
      return P(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }),
  );
}

/** A four-point glint. */
function glint(pal: Palette, cx: number, cy: number, r: number): SvgNode {
  const k = r * 0.28;
  return solid(
    pal,
    poly([
      P(cx, cy - r),
      P(cx + k, cy - k),
      P(cx + r, cy),
      P(cx + k, cy + k),
      P(cx, cy + r),
      P(cx - k, cy + k),
      P(cx - r, cy),
      P(cx - k, cy - k),
    ]),
    pal.accents.ochre.light,
    1.1,
  );
}

/** A round badge with a plus (more) or a minus (less) on it. */
function badge(pal: Palette, cx: number, cy: number, kind: 'plus' | 'minus'): SvgNode[] {
  const col = kind === 'plus' ? pal.accents.sage : pal.accents.coral;
  return [
    solid(pal, ellipsePath(cx, cy, 5.2, 5.2), col.light, 1.4),
    ink(
      pal,
      kind === 'plus'
        ? `M${f(cx - 2.8)} ${f(cy)}h5.6M${f(cx)} ${f(cy - 2.8)}v5.6`
        : `M${f(cx - 2.8)} ${f(cy)}h5.6`,
      1.8,
      col.shade,
    ),
  ];
}

/** `n` small pips in a row centred on cx: the number of a bonus. `filled` of them are inked solid. */
function pips(pal: Palette, cx: number, cy: number, n: number, filled = n, r = 1.5): SvgNode[] {
  const gap = r * 2.9;
  return Array.from({ length: n }, (_, i) =>
    el('path', {
      d: ellipsePath(cx + (i - (n - 1) / 2) * gap, cy, r, r),
      fill: i < filled ? pal.accents.ochre.base : pal.paper,
      stroke: pal.ink,
      'stroke-width': 0.9,
    }),
  );
}

/** A strike across something: a paper halo and a coral slash from (x0, y0) to (x1, y1). */
function slash(pal: Palette, x0: number, y0: number, x1: number, y1: number): SvgNode[] {
  const d = `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
  return [ink(pal, d, 4.6, pal.paper), ink(pal, d, 2, pal.accents.coral.base)];
}

function dashedRing(cx: number, cy: number, r: number, colour: string): SvgNode {
  return el('path', {
    d: ellipsePath(cx, cy, r, r),
    fill: 'none',
    stroke: colour,
    'stroke-width': 1.5,
    'stroke-dasharray': '3 2.6',
    'stroke-linecap': 'round',
  });
}

/** The material or item motifs, scaled and doubled: one behind and one in front, for yield. */
function doubled(pal: Palette, motif: IconMotif): SvgNode[] {
  return [
    el('g', { opacity: 0.7 }, [sub(motif, pal, 17.5, 29, 0.66)]),
    sub(motif, pal, 29.5, 21, 0.66),
    ...pips(pal, 24, 41, 2),
  ];
}

/** Cheaper: a motif above one action arrow and one struck-out one. */
function cheaper(pal: Palette, motif: IconMotif): SvgNode[] {
  return [
    sub(motif, pal, 24, 17, 0.62),
    ...actionArrowNodes(pal, 12.5, 29, 9, 'ready'),
    ...actionArrowNodes(pal, 26.5, 29, 9, 'spent'),
    ...slash(pal, 23.5, 41, 38, 28.5),
  ];
}

const motif = (key: string): IconMotif =>
  MOTIFS[key] ?? MATERIAL_MOTIFS[key] ?? ITEM_MOTIFS[key] ?? ACTION_MOTIFS[key] ?? (() => []);

/** A small coral warning mark for a threat. */
function threat(pal: Palette, cx: number, cy: number, s = 1): SvgNode[] {
  return [
    solid(
      pal,
      poly([P(cx, cy - 5.5 * s), P(cx + 5.2 * s, cy + 4 * s), P(cx - 5.2 * s, cy + 4 * s)]),
      pal.accents.coral.base,
      1.4,
    ),
    ink(pal, `M${f(cx)} ${f(cy - 1.8 * s)}v${f(2.6 * s)}`, 1.4, pal.paper),
  ];
}

function hexDot(pal: Palette, cx: number, cy: number, r: number, fill: string): SvgNode {
  return solid(pal, hexPath(cx, cy, r), fill, 1.2);
}

function gear(cx: number, cy: number, ro: number, ri: number, teeth: number): string {
  const pts: Point[] = [];
  for (let i = 0; i < teeth; i += 1) {
    const a = (Math.PI * 2 * i) / teeth;
    const w = (Math.PI * 2) / teeth / 4;
    for (const [da, r] of [
      [-2 * w, ri],
      [-w, ro],
      [w, ro],
      [2 * w, ri],
    ] as const)
      pts.push(P(cx + Math.cos(a + da) * r, cy + Math.sin(a + da) * r));
  }
  return poly(pts);
}

// --- The 30 nodes -----------------------------------------------------------------------------------

const trowel: IconMotif = (pal) => [
  ink(pal, 'M11 38L21 28', 4, pal.ramps.bark.shade),
  ink(pal, 'M11 38L21 28', 1.4, pal.ramps.bark.light),
  solid(pal, leafPath(20, 29, -0.78, 20), pal.ramps.stone.base, 1.8),
];

const hammer: IconMotif = (pal) => [
  solid(
    pal,
    'M15.6 34.6l12.8-12.8 2.3 2.3-12.8 12.8c-.6.6-1.7.6-2.3 0-.6-.6-.6-1.7 0-2.3z',
    pal.ramps.bark.base,
    1.8,
  ),
  solid(pal, 'M22.5 15.5l6-6 3 3 3-1 2 2-1 3 3 3-6 6z', pal.ramps.stone.base),
];

const shieldMark: IconMotif = (pal) => [
  solid(pal, 'M24 9l11 4v9c0 8-5 12.5-11 16-6-3.5-11-8-11-16v-9z', pal.ramps.stone.light, 2),
  ink(pal, 'M24 11v26', 2.2, pal.accents.slate.base),
  solid(pal, ellipsePath(24, 22, 3, 3), pal.accents.slate.shade, 1.4),
];

export const SKILL_MOTIFS: Readonly<Record<string, IconMotif>> = {
  // --- Scout: safe ground (a) or far sight (b) ---
  // Trap sense: spikes seen by an open eye.
  'skill:scout-a1': (pal) => [
    sub(motif('spikes'), pal, 24, 30, 0.74),
    sub(motif('eye'), pal, 24, 14.5, 0.62),
  ],
  // Long survey: the hex you stand on, the ring beside it and a dashed ring two away.
  'skill:scout-a2': (pal) => [
    el('path', {
      d: hexPath(24, 24, 16.5),
      fill: 'none',
      stroke: pal.accents.ochre.base,
      'stroke-width': 1.6,
      'stroke-dasharray': '3 2.4',
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: hexPath(24, 24, 10.5),
      fill: pal.accents.sky.light,
      stroke: pal.inkSoft,
      'stroke-width': 1.3,
      'stroke-linejoin': 'round',
    }),
    hexDot(pal, 24, 24, 4.6, pal.paper),
    ink(pal, ellipsePath(24, 24, 1.1, 1.1), 1.4),
    solid(pal, ellipsePath(24, 7.5, 1.9, 1.9), pal.accents.ochre.base, 1.1),
  ],
  // Sweep: you in the middle, every neighbour washed in.
  'skill:scout-a3': (pal) => [
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return solid(
        pal,
        hexPath(24 + Math.cos(a) * 9.4, 24 + Math.sin(a) * 9.4, 4.9),
        pal.accents.sky.light,
        1.2,
      );
    }),
    hexDot(pal, 24, 24, 4.9, pal.paper),
    solid(pal, ellipsePath(24, 24, 2.2, 2.2), pal.ink, 1),
    glint(pal, 36, 11, 3.4),
  ],
  // Glints: a veiled hex that holds something that catches the light.
  'skill:scout-b1': (pal) => [
    solid(pal, hexPath(24, 26, 11.5), pal.paperDeep, 1.4),
    el('path', {
      d: 'M14.5 21.5l9 9M19 18l12 12M26 17.5l6.5 6.5M14 28l5 5',
      fill: 'none',
      stroke: pal.inkSoft,
      'stroke-width': 0.8,
      opacity: 0.6,
    }),
    glint(pal, 24, 25, 6.4),
    glint(pal, 36, 12, 3.2),
    glint(pal, 11, 14, 2.4),
  ],
  // Far sight: an eye, and a coral threat far off down a dashed sight line.
  'skill:scout-b2': (pal) => [
    sub(motif('eye'), pal, 18, 18, 0.72),
    el('path', {
      d: 'M24 24L32 32',
      stroke: pal.inkSoft,
      'stroke-width': 1.5,
      'stroke-dasharray': '2 2.4',
    }),
    ...threat(pal, 35, 35, 1.1),
    glint(pal, 37, 12, 2.6),
  ],
  // Forecast: a dashed path with two day marks ahead of the creature, for all.
  'skill:scout-b3': (pal) => [
    el('path', {
      d: 'M10 36C16 31 19 29 24 24S31 17 37 11',
      fill: 'none',
      stroke: pal.inkSoft,
      'stroke-width': 1.7,
      'stroke-dasharray': '3 2.6',
      'stroke-linecap': 'round',
    }),
    solid(pal, ellipsePath(10, 36, 3.2, 3.2), pal.ramps.hide.base, 1.4),
    solid(pal, ellipsePath(24, 24, 3, 3), pal.accents.coral.base, 1.4),
    solid(pal, ellipsePath(36.5, 11.5, 3, 3), pal.accents.coral.base, 1.4),
    ...pips(pal, 24, 39, 2),
    sub(motif('sun'), pal, 12, 13, 0.5),
  ],

  // --- Scholar: quick digs (a) or deep ones (b) ---
  'skill:scholar-a1': (pal) => cheaper(pal, trowel),
  // Steady hands: a hand held still, a plus on every site.
  'skill:scholar-a2': (pal) => [
    sub(motif('hand'), pal, 21, 26, 0.78),
    ...badge(pal, 35.5, 13, 'plus'),
    ink(pal, 'M31 33h6M32 36.5h4', 1.3, pal.inkSoft),
  ],
  // Second chamber: a second arch opening behind the first, with a find in it.
  'skill:scholar-a3': (pal) => [
    solid(pal, 'M23 37V21a7.5 7.5 0 0 1 15 0v16z', pal.ramps.stone.light, 1.8),
    solid(pal, 'M24.5 37V22a6 6 0 0 1 12 0v15z', pal.ramps.earth.shade, 1.1),
    glint(pal, 30.5, 28, 3.2),
    solid(pal, 'M9 37V24a7.5 7.5 0 0 1 15 0v13z', pal.ramps.stone.base, 1.8),
    solid(pal, 'M12 37V25a4.5 4.5 0 0 1 9 0v12z', pal.ramps.earth.shade, 1.1),
    ink(pal, 'M7 37.5h34', 1.4, pal.inkSoft),
  ],
  // Lamplight: a lantern lit against a dark moon.
  'skill:scholar-b1': (pal) => [
    sub(motif('lantern'), pal, 20, 27, 0.92),
    sub(motif('moon'), pal, 35, 14, 0.52),
    ...badge(pal, 36.5, 34, 'plus'),
  ],
  // Relic sense: a pearl and one pip lit out of three.
  'skill:scholar-b2': (pal) => [
    sub(motif('pearl'), pal, 24, 21, 0.82),
    glint(pal, 36, 11, 3.2),
    glint(pal, 12, 13, 2.4),
    ...pips(pal, 24, 38.5, 3, 1, 2),
  ],
  // Old maps: a rolled map with a distant site marked and a ring that reaches to it.
  'skill:scholar-b3': (pal) => [
    sub(motif('scroll'), pal, 20, 27, 0.78),
    dashedRing(20, 27, 14, pal.accents.ochre.base),
    hexDot(pal, 36, 12.5, 4.4, pal.accents.sky.light),
    glint(pal, 36, 12.5, 3),
  ],

  // --- Keeper: tending (a) or herding (b) ---
  'skill:keeper-a1': (pal) => doubled(pal, motif('forage')),
  // Soothing herbs: a bowl of berries, and peril going down.
  'skill:keeper-a2': (pal) => [
    sub(motif('feed'), pal, 21, 27, 0.74),
    el('path', {
      d: poly([P(33, 8), P(38, 8), P(36, 20), P(31, 20)]),
      fill: pal.accents.coral.base,
      stroke: pal.ink,
      'stroke-width': 1.2,
      'stroke-linejoin': 'round',
    }),
    ink(pal, 'M32 26l4.5 5 4.5-5', 2, pal.accents.sage.shade),
  ],
  // Contented: two days, hunger drains on the first and skips the second.
  'skill:keeper-a3': (pal) => [
    sub(motif('sun'), pal, 14, 15, 0.52),
    sub(motif('sun'), pal, 34, 15, 0.52),
    solid(pal, 'M14 25c-3 4-3 8 0 9.5s3 .1 3-3.5c0-2-1.5-3.5-3-6z', pal.accents.coral.base, 1.3),
    el('path', {
      d: 'M34 25c-3 4-3 8 0 9.5s3 .1 3-3.5c0-2-1.5-3.5-3-6z',
      fill: 'none',
      stroke: pal.inkSoft,
      'stroke-width': 1.3,
      'stroke-dasharray': '1.6 1.8',
    }),
    ...slash(pal, 29, 36, 39, 24),
  ],
  'skill:keeper-b1': (pal) => cheaper(pal, motif('linger')),
  // Hurry: two hops in a row.
  'skill:keeper-b2': (pal) => [
    hexDot(pal, 10.5, 33, 5.6, pal.accents.sage.light),
    hexDot(pal, 24, 33, 5.6, pal.accents.sage.light),
    hexDot(pal, 37.5, 33, 5.6, pal.accents.sage.light),
    solid(pal, ellipsePath(10.5, 32.5, 2.6, 2.6), pal.ramps.hide.base, 1.3),
    ink(pal, 'M11 26Q17.7 11 23.5 25.5', 2, pal.accents.ochre.base),
    ink(pal, 'M20.5 22.5l3 3.2 2.4-4', 2, pal.accents.ochre.base),
    ink(pal, 'M25 26Q31.7 11 37 25.5', 2, pal.accents.ochre.base),
    ink(pal, 'M34 22.5l3 3.2 2.4-4', 2, pal.accents.ochre.base),
  ],
  // Beacon: a fire whose reach is two rings wide.
  'skill:keeper-b3': (pal) => [
    dashedRing(24, 24, 17.5, pal.accents.ochre.base),
    dashedRing(24, 24, 12.5, pal.accents.coral.base),
    sub(motif('light-fire'), pal, 24, 25, 0.5),
  ],

  // --- Engineer: prospector (a) or artificer (b) ---
  'skill:engineer-a1': (pal) => doubled(pal, motif('iron')),
  // Pack mule: a bigger pack, ten slots.
  'skill:engineer-a2': (pal) => [
    sub(motif('pack'), pal, 24, 19, 0.78),
    ...pips(pal, 24, 34, 5, 5, 1.5),
    ...pips(pal, 24, 39.5, 5, 5, 1.5),
  ],
  // Monkey drone: a little round flyer reaching down for a stone.
  'skill:engineer-a3': (pal) => [
    ink(pal, 'M9 9.5h18M18 9.5v3', 1.8, pal.inkSoft),
    solid(pal, ellipsePath(11.5, 19.5, 2.8, 2.8), pal.accents.ochre.shade, 1.2),
    solid(pal, ellipsePath(24.5, 19.5, 2.8, 2.8), pal.accents.ochre.shade, 1.2),
    solid(pal, ellipsePath(18, 19, 7.4, 7), pal.accents.ochre.base, 1.6),
    el('path', {
      d: ellipsePath(15.5, 18, 1.1, 1.1) + ellipsePath(20.5, 18, 1.1, 1.1),
      fill: pal.ink,
    }),
    ink(pal, 'M16 21.5q2 1.6 4 0', 1.1),
    ink(pal, 'M18 26c0 5 4 6 7 10', 1.8, pal.inkSoft),
    sub(motif('stone'), pal, 30, 36, 0.6),
    ...pips(pal, 38, 14, 1),
  ],
  // Quick hands: a hammer and a plus of two.
  'skill:engineer-b1': (pal) => [
    sub(hammer, pal, 21, 27, 0.88),
    ...badge(pal, 36, 13, 'plus'),
    ...pips(pal, 36, 21, 2, 2, 1.3),
  ],
  // Thrift: the heaviest material, one fewer.
  'skill:engineer-b2': (pal) => [
    sub(motif('iron'), pal, 21, 28, 0.92),
    ...badge(pal, 36, 13, 'minus'),
    ...pips(pal, 36, 22, 1, 1, 1.3),
  ],
  // Self-winding: a gear that turns itself.
  'skill:engineer-b3': (pal) => [
    solid(pal, gear(24, 24, 11, 8.4, 8), pal.ramps.stone.base, 1.7),
    solid(pal, ellipsePath(24, 24, 3.6, 3.6), pal.paper, 1.4),
    el('path', {
      d: 'M24 5.5A18.5 18.5 0 0 1 42 22',
      fill: 'none',
      stroke: pal.accents.ochre.base,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    }),
    ink(pal, 'M38.5 18.5l3.6 4 3.2-4.4', 2, pal.accents.ochre.base),
    el('path', {
      d: 'M24 42.5A18.5 18.5 0 0 1 6 26',
      fill: 'none',
      stroke: pal.accents.ochre.base,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    }),
    ink(pal, 'M9.5 29.5l-3.6-4-3.2 4.4', 2, pal.accents.ochre.base),
  ],

  // --- Warden: shield (a) or word (b) ---
  'skill:warden-a1': (pal) => [
    sub(shieldMark, pal, 21, 25, 0.9),
    ...badge(pal, 36, 13, 'minus'),
    ...pips(pal, 36, 24, 3, 3, 1.4),
  ],

  'skill:warden-a2': (pal) => [
    hexDot(pal, 16.2, 24, 9.4, pal.accents.slate.light),
    hexDot(pal, 31.8, 24, 9.4, pal.accents.slate.light),
    sub(shieldMark, pal, 16.2, 24.5, 0.34),
    sub(shieldMark, pal, 31.8, 24.5, 0.34),
  ],

  'skill:warden-a3': (pal) => [
    sub(shieldMark, pal, 24, 24, 0.68),
    el('path', {
      d: 'M24 7A17 17 0 1 1 8.5 17',
      fill: 'none',
      stroke: pal.accents.ochre.base,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    }),
    ink(pal, 'M5 14l3.5 4 4-3.5', 2, pal.accents.ochre.base),
    ...actionArrowNodes(pal, 31, 32, 7, 'spent'),
    ...slash(pal, 29, 42, 40, 31),
  ],

  'skill:warden-b1': (pal) => [
    sub(motif('parley'), pal, 21, 25, 0.84),
    ...badge(pal, 36, 12.5, 'plus'),
    ...pips(pal, 36, 21, 3, 3, 1.2),
  ],

  'skill:warden-b2': (pal) => [
    solid(
      pal,
      'M8 20c5-5 10-5 16 1 6-6 11-6 16-1-5 0-10 2-16 8-6-6-11-8-16-8z',
      pal.ramps.stone.shade,
      1.6,
    ),
    ink(pal, 'M24 21v-3.5', 1.6),
    hexDot(pal, 11, 37, 4.3, pal.accents.rose.light),
    hexDot(pal, 24, 37, 4.3, pal.accents.rose.light),
    hexDot(pal, 37, 37, 4.3, pal.accents.rose.light),
    el('path', {
      d: 'M11 31Q24 25 37 31',
      fill: 'none',
      stroke: pal.accents.rose.shade,
      'stroke-width': 1.4,
      'stroke-dasharray': '2 2.2',
    }),
  ],

  'skill:warden-b3': (pal) => [
    solid(pal, 'M7 36V26l7-6 7 6v10z', pal.ramps.sand.base, 1.7),
    solid(pal, 'M5 27l9-8 9 8z', pal.accents.rose.base, 1.5),
    solid(pal, 'M12 36v-6h4.5v6z', pal.ramps.bark.shade, 1.1),
    el('path', {
      d: 'M16 17Q26 6 35 15',
      fill: 'none',
      stroke: pal.accents.rose.shade,
      'stroke-width': 1.6,
      'stroke-dasharray': '2.4 2.2',
    }),
    ink(pal, 'M31.5 12.5l4 2.7-.8 4.4', 1.8, pal.accents.rose.shade),
    ...threat(pal, 36, 28, 1.25),
    ink(pal, 'M42 21l3 -1.5M43 27.5h3', 1.6, pal.accents.coral.shade),
  ],
};

export const SKILL_ROLES: readonly SkillRole[] = [
  'scout',
  'scholar',
  'keeper',
  'engineer',
  'warden',
];

/** The 30 node ids, role by role, branch a then b, tiers 1 to 3. */
export const SKILL_IDS: readonly string[] = SKILL_ROLES.flatMap((role) =>
  ['a', 'b'].flatMap((branch) => [1, 2, 3].map((tier) => `skill:${role}-${branch}${tier}`)),
);

/** The role a skill id belongs to, or null. */
export function skillRoleOf(id: string): SkillRole | null {
  const role = /^skill:([a-z]+)-[ab][123]$/.exec(id)?.[1];
  return role && Object.hasOwn(ROLE_TINT, role) ? (role as SkillRole) : null;
}

// --- Tile and states --------------------------------------------------------------------------------

const TILE_R = 20;

function tileParts(pal: Palette, id: string): SvgNode[] {
  const role = skillRoleOf(id);
  const tint = accentRamp(pal, role ? ROLE_TINT[role] : 'slate');
  return [
    el('path', {
      d: ellipsePath(24, 24, TILE_R, TILE_R),
      fill: pal.paper,
      stroke: pal.ink,
      'stroke-width': 2.2,
    }),
    el('path', {
      d: ellipsePath(24, 24, 17.4, 17.4),
      fill: tint.light,
      'fill-opacity': 0.5,
      stroke: tint.shade,
      'stroke-width': 1.1,
    }),
    ...SKILL_MOTIFS[id]!(pal),
  ];
}

function veilPattern(pal: Palette, pid: string): SvgNode {
  return el(
    'pattern',
    {
      id: pid,
      patternUnits: 'userSpaceOnUse',
      width: 5,
      height: 5,
      patternTransform: 'rotate(32)',
    },
    [
      el('rect', { x: 0, y: 0, width: 5, height: 5, fill: pal.paperDeep, opacity: 0.82 }),
      el('rect', { x: 0, y: 0, width: 5, height: 5, fill: pal.shadow, opacity: 0.14 }),
      el('path', { d: 'M1 0V5', stroke: pal.inkSoft, 'stroke-width': 0.6, opacity: 0.5 }),
    ],
  );
}

/**
 * A skill node as a self-contained `<svg>` of `size` px. States: `plain`; `veiled` (the icon dim under the
 * map's hatch veil, a dotted rim, so only its tier and role tint show); `available` (a glowing ochre ring,
 * the web can pulse `data-glow`); `taken` (inked ring and a wax seal); `closed` (the other branch: faded,
 * a cut across it). Unknown ids draw a veiled blank.
 */
export function drawSkillNode(
  pal: Palette,
  id: string,
  size: number,
  state: SkillState = 'plain',
): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 48;
  const known = Object.hasOwn(SKILL_MOTIFS, id);
  const base = known ? tileParts(pal, id) : [];
  let parts: SvgNode[];
  if (!known || state === 'veiled') {
    const pid = `skill-veil-${pal.id}`;
    parts = [
      veilPattern(pal, pid),
      el('g', { opacity: 0.32 }, base),
      el('path', {
        d: ellipsePath(24, 24, TILE_R - 1, TILE_R - 1),
        fill: `url(#${pid})`,
        stroke: pal.inkSoft,
        'stroke-width': 1.6,
        'stroke-dasharray': '0.1 3.4',
        'stroke-linecap': 'round',
      }),
    ];
    if (!known)
      parts.push(
        el('path', {
          d: poly([P(24, 19), P(29, 24), P(24, 29), P(19, 24)]),
          fill: pal.inkSoft,
          opacity: 0.7,
        }),
      );
  } else if (state === 'available') {
    const glow = pal.accents.ochre;
    parts = [
      el('g', { 'data-glow': 'ready' }, [
        el('path', { d: ellipsePath(24, 24, 23.6, 23.6), fill: glow.light, opacity: 0.35 }),
        el('path', { d: ellipsePath(24, 24, 22.2, 22.2), fill: glow.light, opacity: 0.6 }),
        el('path', {
          d: ellipsePath(24, 24, 22.4, 22.4),
          fill: 'none',
          stroke: glow.base,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 2.6',
          'stroke-linecap': 'round',
        }),
      ]),
      ...base,
    ];
  } else if (state === 'taken') {
    const tint = accentRamp(pal, ROLE_TINT[skillRoleOf(id) ?? 'scout']);
    parts = [
      ...base,
      el('path', {
        d: ellipsePath(24, 24, 21.4, 21.4),
        fill: 'none',
        stroke: pal.ink,
        'stroke-width': 2.8,
      }),
      el('path', {
        d: ellipsePath(24, 24, 18.6, 18.6),
        fill: 'none',
        stroke: tint.base,
        'stroke-width': 2.2,
      }),
      ...sealParts(pal, 38.4, 38.4, 0.72),
    ];
  } else if (state === 'closed') {
    parts = [
      el('g', { opacity: 0.38 }, base),
      el('path', { d: ellipsePath(24, 24, TILE_R, TILE_R), fill: pal.paper, opacity: 0.35 }),
      ink(pal, 'M11 37L37 11', 4.4, pal.paper),
      ink(pal, 'M11 37L37 11', 1.8, pal.inkSoft),
    ];
  } else {
    parts = base;
  }
  return el(
    'svg',
    { viewBox: '0 0 48 48', width: px, height: px, 'data-skill-state': known ? state : 'veiled' },
    parts,
  );
}

/**
 * The path between two nodes, a segment `size` wide and 2/3 as tall, running top to bottom (the web
 * rotates it for the desktop's sideways trees): `open` is a thin inked line, `taken` a thick inked one with
 * a tinted core, `closed` a faded dotted one with a cut across its middle.
 */
export function drawBranchPath(pal: Palette, state: BranchPathState, size = 48): SvgNode {
  const w = Number.isFinite(size) && size > 0 ? size : 48;
  const h = (w * 2) / 3;
  const d = 'M24 0C24 10 24 22 24 32';
  const common = { fill: 'none', 'stroke-linecap': 'round' } as const;
  let parts: SvgNode[];
  if (state === 'taken') {
    parts = [
      el('path', { d, ...common, stroke: pal.ink, 'stroke-width': 5 }),
      el('path', { d, ...common, stroke: pal.accents.ochre.base, 'stroke-width': 2.2 }),
    ];
  } else if (state === 'closed') {
    parts = [
      el('g', { opacity: 0.45 }, [
        el('path', {
          d: 'M24 0V13M24 19V32',
          ...common,
          stroke: pal.inkSoft,
          'stroke-width': 2,
          'stroke-dasharray': '0.1 4',
        }),
      ]),
      ink(pal, 'M19 20l10-8', 1.8, pal.inkSoft),
      ink(pal, 'M19 12l10 8', 1.8, pal.inkSoft),
    ];
  } else {
    parts = [
      el('path', { d, ...common, stroke: pal.ink, 'stroke-width': 1.8 }),
      el('path', {
        d,
        ...common,
        stroke: pal.paper,
        'stroke-width': 0.9,
        'stroke-dasharray': '1 3',
      }),
    ];
  }
  return el('svg', { viewBox: '0 0 48 32', width: w, height: h, 'data-branch-path': state }, parts);
}
