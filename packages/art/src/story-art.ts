/**
 * Story card art: small inked vignettes, card-sized (96 × 64), light and few strokes, for the season's twelve
 * route beats and four endings; and the gate signs (a bell with its clapper tied, a pearl on a stone). No
 * text. Every colour is the palette's. Each vignette is a soft wash blot with a handful of inked shapes.
 */
import { ellipsePath, smoothClosed, type Point } from './geom.ts';
import type { Palette, Ramp } from './palette.ts';
import { inkAttrs } from './props.ts';
import { el, type SvgNode } from './svg.ts';

export const STORY_VIGNETTE_IDS = [
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
] as const;
export type StoryVignetteId = (typeof STORY_VIGNETTE_IDS)[number];

export const GATE_SIGN_KINDS = ['bell', 'pearl'] as const;
export type GateSignKind = (typeof GATE_SIGN_KINDS)[number];

const W = 96;
const H = 64;
const P = (x: number, y: number): Point => ({ x, y });

/** The drawing toolbox for one palette. */
function tools(pal: Palette) {
  const ink = (d: string, w = 1.1, colour = pal.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, w) });
  const fill = (d: string, colour: string, opacity = 1): SvgNode =>
    el('path', opacity === 1 ? { d, fill: colour } : { d, fill: colour, opacity });
  const both = (d: string, colour: string, w = 1.1): SvgNode[] => [fill(d, colour), ink(d, w)];
  const blot = (cx: number, cy: number, rx: number, ry: number, phase = 0): string =>
    smoothClosed(
      Array.from({ length: 10 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 10;
        const f = 1 + 0.07 * Math.sin(i * 2.3 + phase);
        return P(cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f);
      }),
    );
  const wash = (colour: string, phase = 0, op = 0.7): SvgNode =>
    fill(blot(48, 33, 45, 29, phase), colour, op);
  /** A soft ground band from y to the bottom of the blot, with a wobbly inked line on top. */
  const ground = (y: number, colour: string): SvgNode[] => [
    fill(`M6 ${y}Q30 ${y - 2.4} 52 ${y}T90 ${y}V56Q48 60 6 56z`, colour, 0.85),
    ink(`M6 ${y}Q30 ${y - 2.4} 52 ${y}T90 ${y}`, 0.9),
  ];
  const tuft = (x: number, y: number, s = 3, colour = pal.accents.sage.shade): SvgNode =>
    ink(
      `M${x - s * 0.5} ${y}l-${s * 0.2} -${s}M${x} ${y}l0 -${s * 1.2}M${x + s * 0.5} ${y}l${s * 0.3} -${s * 0.9}`,
      0.8,
      colour,
    );
  /** The Mossback: a mossy dome of a back on two legs, head to one side. `d` faces right (1) or left (-1). */
  const mossback = (x: number, y: number, s = 1, d: 1 | -1 = 1, lift = false): SvgNode[] => {
    const X = (v: number): number => x + v * s * d;
    const Y = (v: number): number => y + v * s;
    const body = `M${X(-9)} ${Y(0)}C${X(-10)} ${Y(-10)} ${X(4)} ${Y(-12)} ${X(9)} ${Y(-5)}L${X(9)} ${Y(0)}z`;
    const front = lift ? `M${X(5)} ${Y(0)}l${3 * d * s} ${-3 * s}` : `M${X(5)} ${Y(0)}v${3 * s}`;
    return [
      ink(`M${X(-5)} ${Y(0)}v${3 * s}${front}`, 2.1 * s, pal.ramps.hide.shade),
      fill(body, pal.ramps.hide.base),
      fill(
        `M${X(-9)} ${Y(-2)}C${X(-9)} ${Y(-9)} ${X(-3)} ${Y(-11.4)} ${X(0)} ${Y(-11.4)}C${X(-4)} ${Y(-8)} ${X(-5)} ${Y(-4)} ${X(-5)} ${Y(-2)}z`,
        pal.accents.sage.base,
        0.9,
      ),
      ink(body, 1 * s),
      fill(ellipsePath(X(11.5), Y(-3), 3.4 * s, 2.7 * s), pal.ramps.hide.light),
      ink(ellipsePath(X(11.5), Y(-3), 3.4 * s, 2.7 * s), 0.9 * s),
      fill(ellipsePath(X(12.6), Y(-3.6), 0.5 * s, 0.5 * s), pal.ink),
      tuft(X(-3), Y(-10), 2.4 * s),
      tuft(X(1), Y(-11.6), 2.2 * s),
    ];
  };
  /** A tiny person: head, a coloured body, legs; or sitting. */
  const figure = (x: number, y: number, s: number, accent: Ramp, sit = false): SvgNode[] => [
    ink(
      sit ? `M${x} ${y - 3 * s}l${2.4 * s} ${3 * s}h${-3.4 * s}` : `M${x} ${y - 4 * s}v${4 * s}`,
      0.9,
      pal.ink,
    ),
    ink(`M${x} ${y - 9 * s}v${5.6 * s}`, 2.6 * s, accent.base),
    fill(ellipsePath(x, y - 11 * s, 1.7 * s, 1.7 * s), pal.skin),
    ink(ellipsePath(x, y - 11 * s, 1.7 * s, 1.7 * s), 0.7),
  ];
  const tree = (x: number, y: number, s = 1, tone: 'wood' | 'foliage' = 'wood'): SvgNode[] => [
    ink(`M${x} ${y}v${-6 * s}`, 1.6 * s, pal.ramps.bark.base),
    ...both(
      `M${x - 5 * s} ${y - 5 * s}Q${x - 6 * s} ${y - 15 * s} ${x} ${y - 17 * s}Q${x + 6 * s} ${y - 15 * s} ${x + 5 * s} ${y - 5 * s}z`,
      pal.ramps[tone].base,
      0.9,
    ),
  ];
  const stone = (x: number, y: number, h: number, ticks = 0): SvgNode[] => {
    const d = smoothClosed([
      P(x - 4, y),
      P(x - 4.6, y - h * 0.4),
      P(x - 2 + h * 0.1, y - h),
      P(x + 3 + h * 0.1, y - h * 0.9),
      P(x + 4.6, y - h * 0.3),
      P(x + 4, y),
    ]);
    return [
      fill(ellipsePath(x + 3, y, 8, 1.6), pal.shadow, 0.2),
      ...both(d, pal.ramps.stone.base, 1),
      fill(
        `M${x - 3.6} ${y - 1}L${x - 4} ${y - h * 0.4}L${x - 2 + h * 0.1} ${y - h * 0.94}L${x - 0.4} ${y - h * 0.4}z`,
        pal.ramps.stone.light,
        0.8,
      ),
      ...Array.from({ length: ticks }, (_, i) =>
        ink(`M${x - 2} ${y - h * (0.4 + i * 0.12)}l4.2 -0.4`, 0.8),
      ),
      fill(ellipsePath(x + 5.6, y + 0.4, 1.2, 0.8), pal.paper),
      ink(ellipsePath(x + 5.6, y + 0.4, 1.2, 0.8), 0.5),
    ];
  };
  const hill = (
    x0: number,
    x1: number,
    y: number,
    top: number,
    colour: string,
    op = 0.9,
  ): SvgNode[] => [
    fill(
      `M${x0} ${y}C${x0 + (x1 - x0) * 0.3} ${top} ${x0 + (x1 - x0) * 0.7} ${top} ${x1} ${y}z`,
      colour,
      op,
    ),
    ink(
      `M${x0} ${y}C${x0 + (x1 - x0) * 0.3} ${top} ${x0 + (x1 - x0) * 0.7} ${top} ${x1} ${y}`,
      0.8,
    ),
  ];
  return { ink, fill, both, wash, ground, tuft, mossback, figure, tree, stone, hill, blot };
}
type Kit = ReturnType<typeof tools>;

