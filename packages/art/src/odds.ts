/**
 * The odds mark: how likely a roll is to go well or badly, without a number. A two-part bar (a calm sage part
 * for success, a warning coral part for failure, in proportion) or a row of 5 pips, with a small badge for
 * what failure means at the failing end: rocks (buried under a slide), an angry face (anger), or a jagged
 * spark for any other harm. A self-contained `<svg>`, 3.6 times as wide as tall.
 */
import { ellipsePath, poly, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { inkAttrs } from './props.ts';
import { el, type SvgNode } from './svg.ts';

export const ODDS_FAILURES = ['rocks', 'anger', 'harm'] as const;
export type OddsFailure = (typeof ODDS_FAILURES)[number];

export interface OddsOptions {
  /** `bar` (default) or `pips` (a row of five). */
  readonly style?: 'bar' | 'pips';
  /** Height in px (default 20). */
  readonly size?: number;
}

const P = (x: number, y: number): Point => ({ x, y });

/** What failure looks like, on a small paper badge at (0, 0), about 7 units across. */
function failureBadge(pal: Palette, failure: string): SvgNode[] {
  const base = [
    el('path', {
      d: ellipsePath(0, 0, 8.4, 8.4),
      fill: pal.paper,
      stroke: pal.accents.coral.shade,
      'stroke-width': 1.4,
    }),
  ];
  if (failure === 'rocks') {
    return [
      ...base,
      el('path', {
        d: poly([P(-5.4, 3.6), P(-5, -0.8), P(-1.8, -3), P(0.8, -0.6), P(0.4, 3.6)]),
        fill: pal.ramps.rock.base,
        stroke: pal.ink,
        'stroke-width': 0.9,
        'stroke-linejoin': 'round',
      }),
      el('path', {
        d: poly([P(-0.8, 3.6), P(0, -1.2), P(2.8, -3.6), P(5.4, -0.6), P(5, 3.6)]),
        fill: pal.ramps.rock.light,
        stroke: pal.ink,
        'stroke-width': 0.9,
        'stroke-linejoin': 'round',
      }),
    ];
  }
  if (failure === 'anger') {
    return [
      ...base,
      el('path', {
        d: ellipsePath(0, 0.6, 5.4, 5.4),
        fill: pal.accents.coral.base,
        stroke: pal.ink,
        'stroke-width': 0.9,
      }),
      el('path', { d: 'M-4 -3.4L-1 -1.8M4 -3.4L1 -1.8', ...inkAttrs(pal.ink, 1.3) }),
      el('path', {
        d: ellipsePath(-2, -0.4, 0.75, 0.75) + ellipsePath(2, -0.4, 0.75, 0.75),
        fill: pal.ink,
      }),
      el('path', { d: 'M-2.6 4c1.6-1.6 3.6-1.6 5.2 0', ...inkAttrs(pal.ink, 1.1) }),
    ];
  }
  return [
    ...base,
    el('path', {
      d: poly([
        P(0, -6),
        P(1.6, -1.8),
        P(5.8, -1),
        P(2.4, 1.6),
        P(3.4, 5.8),
        P(0, 3.4),
        P(-3.4, 5.8),
        P(-2.4, 1.6),
        P(-5.8, -1),
        P(-1.6, -1.8),
      ]),
      fill: pal.accents.coral.base,
      stroke: pal.accents.coral.shade,
      'stroke-width': 0.9,
      'stroke-linejoin': 'round',
    }),
  ];
}

/**
 * The odds mark for a roll with chance `success` (0 to 1; bad values count as 0) of going well, and
 * `failure` naming what going badly means (`rocks`, `anger`, anything else draws a spark). Carries
 * `data-success` (rounded to a percent) and `data-failure`.
 */
export function drawOddsMark(
  palette: Palette,
  success: number,
  failure: string = 'harm',
  opts: OddsOptions = {},
): SvgNode {
  const pal = palette;
  const s = Number.isFinite(success) ? Math.max(0, Math.min(1, success)) : 0;
  const h = Number.isFinite(opts.size) && (opts.size ?? 0) > 0 ? opts.size! : 20;
  const calm = pal.accents.sage;
  const warn = pal.accents.coral;
  const pips = opts.style === 'pips';
  const body: SvgNode[] = [];
  if (pips) {
    const lit = Math.round(s * 5);
    for (let i = 0; i < 5; i += 1) {
      const good = i < lit;
      body.push(
        el('path', {
          d: ellipsePath(-23 + i * 9.4, 0, 3.7, 3.7),
          fill: good ? calm.base : warn.base,
          stroke: good ? calm.shade : warn.shade,
          'stroke-width': 1.1,
          'data-odds': good ? 'success' : 'failure',
        }),
      );
    }
  } else {
    // A bar from -28 to 20: success from the left, failure after it; neither part vanishes unless it is 0 or 1.
    const x0 = -28;
    const w = 48;
    const split = s <= 0 || s >= 1 ? s : Math.max(0.06, Math.min(0.94, s));
    const mid = x0 + w * split;
    if (split > 0)
      body.push(
        el('path', {
          d: `M${x0} -4.6h${(mid - x0).toFixed(2)}v9.2h${(x0 - mid).toFixed(2)}z`,
          fill: calm.base,
          'data-odds': 'success',
        }),
      );
    if (split < 1)
      body.push(
        el('path', {
          d: `M${mid.toFixed(2)} -4.6h${(x0 + w - mid).toFixed(2)}v9.2h${(mid - x0 - w).toFixed(2)}z`,
          fill: warn.base,
          'data-odds': 'failure',
        }),
      );
    body.push(
      el('path', {
        d: `M${x0} -4.6h${w}v9.2h${-w}z`,
        fill: 'none',
        stroke: pal.ink,
        'stroke-width': 1.1,
        'stroke-linejoin': 'round',
      }),
    );
    if (split > 0 && split < 1)
      body.push(el('path', { d: `M${mid.toFixed(2)} -4.6v9.2`, ...inkAttrs(pal.ink, 1.1) }));
  }
  return el(
    'svg',
    {
      viewBox: '-36 -10 72 20',
      width: h * 3.6,
      height: h,
      'data-success': Math.round(s * 100),
      'data-failure': failure,
    },
    [
      el('path', {
        d: 'M-34 -8h58a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-58a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2z',
        fill: pal.paperDeep,
        stroke: pal.ink,
        'stroke-width': 0.9,
      }),
      ...body,
      el(
        'g',
        { transform: 'translate(27 0)', 'data-badge': 'failure' },
        failureBadge(pal, failure),
      ),
    ],
  );
}
