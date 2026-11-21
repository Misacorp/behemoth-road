/**
 * Feedback marks from the Milestone 5 playtest: the ground plinth that sets a feature apart from the
 * decorative props, the explored-empty mark and its "nothing here" moment, the "out of reach" mark, a role
 * badge for a greyed action, and the mislead and relief moments with the small "misled" state mark.
 * Marks are self-contained `<svg>`s; moments follow `marks.ts` (three `data-part`s on the −24…24 grid).
 */
import { boxOf, ellipsePath, poly, smoothOpen, type Point } from './geom.ts';
import { drawIcon } from './icons.ts';
import { stroke, wobblyRing } from './moment-kit.ts';
import type { Palette } from './palette.ts';
import type { Drawn, PropContext } from './props.ts';
import { el, type SvgNode } from './svg.ts';

const P = (x: number, y: number): Point => ({ x, y });

const pxOr = (size: number, fallback: number): number =>
  Number.isFinite(size) && size > 0 ? size : fallback;

/** What a plinth says about the feature on it: a find (`calm`) or a trap (`danger`, `harmless` once defused). */
export type PlinthTone = 'calm' | 'danger' | 'harmless';

export interface PlinthOptions {
  /** Moves the disc this far down the screen, in local units (negative: back), so a cave door is not covered. */
  readonly dy?: number;
  /** Default `calm`. */
  readonly tone?: PlinthTone;
}

/** How far a plinth's top stands above the tile, in local units: features stand on it, rising above the tile. */
export const PLINTH_LIFT = 5;

/** How far the plinth's top stands above the ground at this context, in screen px. */
export function plinthLift(c: PropContext): number {
  return PLINTH_LIFT * c.k * (c.squash / 0.6);
}

const f1 = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * The plinth under a feature (a node, site, trap or settlement): a sandstone block that rises from the tile
 * (a lit top disc with a warm inner band, an ink rim, and a shaded wall and lip below), squashed with the
 * plane. Decorative props never get one, so at phone zoom a feature reads as "something here" and a pebble
 * does not. Everything stands on the top, which sits `plinthLift` above the ground: the caller lifts the
 * feature by the same amount. A trap's plinth carries the shared danger cue: a coral band and a ring of
 * jagged teeth (with `drawDangerFlag`); defused (`harmless`) the teeth lie flat and grey. `rx` is in local
 * units at the reference hex size.
 */
export function featurePlinth(c: PropContext, rx = 20, options: PlinthOptions = {}): Drawn {
  const tone = options.tone ?? 'calm';
  const sq = c.squash / 0.6;
  const ry = rx * 0.36 * sq;
  const lift = plinthLift(c);
  const x = c.origin.x;
  const base = c.origin.y + 0.5 * c.k + (options.dy ?? 0) * c.k * sq;
  const y = base - lift;
  const lip = 1.8 * c.k * sq;
  const wall = lift + lip;
  const pal = c.palette;
  const w = rx * c.k;
  const h = ry * c.k;
  const d = ellipsePath(x, y, w, h);
  const nodes: SvgNode[] = [];
  const all: Point[] = [P(x - w, y - h), P(x + w, base + h + lip)];
  if (tone !== 'calm') {
    // The danger ring: jagged teeth around the block, on the ground.
    const n = 14;
    const teeth: Point[] = [];
    for (let i = 0; i < n * 2; i += 1) {
      const a = (Math.PI * i) / n;
      const f = i % 2 === 0 ? 1.12 : tone === 'danger' ? 1.62 : 1.2;
      teeth.push(P(x + Math.cos(a) * w * f, base + Math.sin(a) * h * f));
    }
    const ring = poly(teeth);
    all.push(P(x - w * 1.62, base - h * 1.62), P(x + w * 1.62, base + h * 1.62));
    const danger = tone === 'danger';
    nodes.push(
      el('path', {
        d: ring,
        fill: danger ? pal.accents.coral.base : pal.ramps.neutral.shade,
        opacity: danger ? 0.95 : 0.6,
        'data-plinth': 'teeth',
      }),
      el('path', {
        d: ring,
        ...stroke(danger ? pal.accents.coral.shade : pal.inkSoft, c.ink * 0.9),
      }),
    );
  }
  const band =
    tone === 'danger'
      ? pal.accents.coral.base
      : tone === 'harmless'
        ? pal.inkSoft
        : pal.accents.ochre.light;
  nodes.push(
    el('path', {
      d: ellipsePath(x, base + lip, w, h),
      fill: pal.ramps.earth.shade,
      opacity: 0.8,
      'data-plinth': 'lip',
    }),
    // The wall: the strip between the top disc and the foot, in sandstone shade.
    el('path', {
      d: `M${f1(x - w)} ${f1(y)}V${f1(y + wall)}H${f1(x + w)}V${f1(y)}Z`,
      fill: pal.ramps.sand.shade,
      'data-plinth': 'wall',
    }),
    el('path', {
      d: `M${f1(x - w)} ${f1(y)}V${f1(y + wall)}M${f1(x + w)} ${f1(y)}V${f1(y + wall)}`,
      ...stroke(pal.ink, c.ink * 0.9, { opacity: 0.7 }),
    }),
    el('path', { d, fill: pal.paper, 'data-plinth': 'disc' }),
    el('path', {
      d: ellipsePath(x, y, w * 0.8, h * 0.8),
      ...stroke(
        band,
        c.ink * (tone === 'danger' ? 2.4 : 1.4),
        tone === 'harmless' ? { 'stroke-dasharray': '2 2.4' } : {},
      ),
      'data-plinth': 'band',
    }),
    el('path', { d, ...stroke(pal.ink, c.ink * 1.1, { opacity: 0.85 }), 'data-plinth': 'rim' }),
  );
  return { nodes, box: boxOf(all) };
}