type Scene = (pal: Palette, t: Kit) => SvgNode[];

const SCENES: Readonly<Record<StoryVignetteId, Scene>> = {
  // A pen gate with a broken chain, the Mossback stepping over the low rail.
  'beat.setting-out': (pal, t) => [
    t.wash(pal.accents.ochre.light, 0.4),
    ...t.ground(46, pal.ramps.plain.light),
    ...[14, 34].flatMap((x) => t.both(`M${x - 2} 46V16H${x + 2}V46z`, pal.ramps.bark.light)),
    t.ink('M12 22H36M12 32H36', 1.4, pal.ramps.bark.shade),
    // The chain hangs from the post, one link split, the rest lying in the dust.
    t.ink('M34 24c2 3 1 6 2.4 9', 1.3, pal.accents.slate.shade),
    t.ink('M36.4 36l2.6 1.6M40 40l2.4 4M45 45h3.4', 1.3, pal.accents.slate.shade),
    ...t.mossback(64, 46, 1.35, 1, true),
    t.tuft(86, 46),
    t.tuft(8, 46),
  ],
  'beat.first.wooded': (pal, t) => [
    t.wash(pal.accents.sage.light, 1),
    ...t.ground(48, pal.ramps.moss.light),
    ...t.tree(18, 48, 1.3),
    ...t.tree(34, 46, 1.1),
    ...t.tree(80, 48, 1.4),
    ...t.mossback(56, 48, 1.1),
    ...t.tree(70, 46, 1),
  ],
  'beat.first.dry': (pal, t) => [
    t.wash(pal.ramps.dune.light, 2),
    t.fill(ellipsePath(72, 15, 6, 6), pal.accents.ochre.base, 0.9),
    ...t.hill(4, 60, 48, 34, pal.ramps.dune.base),
    ...t.hill(40, 94, 50, 38, pal.ramps.sand.base),
    ...t.mossback(34, 48, 1.1),
    t.tuft(70, 49, 3, pal.ramps.heath.shade),
    t.tuft(12, 49, 2.6, pal.ramps.heath.shade),
    t.ink('M20 53h6M50 55h8', 0.8, pal.ramps.sand.shade),
  ],
  'beat.first.steep': (pal, t) => [
    t.wash(pal.ramps.crag.light, 3),
    t.fill('M6 54L34 16L52 30L70 8L92 54z', pal.ramps.crag.base, 0.95),
    t.fill('M52 30L70 8L92 54L66 54z', pal.ramps.crag.shade, 0.5),
    t.ink('M6 54L34 16L52 30L70 8L92 54', 1),
    t.ink('M20 54L40 46L28 40L46 33', 1, pal.ramps.stone.shade),
    ...t.mossback(46, 33, 0.9, 1, true),
    t.ink('M34 24l3 3M62 22l3 4M72 34l-2 4', 0.8, pal.ramps.crag.shade),
  ],
  'beat.first.water': (pal, t) => [
    t.wash(pal.accents.sky.light, 4),
    t.fill('M4 38Q30 33 52 38T92 38V58H4z', pal.ramps.water.base, 0.9),
    t.ink('M4 38Q30 33 52 38T92 38', 0.9),
    t.ink('M18 46q4-2 8 0M44 51q5-2 10 0M66 44q4-2 8 0', 0.9, pal.ramps.shoal.light),
    ...t.hill(0, 40, 38, 24, pal.ramps.plain.base),
    ...t.mossback(26, 38, 1.1),
    t.ink('M78 38v-8M82 38v-6M85 38v-9', 1, pal.accents.sage.shade),
  ],
  'beat.first.boggy': (pal, t) => [
    t.wash(pal.ramps.mire.light, 5),
    ...t.ground(46, pal.ramps.mire.base),
    t.fill(ellipsePath(24, 50, 9, 2.4), pal.ramps.water.base, 0.6),
    t.fill(ellipsePath(72, 51, 11, 2.6), pal.ramps.water.base, 0.6),
    ...[10, 18, 80, 88].flatMap((x) => [
      t.ink(`M${x} 46l-1 -12M${x + 2} 46l1 -9`, 0.9, pal.ramps.mire.shade),
      t.fill(ellipsePath(x - 1, 33, 1, 2.2), pal.ramps.bark.base),
    ]),
    ...t.mossback(52, 46, 1.1),
    t.ink('M32 36q10-3 22 0M58 28q12-3 24 0', 0.8, pal.fog),
  ],
  // Smoke at dusk rising behind a low hill; the Mossback small in front, looking back.
  'beat.first.captors': (pal, t) => [
    t.wash(pal.accents.plum.light, 6),
    t.fill(ellipsePath(70, 24, 7, 7), pal.accents.coral.light, 0.8),
    t.ink('M52 40c-4-6 4-10 0-16s4-8 2-14M62 40c-3-7 3-10 0-18', 1.2, pal.accents.plum.shade),
    ...t.hill(30, 94, 44, 34, pal.accents.slate.base),
    t.ink('M64 41l4-7 4 7zM74 41l3-5 3 5z', 0.9, pal.accents.slate.shade),
    ...t.ground(50, pal.ramps.moss.base),
    ...t.mossback(18, 50, 1.1, -1),
  ],
  // A gate with a bell whose clapper is tied; children on the wall above.
  'beat.first.settlement': (pal, t) => [
    t.wash(pal.accents.ochre.light, 7),
    ...t.ground(50, pal.ramps.upland.base),
    ...t.both('M12 50V28H84V50H62V36Q48 26 34 36V50z', pal.ramps.stone.base),
    t.ink('M12 28H84', 1.4),
    ...t.both('M28 28V24H32V28zM50 28V24H54V28zM70 28V24H74V28z', pal.ramps.stone.light, 0.9),
    ...t.figure(22, 28, 0.75, pal.accents.rose),
    ...t.figure(56, 28, 0.75, pal.accents.sky),
    ...t.figure(78, 28, 0.75, pal.accents.sage),
    t.ink('M48 36V40', 0.9),
    ...t.both('M44 46Q44 40 48 40T52 46z', pal.accents.ochre.base, 1),
    // The clapper tied up with a band across the mouth.
    t.ink('M44.4 44.4H51.6', 1.5, pal.accents.rose.shade),
    t.tuft(8, 50),
    t.tuft(90, 50),
  ],
  'beat.waymark.quarter': (pal, t) => waymarkScene(pal, t, 1, pal.accents.ochre.light),
  'beat.waymark.half': (pal, t) => waymarkScene(pal, t, 2, pal.accents.sky.light),
  'beat.waymark.three-quarters': (pal, t) => waymarkScene(pal, t, 3, pal.accents.plum.light),
  // The Greyfold: a green valley seen from a rim.
  'beat.destination': (pal, t) => [
    t.wash(pal.accents.sky.light, 8),
    ...t.hill(0, 44, 30, 14, pal.ramps.crag.base),
    ...t.hill(52, 96, 30, 14, pal.ramps.crag.base),
    t.fill('M30 30C40 34 56 34 66 30V44Q48 50 30 44z', pal.accents.sage.base, 0.9),
    t.ink('M44 36q4 2 8 0q-3 4 2 8', 1, pal.ramps.water.base),
    t.fill('M0 44Q24 40 48 50T96 44V60H0z', pal.accents.sage.light),
    t.ink('M0 44Q24 40 48 50T96 44', 1.3, pal.accents.sage.shade),
    t.tuft(14, 48),
    t.tuft(84, 47),
    ...t.mossback(24, 55, 1, 1),
  ],
  'ending.mossback.safe': (pal, t) => [
    t.wash(pal.accents.sage.light, 9),
    ...t.hill(0, 96, 50, 18, pal.accents.sage.base, 0.9),
    t.fill(ellipsePath(78, 14, 6, 6), pal.accents.ochre.base, 0.9),
    // Two figures raising a hut on the rim: frame, roof, a rope between them.
    t.ink('M52 50V34M66 50V34M52 34L59 26L66 34', 1.3, pal.ramps.bark.shade),
    t.fill('M52 34L59 26L66 34z', pal.accents.ochre.base, 0.9),
    ...t.figure(46, 50, 0.95, pal.accents.rose),
    ...t.figure(72, 50, 0.95, pal.accents.teal),
    ...t.mossback(24, 52, 1.1),
  ],
  // Arrived wounded: the Mossback lying at the valley's edge, a bandage on its flank, dusk.
  'ending.mossback.wounded': (pal, t) => [
    t.wash(pal.accents.plum.light, 10),
    ...t.hill(0, 96, 48, 20, pal.accents.sage.base, 0.8),
    ...t.ground(52, pal.ramps.moss.light),
    ...lying(pal, t, 48, 51),
    t.tuft(14, 52),
    t.tuft(84, 52),
  ],
  // Lost to captors: a mill wheel turning far off beside the empty road.
  'ending.lost.pursuer': (pal, t) => [
    t.wash(pal.accents.slate.light, 11),
    ...t.hill(0, 96, 40, 28, pal.accents.slate.base, 0.7),
    ...t.both('M62 40V28H76V40z', pal.ramps.stone.light, 0.9),
    t.ink('M60 28L69 21L78 28', 1),
    t.fill(ellipsePath(62, 34, 5.6, 5.6), pal.paper, 0.6),
    t.ink(`${ellipsePath(62, 34, 5.6, 5.6)}M62 28.4V39.6M56.4 34H67.6M58 30l8 8M66 30l-8 8`, 0.8),
    ...t.ground(50, pal.ramps.moss.light),
    // Paw prints leading off toward it, fading.
    ...[10, 22, 34, 46].map((x, i) =>
      t.fill(ellipsePath(x, 52 - i * 1.6, 2, 1.3), pal.ink, 0.7 - i * 0.15),
    ),
  ],
  // Lost to hunger: pale grass, and someone sitting beside the moss.
  'ending.lost.hunger': (pal, t) => [
    t.wash(pal.fog, 12, 0.9),
    ...t.ground(46, pal.ramps.heath.light),
    ...[10, 18, 26, 62, 72, 82, 90].map((x, i) =>
      t.tuft(x, 46 + (i % 2), 3.4, pal.ramps.heath.base),
    ),
    t.fill('M40 46C40 38 50 36 56 40C60 42 60 46 60 46z', pal.accents.sage.base, 0.9),
    t.ink('M40 46C40 38 50 36 56 40C60 42 60 46 60 46', 1),
    ...t.figure(68, 47, 1, pal.accents.slate, true),
    t.ink('M64 42l-4 4', 1, pal.ramps.hide.base),
  ],
};

