/**
 * The warden's care, drawn on the map: a soft ring over the six hexes around a warden (the escort), a
 * small shield mark on an escorted character, a bandage on a character struck today, and a shield raised
 * over the head of a warden defending from the creature's back. The marks on a figure follow the
 * character standee's proportions (`drawCharacter`), so they sit on any look.
 */
import { ART_TUNING } from './config.ts';
import { boxOf, ellipsePath, mapper, poly, smoothOpen, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { hexCenter, type Hex, type Projection } from './projection.ts';
import { inkAttrs, riseFor, type Drawn } from './props.ts';
import { glyphBadge, isGlyph } from './glyphs.ts';
import { el, type SvgNode } from './svg.ts';

/** Signs on a character for the day; all optional. */
export interface CharacterMarks {
  /** Next to a warden: a small shield mark at its shoulder. */
  readonly escorted?: boolean;
  /** Struck by a threat today: a bandage round its head. */
  readonly struck?: boolean;
  /** Defending the creature today: a round shield raised over its head. */
  readonly defending?: boolean;
  /**
   * A stance's glyph name (content `Stance.icon`) to show beside the head, for a stance that is doing
   * something (never rest). Unknown names draw nothing.
   */
  readonly stance?: string;
  /** Ended the day (waiting): a small hourglass at the other side of the head. */
  readonly waiting?: boolean;
}

/** The character standee's height in its own units (`drawCharacter`). */
const HEIGHT_UNITS = 50;

/**
 * The soft escort ring around a warden on `hex`: a wide, faint slate band over the six neighbouring hexes
 * and a dashed line through their centres, on the ground plane. Drawing coordinates, like `drawVeilLift`;
 * the part carries `data-escort="q,r"`.
 */
export function drawEscortRing(p: Projection, hex: Hex, palette: Palette): SvgNode {
  const c = hexCenter(p, hex.q, hex.r);
  const r = Math.sqrt(3) * p.size;
  const ring = ellipsePath(c.x, c.y, r, r * p.squash);
  return el('g', { 'data-escort': `${hex.q},${hex.r}` }, [
    el('path', {
      d: ring,
      fill: 'none',
      stroke: palette.accents.slate.light,
      'stroke-width': p.size * 1.15,
      opacity: 0.35,
    }),
    el('path', {
      d: ring,
      fill: 'none',
      stroke: palette.accents.slate.shade,
      'stroke-width': Math.max(1, 1.3 * p.k),
      'stroke-dasharray': `${(6 * p.k).toFixed(1)} ${(5 * p.k).toFixed(1)}`,
      'stroke-linecap': 'round',
      opacity: 0.7,
    }),
  ]);
}

/** A small kite shield at (x, y) (its centre), `s` its height scale, in screen px. */
export function shieldPath(x: number, y: number, w: number, h: number): string {
  return poly([
    { x: x - w / 2, y: y - h * 0.45 },
    { x, y: y - h * 0.55 },
    { x: x + w / 2, y: y - h * 0.45 },
    { x: x + w * 0.42, y: y + h * 0.05 },
    { x, y: y + h * 0.5 },
    { x: x - w * 0.42, y: y + h * 0.05 },
  ]);
}

/** A paper disc at `c` of radius `r` with a coloured rim, holding `inner`. */
function badge(
  palette: Palette,
  c: Point,
  r: number,
  rim: string,
  width: number,
  inner: SvgNode[],
): SvgNode[] {
  return [
    el('path', {
      d: ellipsePath(c.x, c.y, r, r),
      fill: palette.paper,
      stroke: rim,
      'stroke-width': width,
    }),
    ...inner,
  ];
}

/** A rectangle `w` × `h` centred on `c`, turned by `a` radians, as points. */
function skewRect(c: Point, w: number, h: number, a: number): Point[] {
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([u, v]) => ({ x: c.x + u! * cs - v! * sn, y: c.y + u! * sn + v! * cs }));
}

