/**
 * The lure animal: a calm, round, small capybara drawn on a hex, normal (standing) or settled (lying down,
 * legs tucked, eyes closed), and the "leads left" mark of up to three pawprints, in the same style as the
 * nights-left embers. The `lead` action icon is in `action-motifs-r13.ts`.
 */
import { kit } from './feature-kit.ts';
import { boxOf, ellipsePath, poly, smoothClosed, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { inkAttrs, type Drawn } from './props.ts';
import { el, type SvgNode } from './svg.ts';
import { planes, worldContext, type TraceOptions } from './traces.ts';

export const CAPYBARA_STATES = ['normal', 'settled'] as const;
export type CapybaraState = (typeof CAPYBARA_STATES)[number];

/** Most leads a capybara shows (pawprints). */
export const LEADS_MAX = 3;

/** Drawn this much larger than its local units, so it reads at the map's zoom. */
const SCALE = 1.6;

/**
 * A capybara on a hex, `normal` or `settled`. The same options as the other world art (origin is where it
 * stands, on the ground). An unknown state draws the normal one.
 */
export function drawCapybara(palette: Palette, state: string, opts: TraceOptions = {}): Drawn {
  const settled = state === 'settled';
  const c = worldContext(palette, `capybara-${settled ? 'settled' : 'normal'}`, {
    ...opts,
    k: (opts.k ?? 1) * SCALE,
  });
  const { pts, fill, line } = kit(c);
  const { G } = planes(c);
  const pal = palette;
  const hide = pal.ramps.hide;
  const nodes: SvgNode[] = [];
  const g = G(0, 0);
  nodes.push(
    el('path', {
      d: ellipsePath(g.x + 1 * c.k, g.y, 15 * c.k, 3.8 * c.k * (c.squash / 0.6) * 0.8),
      fill: pal.shadow,
      opacity: 0.2,
    }),
  );
  const all: Point[] = [g];
  const part = (raw: readonly (readonly [number, number])[], tone: string, weight = 1): void => {
    const s = pts(raw);
    all.push(...s);
    nodes.push(fill(smoothClosed(s), tone), line(smoothClosed(s), weight));
  };
  if (settled) {
    // Lying: a round loaf of a body, feet tucked, the blunt head resting on the ground, eyes closed.
    part(
      [
        [-13, -1],
        [-13.6, -6],
        [-8, -11.4],
        [0, -12.6],
        [8, -10.4],
        [11.4, -5],
        [10, -0.6],
        [-4, 0],
      ],
      hide.base,
    );
    part(
      [
        [-11, -0.8],
        [-4, -4.6],
        [6, -4.4],
        [10, -0.8],
      ],
      hide.shade,
      0.6,
    );
    part(
      [
        [8.6, -1],
        [8.8, -9],
        [11.6, -11.6],
        [18.6, -11.2],
        [21.6, -7.8],
        [21.4, -2.6],
        [18.6, -0.6],
      ],
      hide.light,
    );
    part(
      [
        [9.2, -11],
        [9.6, -14.6],
        [12.4, -14.2],
        [12.4, -10.8],
      ],
      hide.shade,
    );
    nodes.push(
      el('path', { d: 'M12 -6.6c1.4 1.2 3 1.2 4.4 0', ...inkAttrs(pal.ink, c.ink * 0.9) }),
      el('path', {
        d: poly(
          pts([
            [20.4, -5.8],
            [21.8, -5.4],
          ]),
          false,
        ),
        ...inkAttrs(pal.ink, c.ink * 1.8),
      }),
    );
  } else {
    // Standing: short legs, a round barrel of a body, a big blunt head carried level, a tiny ear.
    const leg = (x: number): void => {
      const l = pts([
        [x, -4],
        [x - 0.4, 0],
        [x + 3, 0],
        [x + 3.2, -4],
      ]);
      all.push(...l);
      nodes.push(fill(poly(l), hide.shade), line(poly(l), 0.8));
    };
    [-9.6, -3.4, 3.6].forEach(leg);
    part(
      [
        [-13.4, -5],
        [-14, -11],
        [-8, -17.4],
        [1, -18.6],
        [9, -16],
        [12, -9.6],
        [10.4, -3.6],
        [-8, -3],
      ],
      hide.base,
    );
    part(
      [
        [-11, -4.4],
        [-3, -7.6],
        [8, -6.6],
        [10.4, -3.8],
        [-8, -3.2],
      ],
      hide.shade,
      0.6,
    );
    part(
      [
        [8.6, -5.2],
        [9, -17.6],
        [12.4, -21],
        [19.4, -20.6],
        [23, -16.4],
        [23.4, -9.4],
        [21, -5.2],
        [14, -4.6],
      ],
      hide.light,
    );
    part(
      [
        [9.8, -20.6],
        [10.4, -24.4],
        [13.4, -23.6],
        [13.4, -20],
      ],
      hide.shade,
    );
    const eye = pts([[15.6, -15.4]])[0]!;
    const nose = pts([[22.4, -13.4]])[0]!;
    nodes.push(
      el('path', { d: ellipsePath(eye.x, eye.y, 1 * c.k, 1.05 * c.k), fill: pal.ink }),
      el('path', { d: ellipsePath(nose.x, nose.y, 1.1 * c.k, 1.7 * c.k), fill: pal.ink }),
      el('path', { d: 'M17 -9.4c1.4 1 3 1 4.4 0', ...inkAttrs(pal.ink, c.ink * 0.7) }),
    );
  }
  return { nodes, box: boxOf(all) };
}

const paw = (x: number, y: number, s: number): string =>
  ellipsePath(x, y + 2.2 * s, 3 * s, 2.4 * s) +
  [
    [-3.4, -1.2],
    [-1.2, -3],
    [1.2, -3],
    [3.4, -1.2],
  ]
    .map(([dx, dy]) => ellipsePath(x + dx! * s, y + dy! * s, 1.15 * s, 1.3 * s))
    .join('');

/**
 * The leads-left mark for beside a lure animal, a centred `<svg>` (`size` px tall, default 24, 2.4 times as
 * wide): three pawprint slots, the first `leads` (0 to 3) filled, the rest faint dashed outlines. No numbers.
 */
export function drawLeadsLeft(palette: Palette, leads: number, size = 24): SvgNode {
  const n = Number.isFinite(leads) ? Math.max(0, Math.min(LEADS_MAX, Math.round(leads))) : 0;
  const pal = palette;
  const nodes = [0, 1, 2].map((i) => {
    const left = i < n;
    return el('path', {
      d: paw((i - 1) * 11.5, -0.6, 1),
      fill: left ? pal.ramps.bark.base : 'none',
      stroke: left ? pal.ramps.bark.shade : pal.inkSoft,
      'stroke-width': left ? 1.1 : 1,
      'stroke-linejoin': 'round',
      ...(left ? {} : { opacity: 0.45, 'stroke-dasharray': '2 2' }),
      'data-lead': left ? 'left' : 'spent',
    });
  });
  const h = Number.isFinite(size) && size > 0 ? size : 24;
  return el('svg', { viewBox: '-19 -8 38 16', width: h * 2.4, height: h }, [
    el('path', {
      d: 'M-17.5 -7h35a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-35a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z',
      fill: pal.paperDeep,
      stroke: pal.ink,
      'stroke-width': 0.9,
    }),
    ...nodes,
  ]);
}
