/**
 * The hand cart: a small two-wheeled cart in the world style, drawn on a hex in four states: empty, loaded
 * (crates and logs showing), with a rider sitting in it, and hitched (a character pulling the shafts). Also
 * the cargo-fill mark. The cart faces right, its shafts out in front. The `hitch`, `board-cart`, `load` and
 * `unload` icons are in `action-motifs-r13.ts`.
 */
import { kit } from './feature-kit.ts';
import { boxOf, ellipsePath, poly, smoothClosed, type Point } from './geom.ts';
import { accentRamp, type Palette } from './palette.ts';
import { inkAttrs, type Drawn } from './props.ts';
import { el, type SvgNode } from './svg.ts';
import { planes, worldContext, type TraceOptions } from './traces.ts';

export const CART_STATES = ['empty', 'loaded', 'rider', 'hitched'] as const;
export type CartState = (typeof CART_STATES)[number];

export interface CartOptions extends TraceOptions {
  /** The accent (a palette accent key) of the rider or puller's clothes (default `sage`). */
  readonly accent?: string;
}

/** Drawn this much larger than its local units, so it reads at the map's zoom. */
const SCALE = 1.3;

type Raw = readonly (readonly [number, number])[];

/**
 * A hand cart on a hex. `origin` is the foot of its wheel on the ground. An unknown state draws it empty.
 * Hitched, a puller walks between the shafts ahead of it and the cart is empty.
 */