/**
 * A character's marks for the day, drawn over its standee at `origin` (its feet). Same arguments as
 * `drawCharacter`. Parts carry `data-mark="escorted" | "struck" | "defending" | "stance" | "waiting"`.
 */
export function drawCharacterMarks(
  palette: Palette,
  origin: Point,
  size: number,
  squash: number,
  ink: number,
  marks: CharacterMarks,
): Drawn {
  const k = (size * ART_TUNING.characterHeight) / HEIGHT_UNITS;
  const T = mapper(origin, k, 1, k * riseFor(squash));
  const w = ink * 0.95;
  const nodes: SvgNode[] = [];
  const all: Point[] = [];
  const line = (d: string, width = w, colour = palette.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, width) });
  if (marks.defending) {
    // An arm up from the shoulder and a round shield held over the head, seen a little from below: a slate
    // rim, a cross band and a boss, like the warden's emblem.
    const arm = [T(5, -28), T(9.5, -40), T(8, -47)];
    const c = T(4, -55);
    const rx = 12.5 * k;
    const ry = 9.5 * k;
    const cross =
      `M${(c.x - rx * 0.86).toFixed(1)} ${c.y.toFixed(1)}H${(c.x + rx * 0.86).toFixed(1)}` +
      `M${c.x.toFixed(1)} ${(c.y - ry * 0.86).toFixed(1)}V${(c.y + ry * 0.86).toFixed(1)}`;
    all.push({ x: c.x - rx, y: c.y - ry }, { x: c.x + rx, y: c.y + ry });
    nodes.push(
      el('g', { 'data-mark': 'defending' }, [
        line(smoothOpen(arm), w * 2.6, palette.skin),
        line(smoothOpen(arm), w * 0.8),
        el('path', {
          d: ellipsePath(c.x, c.y, rx, ry),
          fill: palette.ramps.stone.light,
          stroke: palette.accents.slate.shade,
          'stroke-width': w * 2.4,
        }),
        line(cross, w * 2, palette.ramps.bark.base),
        el('path', {
          d: ellipsePath(c.x, c.y, 3.2 * k, 2.6 * k),
          fill: palette.accents.slate.base,
          stroke: palette.ink,
          'stroke-width': w * 0.8,
        }),
        line(ellipsePath(c.x, c.y, rx + w * 1.2, ry + w * 1.2), w * 0.8),
      ]),
    );
  }
  if (marks.struck) {
    // A paper bandage across the brow, its tail ends fluttering, and a small rose spot.
    const band = poly([T(-7.6, -42.5), T(7.6, -44.5), T(7.6, -38.8), T(-7.6, -36.8)]);
    const tails = poly([T(-7.4, -40), T(-13.5, -43.5), T(-12.5, -37.5)]);
    const spot = T(2.2, -41);
    all.push(T(-13.5, -44.5), T(7.6, -36.8));
    nodes.push(
      el('g', { 'data-mark': 'struck' }, [
        el('path', { d: band + tails, fill: palette.paper }),
        el('path', {
          d: ellipsePath(spot.x, spot.y, 1.9 * k, 1.7 * k),
          fill: palette.accents.rose.base,
        }),
        line(band + tails, w * 0.8),
        line(poly([T(-3, -40.4), T(-1.5, -38.7)], false), w * 0.6, palette.inkSoft),
        // A badge at the right shoulder big enough to read at phone zoom: a rose-rimmed paper disc
        // with crossed plasters.
        ...badge(palette, T(13.5, -27), 8.5 * k, palette.accents.rose.shade, w * 1.4, [
          el('path', {
            d:
              poly(skewRect(T(13.5, -27), 11 * k, 3.6 * k, 0.7)) +
              poly(skewRect(T(13.5, -27), 11 * k, 3.6 * k, -0.7)),
            fill: palette.paper,
            stroke: palette.ink,
            'stroke-width': w * 0.8,
            'stroke-linejoin': 'round',
          }),
          el('path', {
            d: ellipsePath(T(13.5, -27).x, T(13.5, -27).y, 1.9 * k, 1.9 * k),
            fill: palette.accents.rose.base,
          }),
        ]),
      ]),
    );
  }
  if (marks.escorted) {
    // A small slate shield at the left shoulder, on a paper disc so it reads over any cloak.
    const c = T(-13.5, -27);
    const r = 8.5 * k;
    all.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
    nodes.push(
      el('g', { 'data-mark': 'escorted' }, [
        el('path', {
          d: ellipsePath(c.x, c.y, r, r),
          fill: palette.paper,
          stroke: palette.accents.slate.shade,
          'stroke-width': w * 1.4,
        }),
        el('path', {
          d: shieldPath(c.x, c.y + 0.4 * k, 9.5 * k, 11.5 * k),
          fill: palette.accents.slate.base,
          stroke: palette.ink,
          'stroke-width': w * 0.8,
          'stroke-linejoin': 'round',
        }),
        line(
          `M${c.x.toFixed(1)} ${(c.y - 5 * k).toFixed(1)}V${(c.y + 5.3 * k).toFixed(1)}`,
          w * 1.1,
          palette.accents.slate.light,
        ),
      ]),
    );
  }
  if (marks.stance !== undefined && isGlyph(marks.stance)) {
    // The stance the character's spare actions go to: a glyph on a paper disc up at the right of the head.
    const c = T(15, -49);
    const r = 8 * k;
    all.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
    nodes.push(
      glyphBadge(palette, 'stance', marks.stance, c.x, c.y, r, palette.accents.slate.shade, w),
    );
  }
  if (marks.waiting) {
    const c = T(-15, -49);
    const r = 8 * k;
    all.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
    nodes.push(glyphBadge(palette, 'waiting', 'hourglass', c.x, c.y, r, palette.inkSoft, w));
  }
  return { nodes, box: all.length ? boxOf(all) : boxOf([origin]) };
}

