/**
 * Marks the map animates: short "moments" (an ink bloom when a hex is revealed, a burst for a find, a snap
 * for a sprung trap) and the small `via` mark on a path step (a hook where the grappling hook is used).
 * Each is a self-contained `<svg>` centred on its point (viewBox −24…24). A moment's parts carry
 * `data-part="0" | "1" | "2"` so the map can stage them (draw 0 first, 2 last); the drawing is the
 * finished frame.
 */
import { ellipsePath, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { el, type AttrValue, type SvgNode } from './svg.ts';

export const MOMENT_KINDS = ['reveal', 'find', 'trap', 'survey'] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

const P = (x: number, y: number): Point => ({ x, y });

function stroke(
  colour: string,
  width: number,
  extra: Record<string, AttrValue> = {},
): Record<string, AttrValue> {
  return {
    fill: 'none',
    stroke: colour,
    'stroke-width': width,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    ...extra,
  };
}

/** A wobbly ring of radius r (a calm, repeatable wobble), as path data. */
function wobblyRing(r: number, wobble: number, phase: number): string {
  const pts: Point[] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (Math.PI * 2 * i) / 12;
    const f = 1 + wobble * Math.sin(i * 2.3 + phase) * Math.cos(i * 0.7 + phase);
    pts.push(P(Math.cos(a) * r * f, Math.sin(a) * r * f));
  }
  return smoothClosed(pts);
}

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

const MOMENTS: Readonly<Record<MomentKind, (p: Palette) => SvgNode[]>> = {
  reveal,
  find,
  trap,
  survey,
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