/** A standing stone on a rise, `ticks` scratches on it, a small Mossback far off on the route. */
function waymarkScene(pal: Palette, t: Kit, ticks: number, sky: string): SvgNode[] {
  return [
    t.wash(sky, ticks),
    ...t.hill(0, 96, 52, 30, pal.ramps.plain.base, 0.9),
    ...t.stone(40, 50, 30, ticks),
    ...t.mossback(76, 46, 0.55, -1),
    t.tuft(18, 50),
    t.tuft(58, 52),
  ];
}

/** The Mossback lying down, head resting, a pale bandage round its flank. */
function lying(pal: Palette, t: Kit, x: number, y: number): SvgNode[] {
  const body = `M${x - 18} ${y}C${x - 18} ${y - 14} ${x + 8} ${y - 15} ${x + 16} ${y - 4}L${x + 16} ${y}z`;
  return [
    t.fill(ellipsePath(x + 2, y, 24, 2.2), pal.shadow, 0.2),
    t.fill(body, pal.ramps.hide.base),
    t.fill(
      `M${x - 17} ${y - 3}C${x - 16} ${y - 12} ${x - 6} ${y - 14} ${x} ${y - 13}C${x - 6} ${y - 9} ${x - 8} ${y - 4} ${x - 8} ${y - 1}z`,
      pal.accents.sage.base,
      0.9,
    ),
    t.ink(body, 1.1),
    t.fill(ellipsePath(x + 20, y - 2.4, 4.6, 3.6), pal.ramps.hide.light),
    t.ink(ellipsePath(x + 20, y - 2.4, 4.6, 3.6), 1),
    t.ink(`M${x + 21} ${y - 3}h1.6`, 1, pal.ink),
    // The bandage: a pale band over the flank with a knot.
    t.fill(`M${x + 2} ${y - 12.6}l5 -0.8l1.4 12.6l-5 0.6z`, pal.paper),
    t.ink(`M${x + 2} ${y - 12.6}l5 -0.8l1.4 12.6l-5 0.6zM${x + 4} ${y - 8}l2.4 -0.4`, 0.8),
  ];
}