/** An escorted or struck mark on its own, as a centred `<svg>` of `px` px (for cards and the hub). */
export function drawStatusMark(kind: 'escorted' | 'struck', palette: Palette, px: number): SvgNode {
  const size = Number.isFinite(px) && px > 0 ? px : 24;
  const children =
    kind === 'escorted'
      ? [
          el('path', {
            d: ellipsePath(0, 0, 11, 11),
            fill: palette.paper,
            stroke: palette.accents.slate.shade,
            'stroke-width': 1.4,
          }),
          el('path', {
            d: shieldPath(0, 0.5, 12, 15),
            fill: palette.accents.slate.base,
            stroke: palette.ink,
            'stroke-width': 1.4,
            'stroke-linejoin': 'round',
          }),
          el('path', { d: 'M0 -6.5V7.5', ...inkAttrs(palette.accents.slate.light, 1.4) }),
        ]
      : [
          // A head with a bandage round the brow, its tails out to the left, a rose spot showing.
          el('path', {
            d: ellipsePath(0, 0, 11, 11),
            fill: palette.paper,
            stroke: palette.ink,
            'stroke-width': 1.4,
          }),
          el('path', {
            d: ellipsePath(0.5, 1, 7, 7),
            fill: palette.skin,
            stroke: palette.ink,
            'stroke-width': 1.2,
          }),
          el('path', {
            d: 'M-6.6 -3.2L7.4 -4.6V0L-6.6 1.4zM-6.4 -1.6L-10 -4.4-9.6 0.4z',
            fill: palette.paper,
            stroke: palette.ink,
            'stroke-width': 1.1,
            'stroke-linejoin': 'round',
          }),
          el('path', { d: ellipsePath(2.4, -1.6, 1.6, 1.4), fill: palette.accents.rose.base }),
          el('path', {
            d: ellipsePath(-1.6, 4, 0.8, 0.9) + ellipsePath(2.8, 4, 0.8, 0.9),
            fill: palette.ink,
          }),
        ];
  return el('svg', { viewBox: '-12 -12 24 24', width: size, height: size }, children);
}