export function drawCart(palette: Palette, state: string, opts: CartOptions = {}): Drawn {
  const kind: CartState = (CART_STATES as readonly string[]).includes(state)
    ? (state as CartState)
    : 'empty';
  const c = worldContext(palette, `cart-${kind}`, { ...opts, k: (opts.k ?? 1) * SCALE });
  const { pts, line } = kit(c);
  const { G } = planes(c);
  const pal = palette;
  const bark = pal.ramps.bark;
  const tint = accentRamp(pal, opts.accent ?? 'sage');
  const nodes: SvgNode[] = [];
  const all: Point[] = [];
  const g = G(0, 0);
  nodes.push(
    el('path', {
      d: ellipsePath(g.x + 4 * c.k, g.y, 22 * c.k, 4 * c.k * (c.squash / 0.6) * 0.8),
      fill: pal.shadow,
      opacity: 0.2,
    }),
  );
  const poly2 = (raw: Raw, tone: string, weight = 1): void => {
    const s = pts(raw);
    all.push(...s);
    nodes.push(el('path', { d: poly(s), fill: tone }), line(poly(s), weight));
  };

  // The far wheel, a little behind the bed.
  const far = pts([[-2.4, -8.6]])[0]!;
  nodes.push(
    el('path', {
      d: ellipsePath(far.x, far.y, 7.6 * c.k, 8 * c.k * c.rise),
      fill: bark.shade,
      opacity: 0.75,
    }),
  );

  // Behind the bed: what rides in the cart sits in it, so the front board is drawn after.
  if (kind === 'loaded') {
    // Two braced crates and a pair of logs lying across the top, their ends showing.
    poly2(
      [
        [-14.6, -12],
        [-14.6, -31],
        [-3.4, -31],
        [-3.4, -12],
      ],
      bark.light,
    );
    nodes.push(
      line(
        poly(
          pts([
            [-14.6, -12],
            [-3.4, -31],
          ]),
          false,
        ) +
          poly(
            pts([
              [-14.6, -31],
              [-3.4, -12],
            ]),
            false,
          ),
        0.7,
        bark.shade,
      ),
    );
    poly2(
      [
        [-2.4, -12],
        [-2.4, -28],
        [8, -28],
        [8, -12],
      ],
      bark.light,
    );
    nodes.push(
      line(
        poly(
          pts([
            [-2.4, -12],
            [8, -28],
          ]),
          false,
        ) +
          poly(
            pts([
              [-2.4, -28],
              [8, -12],
            ]),
            false,
          ),
        0.7,
        bark.shade,
      ),
    );
    [0, 1].forEach((i) => {
      const y = -30.4 - i * 3.8;
      const x0 = -2.6 + (i % 2) * 1.4;
      const x1 = 9.4 - (i % 2) * 1.2;
      const a = pts([[x0, y]])[0]!;
      const b = pts([[x1, y]])[0]!;
      all.push(a, b);
      nodes.push(
        el('path', { d: poly([a, b], false), ...inkAttrs(bark.shade, 3.6 * c.k) }),
        el('path', { d: poly([a, b], false), ...inkAttrs(bark.base, 2.4 * c.k) }),
        el('path', {
          d: ellipsePath(b.x, b.y, 1.5 * c.k, 1.9 * c.k * c.rise),
          fill: pal.ramps.sand.light,
          stroke: pal.ink,
          'stroke-width': c.ink * 0.6,
        }),
      );
    });
  }
  if (kind === 'rider') {
    // A traveller sitting in the bed: legs out over the front board, body upright, head with a hood.
    poly2(
      [
        [-1, -18],
        [8, -19.4],
        [14, -17],
        [13.6, -14.4],
        [7, -15.6],
        [-1, -14],
      ],
      tint.shade,
      0.8,
    );
    poly2(
      [
        [13, -17.6],
        [16.6, -17.4],
        [16.8, -14.4],
        [13.2, -14.6],
      ],
      bark.shade,
      0.8,
    );
    poly2(
      [
        [-9.6, -13],
        [-10.4, -26],
        [-6.4, -31.5],
        [1.2, -31],
        [3.6, -25],
        [3, -13],
      ],
      tint.base,
    );
    const head = pts([[-3.4, -37.2]])[0]!;
    all.push(pts([[-9, -43]])[0]!, pts([[2, -43]])[0]!);
    nodes.push(
      el('path', {
        d: ellipsePath(head.x, head.y, 5.6 * c.k, 5.8 * c.k * c.rise),
        fill: tint.light,
        stroke: pal.ink,
        'stroke-width': c.ink,
      }),
      el('path', {
        d: ellipsePath(
          head.x + 0.8 * c.k,
          head.y + 0.6 * c.k * c.rise,
          3.2 * c.k,
          3.4 * c.k * c.rise,
        ),
        fill: pal.skin,
      }),
      el('path', {
        d: ellipsePath(head.x + 2.2 * c.k, head.y + 0.4 * c.k * c.rise, 0.6 * c.k, 0.6 * c.k),
        fill: pal.ink,
      }),
      line(
        poly(
          pts([
            [-1.8, -22],
            [5.6, -19],
          ]),
          false,
        ),
        1.2,
        tint.shade,
      ),
    );
  }

  // The bed: a plank box, its near side lit, a darker rim and a front board.
  poly2(
    [
      [-16, -10],
      [-16.6, -21],
      [11, -21],
      [11.8, -10],
    ],
    bark.base,
    1.1,
  );
  nodes.push(
    line(
      poly(
        pts([
          [-16.2, -14],
          [11.4, -14],
        ]),
        false,
      ) +
        poly(
          pts([
            [-16.4, -17.6],
            [11.4, -17.6],
          ]),
          false,
        ),
      0.7,
      bark.shade,
    ),
    line(
      poly(
        pts([
          [-16.6, -21],
          [11, -21],
        ]),
        false,
      ),
      1.6,
      bark.shade,
    ),
  );
  // The wheel: a rim, spokes, a hub.
  const w = pts([[0, -8.6]])[0]!;
  const rx = 8.6 * c.k;
  const ry = 8.6 * c.k * c.rise;
  const spokes = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI * i) / 3 + 0.3;
    return poly(
      [
        { x: w.x - Math.cos(a) * rx * 0.86, y: w.y - Math.sin(a) * ry * 0.86 },
        { x: w.x + Math.cos(a) * rx * 0.86, y: w.y + Math.sin(a) * ry * 0.86 },
      ],
      false,
    );
  }).join('');
  all.push({ x: w.x - rx, y: w.y - ry }, { x: w.x + rx, y: w.y + ry });
  nodes.push(
    el('path', { d: ellipsePath(w.x, w.y, rx, ry), fill: pal.ramps.sand.light, opacity: 0.55 }),
    el('path', { d: spokes, ...inkAttrs(bark.shade, c.ink * 0.9) }),
    el('path', { d: ellipsePath(w.x, w.y, rx, ry), ...inkAttrs(bark.shade, c.ink * 2.6) }),
    el('path', { d: ellipsePath(w.x, w.y, rx, ry), ...inkAttrs(bark.base, c.ink * 1.5) }),
    el('path', { d: ellipsePath(w.x, w.y, rx, ry), ...inkAttrs(pal.ink, c.ink * 0.7) }),
    el('path', {
      d: ellipsePath(w.x, w.y, 1.8 * c.k, 1.8 * c.k * c.rise),
      fill: bark.light,
      stroke: pal.ink,
      'stroke-width': c.ink * 0.7,
    }),
  );

  // The shafts: out in front, resting on a prop when nobody holds them.
  if (kind === 'hitched') {
    const shaft = poly(
      pts([
        [9, -15],
        [33, -14.6],
      ]),
      false,
    );
    nodes.push(
      el('path', { d: shaft, ...inkAttrs(pal.ink, c.ink * 3.2) }),
      el('path', { d: shaft, ...inkAttrs(bark.light, c.ink * 1.8) }),
    );
    all.push(...pts([[33, -14.6]]));
    // The puller: stepping forward, leaning into the shafts, both hands on them.
    const skin = pal.skin;
    poly2(
      [
        [34, -1],
        [33.4, -12],
        [35.4, -12.4],
        [36.4, -1],
      ],
      pal.ramps.bark.shade,
      0.9,
    );
    poly2(
      [
        [38.6, -1],
        [38, -11.4],
        [40.2, -11.6],
        [41.6, -1],
      ],
      pal.ramps.bark.shade,
      0.9,
    );
    poly2(
      [
        [32.4, -13],
        [33.6, -25],
        [37.6, -30],
        [42.4, -28.6],
        [43.6, -13],
      ],
      tint.base,
    );
    const head = pts([[41.6, -35]])[0]!;
    all.push(pts([[47, -41]])[0]!);
    nodes.push(
      line(
        poly(
          pts([
            [35, -22],
            [34.4, -15.4],
          ]),
          false,
        ),
        3,
        tint.shade,
      ),
      el('path', {
        d: ellipsePath(head.x, head.y, 5 * c.k, 5.2 * c.k * c.rise),
        fill: skin,
        stroke: pal.ink,
        'stroke-width': c.ink,
      }),
      el('path', {
        d: smoothClosed(
          pts([
            [36.6, -36.6],
            [38.6, -41.4],
            [43.6, -41],
            [46, -37],
            [42, -38],
          ]),
        ),
        fill: tint.shade,
        stroke: pal.ink,
        'stroke-width': c.ink * 0.8,
      }),
      el('path', {
        d: ellipsePath(head.x + 2.4 * c.k, head.y + 0.2 * c.k * c.rise, 0.6 * c.k, 0.6 * c.k),
        fill: pal.ink,
      }),
      el('path', {
        d: ellipsePath(pts([[34.6, -14.8]])[0]!.x, pts([[34.6, -14.8]])[0]!.y, 2 * c.k, 1.8 * c.k),
        fill: skin,
        stroke: pal.ink,
        'stroke-width': c.ink * 0.8,
      }),
    );
  } else {
    const shaft = poly(
      pts([
        [9, -15],
        [31, -5.6],
      ]),
      false,
    );
    nodes.push(
      el('path', { d: shaft, ...inkAttrs(pal.ink, c.ink * 3.2) }),
      el('path', { d: shaft, ...inkAttrs(bark.light, c.ink * 1.8) }),
      line(
        poly(
          pts([
            [28, -6.8],
            [28.6, 0],
          ]),
          false,
        ),
        1.6,
        bark.shade,
      ),
    );
    all.push(
      ...pts([
        [31, -5.6],
        [28.6, 0],
      ]),
    );
  }
  return { nodes, box: boxOf(all) };
}