/**
 * The warning pennant every live trap carries: a coral triangle with a bold ink bar and dot on a short
 * post at the plinth's front right, so danger reads at phone zoom without any text. `c.origin` is the
 * feature's base; `rx` is the plinth's half-width in local units.
 */
export function drawDangerFlag(c: PropContext, rx = 20): Drawn {
  const pal = c.palette;
  const T = (u: number, v: number): Point =>
    P(c.origin.x + (rx * 0.66 + u) * c.k, c.origin.y - plinthLift(c) + (3 + v * c.rise) * c.k);
  const post = [T(0, 2), T(0, -24)];
  const tri = [T(-7, -22), T(7, -22), T(0, -34)];
  const bar = [T(0, -27.6), T(0, -30.6)];
  const dot = T(0, -24.6);
  return {
    nodes: [
      el('path', { d: poly(post, false), ...stroke(pal.ramps.bark.shade, c.ink * 1.6) }),
      el('path', {
        d: poly(tri),
        fill: pal.accents.coral.base,
        stroke: pal.ink,
        'stroke-width': c.ink * 1.2,
        'stroke-linejoin': 'round',
        'data-mark': 'danger',
      }),
      el('path', { d: poly(bar, false), ...stroke(pal.ink, c.ink * 1.8) }),
      el('path', { d: ellipsePath(dot.x, dot.y, 0.9 * c.k, 0.9 * c.k), fill: pal.ink }),
    ],
    box: boxOf([...post, ...tri]),
  };
}

/**
 * The explored-empty mark: a hex someone surveyed or entered and found nothing. A faint dashed ring with a
 * small empty hollow, quieter than any feature. `fade` (0 to 1) fades it out as the days pass.
 */
export function drawEmptyMark(palette: Palette, size: number, fade = 0): SvgNode {
  const px = pxOr(size, 24);
  const t = Number.isFinite(fade) ? Math.min(1, Math.max(0, fade)) : 0;
  const opacity = Math.round((1 - t) * 0.7 * 100) / 100;
  return el('svg', { viewBox: '-12 -12 24 24', width: px, height: px, opacity }, [
    el('path', {
      d: ellipsePath(0, 0, 9.5, 6),
      ...stroke(palette.inkSoft, 1.1, { 'stroke-dasharray': '1.6 2.6' }),
    }),
    el('path', { d: ellipsePath(0, 0.5, 3.6, 2), fill: palette.ramps.earth.shade, opacity: 0.45 }),
    el('path', { d: ellipsePath(0, 0.5, 3.6, 2), ...stroke(palette.inkSoft, 0.9) }),
  ]);
}

/**
 * Out of reach: a short faded arrow, dashed, ending in a small cross where it is stopped. Points along
 * `angle` (screen radians, 0 is east). A centred `<svg>` of `size` px.
 */