/**
 * A story card vignette as a `<svg>` of `width` px (default 96; the height keeps the 3 : 2 shape). An id
 * outside the season's sixteen draws the setting-out beat.
 */
export function drawStoryVignette(palette: Palette, id: string, width = W): SvgNode {
  const w = Number.isFinite(width) && width > 0 ? width : W;
  const scene = (STORY_VIGNETTE_IDS as readonly string[]).includes(id)
    ? SCENES[id as StoryVignetteId]
    : SCENES['beat.setting-out'];
  return el(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, width: w, height: (w * H) / W },
    scene(palette, tools(palette)),
  );
}

/**
 * A gate sign as a centred `<svg>` of `size` px (default 32): `bell` (a bell with its clapper tied, the hill
 * folk) or `pearl` (a pearl on a stone, the river folk). An unknown kind draws the bell.
 */
export function drawGateSign(palette: Palette, kind: string, size = 32): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 32;
  const t = tools(palette);
  const pal = palette;
  const nodes: SvgNode[] =
    kind === 'pearl'
      ? [
          t.fill(ellipsePath(0, 10, 15, 3), pal.shadow, 0.2),
          ...t.both('M-14 10C-15 2-8 -2 0 -2C8 -2 15 2 14 10z', pal.ramps.stone.base, 1.6),
          t.fill('M-12 8C-11 3-6 0-2 0C-5 3-6 6-6 9z', pal.ramps.stone.light, 0.8),
          ...t.both(ellipsePath(0, -6.5, 6.4, 6.4), pal.paper, 1.6),
          t.ink('M-3.4 -9.4a4 4 0 0 1 3.4-2.2', 1.5, pal.accents.sky.base),
          t.fill(ellipsePath(2.2, -4, 1.6, 1.2), pal.accents.rose.light, 0.9),
        ]
      : [
          t.ink('M0 -15V-11', 1.8),
          ...t.both(
            'M-9 9C-9 4-8 -2-6 -5C-4 -9 4 -9 6 -5C8 -2 9 4 9 9z',
            pal.accents.ochre.base,
            1.6,
          ),
          t.fill('M-7.4 7.5C-7.4 3-6.6 -1-5 -4C-6 0-6 4-5.4 7.5z', pal.accents.ochre.light, 0.9),
          t.ink('M-11 9H11', 1.8),
          // The clapper is tied up: a band across the mouth and a knot.
          t.ink('M-8.6 5.6H8.6', 2.4, pal.accents.rose.base),
          t.ink('M-8.6 5.6H8.6', 1, pal.ink),
          t.ink('M0 5.6l-2.6 5.4M0 5.6l2.6 5.4', 1.5, pal.accents.rose.shade),
        ];
  return el('svg', { viewBox: '-16 -16 32 32', width: px, height: px }, nodes);
}