/** Most crate slots the cargo mark shows. */
export const CARGO_SLOTS_MAX = 8;

/**
 * The cargo-fill mark for a cart's card, a centred `<svg>` (`size` px tall, default 24): `slots` small crate
 * slots (default 5, 1 to 8), the first `round(fill * slots)` filled with a braced crate, the rest faint
 * dashed outlines. `fill` is 0 to 1; no numbers.
 */
export function drawCargoFill(palette: Palette, fill: number, slots = 5, size = 24): SvgNode {
  const n = Number.isFinite(slots) ? Math.max(1, Math.min(CARGO_SLOTS_MAX, Math.round(slots))) : 5;
  const f = Number.isFinite(fill) ? Math.max(0, Math.min(1, fill)) : 0;
  const filled = Math.round(f * n);
  const pal = palette;
  const step = 10.5;
  const half = (n * step) / 2;
  const nodes = Array.from({ length: n }, (_, i) => {
    const full = i < filled;
    const x = -half + i * step + 1;
    const d = `M${x} -4h8v8h-8z`;
    return el(
      'g',
      { 'data-cargo': full ? 'full' : 'empty' },
      full
        ? [
            el('path', {
              d,
              fill: pal.ramps.bark.base,
              stroke: pal.ramps.bark.shade,
              'stroke-width': 1.1,
              'stroke-linejoin': 'round',
            }),
            el('path', {
              d: `M${x} -4l8 8M${x + 8} -4l-8 8`,
              ...inkAttrs(pal.ramps.bark.shade, 0.8),
            }),
          ]
        : [
            el('path', {
              d,
              fill: 'none',
              stroke: pal.inkSoft,
              'stroke-width': 1,
              'stroke-linejoin': 'round',
              'stroke-dasharray': '2 2',
              opacity: 0.45,
            }),
          ],
    );
  });
  const h = Number.isFinite(size) && size > 0 ? size : 24;
  const w = n * step + 6;
  return el('svg', { viewBox: `${-w / 2} -8 ${w} 16`, width: (h * w) / 16, height: h }, [
    el('path', {
      d: `M${-w / 2 + 1} -7h${w - 2}a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h${-(w - 2)}a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z`,
      fill: pal.paperDeep,
      stroke: pal.ink,
      'stroke-width': 0.9,
    }),
    ...nodes,
  ]);
}