export function drawOutOfReachMark(palette: Palette, size: number, angle = 0): SvgNode {
  const px = pxOr(size, 32);
  const a = Number.isFinite(angle) ? angle : 0;
  const rot = (x: number, y: number): Point =>
    P(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
  const cross = 2.6;
  const cx = 6;
  return el('svg', { viewBox: '-12 -12 24 24', width: px, height: px }, [
    el('path', {
      d: poly([rot(-9.5, 0), rot(2, 0)], false),
      ...stroke(palette.inkSoft, 1.6, { opacity: 0.5, 'stroke-dasharray': '2 2.2' }),
    }),
    el('path', {
      d:
        poly([rot(cx - cross, -cross), rot(cx + cross, cross)], false) +
        poly([rot(cx - cross, cross), rot(cx + cross, -cross)], false),
      ...stroke(palette.accents.coral.shade, 1.9, { opacity: 0.85 }),
    }),
  ]);
}

/**
 * A role's emblem as a small badge for an action greyed out because it needs that role: the emblem in full
 * colour on a paper halo with an ink rim, so it stays readable on a greyed button. `role` is a role id;
 * an unknown id draws the neutral mark.
 */
export function drawRoleBadge(role: string, palette: Palette, size: number): SvgNode {
  const px = pxOr(size, 20);
  const emblem = drawIcon(`role:${role}`, palette, 40);
  return el('svg', { viewBox: '0 0 48 48', width: px, height: px }, [
    el('path', {
      d: ellipsePath(24, 24, 23, 23),
      fill: palette.paper,
      stroke: palette.ink,
      'stroke-width': 1.8,
    }),
    el('svg', { ...emblem.attrs, x: 4, y: 4 }, emblem.children),
  ]);
}

/** A curved arrow that comes in, hooks and turns back away (the turned-away pursuer). */
function turnAway(scale: number, ox = 0, oy = 0): { shaft: string; head: string } {
  const S = (x: number, y: number): Point => P(ox + x * scale, oy + y * scale);
  return {
    shaft: smoothOpen([S(-14, 10), S(-6, 2), S(2, -4), S(9, -4), S(11, 2), S(6, 7)]),
    head: poly([S(9.5, 4.5), S(4.5, 9), S(3, 3.5)], false),
  };
}

/**
 * The "misled" state mark, for the HUD or a settlement while a mislead lasts: a slate disc with a hooked
 * arrow turning away. A centred `<svg>` of `size` px.
 */
export function drawMisledMark(palette: Palette, size: number): SvgNode {
  const px = pxOr(size, 24);
  const { shaft, head } = turnAway(0.62, -0.5, 0.5);
  return el('svg', { viewBox: '-12 -12 24 24', width: px, height: px }, [
    el('path', {
      d: ellipsePath(0, 0, 11, 11),
      fill: palette.accents.slate.light,
      stroke: palette.accents.slate.shade,
      'stroke-width': 1.4,
    }),
    el('path', { d: shaft + head, ...stroke(palette.ink, 1.7) }),
  ]);
}

export const FEEDBACK_MOMENT_KINDS = ['nothing-here', 'misled', 'peril-relieved'] as const;
export type FeedbackMomentKind = (typeof FEEDBACK_MOMENT_KINDS)[number];

/** Nothing here: a pale wash, an empty dashed ring, a few motes of dust drifting off. */
function nothingHere(pal: Palette): SvgNode[] {
  return [
    el('path', {
      d: wobblyRing(12, 0.1, 0.8),
      fill: pal.ramps.earth.light,
      opacity: 0.5,
      'data-part': '0',
    }),
    el('path', {
      d: ellipsePath(0, 2, 13, 8),
      ...stroke(pal.inkSoft, 1.4, { 'stroke-dasharray': '2.5 3.5' }),
      'data-part': '1',
    }),
    el('path', {
      d:
        ellipsePath(9, -9, 1.6, 1.6) +
        ellipsePath(14, -14, 1.2, 1.2) +
        ellipsePath(18, -19, 0.9, 0.9) +
        ellipsePath(-11, -8, 1.1, 1.1),
      fill: pal.inkSoft,
      opacity: 0.7,
      'data-part': '2',
    }),
  ];
}

/** Misled: a faint plum blot (the pursuer), its arrow hooking and turning away, a slate wash where it went. */
function misled(pal: Palette): SvgNode[] {
  const { shaft, head } = turnAway(1.25, -1, 1);
  return [
    el('path', {
      d: wobblyRing(9, 0.16, 1.4),
      fill: pal.accents.plum.base,
      opacity: 0.25,
      'data-part': '0',
    }),
    el('path', { d: shaft + head, ...stroke(pal.accents.slate.shade, 2.4), 'data-part': '1' }),
    el('path', {
      d: smoothOpen([P(-20, -14), P(-14, -17), P(-8, -15)]) + smoothOpen([P(-21, -7), P(-15, -9)]),
      ...stroke(pal.inkSoft, 1.3),
      'data-part': '2',
    }),
  ];
}

/** Peril relieved: a sage wash, a gauge whose coral fill has dropped, a down-stroke beside it. */
function perilRelieved(pal: Palette): SvgNode[] {
  const gauge =
    'M-6 -17h8c1.5 0 2.5 1 2.5 2.5v29c0 1.5-1 2.5-2.5 2.5h-8c-1.5 0-2.5-1-2.5-2.5v-29c0-1.5 1-2.5 2.5-2.5z';
  return [
    el('path', {
      d: wobblyRing(15, 0.08, 2.2),
      fill: pal.accents.sage.light,
      opacity: 0.7,
      'data-part': '0',
    }),
    el('g', { 'data-part': '1' }, [
      el('path', { d: gauge, fill: pal.paper }),
      el('path', { d: 'M-7 6h10v8h-10z', fill: pal.accents.coral.base }),
      el('path', {
        d: 'M-7 -9h10M-7 -3h10',
        ...stroke(pal.accents.coral.light, 1.4, { 'stroke-dasharray': '2 2' }),
      }),
      el('path', { d: gauge, ...stroke(pal.ink, 1.6) }),
    ]),
    el('path', {
      d: 'M13 -12v18M8.5 1.5L13 6l4.5-4.5',
      ...stroke(pal.accents.sage.shade, 2.2),
      'data-part': '2',
    }),
  ];
}

export const FEEDBACK_MOMENTS: Readonly<Record<FeedbackMomentKind, (p: Palette) => SvgNode[]>> = {
  'nothing-here': nothingHere,
  misled,
  'peril-relieved': perilRelieved,
};
