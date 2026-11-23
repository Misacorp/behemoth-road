/**
 * Settlements of a people on a hex, drawn upright in side view like the props, keyed by the people's content
 * icon key (`hill-folk`: round huts and a fence; `river-folk`: huts on stilts over shallows, a net rack and a boat;
 * unknown keys draw the hill huts). The attitude reads at a glance: wary is plain huts
 * with smoke rising, friendly raises a banner on a tall pole, angry turns the roofs and ground red and lights
 * two torches. Favour shows as a row of small marks in front, one per point needed, filled up to the favour
 * held (none while angry). Parts carry `data-settlement="huts" | "smoke" | "banner" | "torches" | "favour"`.
 */
import { ART_TUNING } from './config.ts';
import { kit } from './features.ts';
import { boxOf, ellipsePath, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { groundShadow, riseFor, type Drawn, type PropContext } from './props.ts';
import { rngFor } from './rng.ts';
import { el, type SvgNode } from './svg.ts';
import { squareIcon } from './threats.ts';

export const SETTLEMENT_LOOKS = ['hill-folk', 'river-folk'] as const;
export type Attitude = 'wary' | 'friendly' | 'angry';

export interface SettlementArt {
  /** The people's content icon key (`SETTLEMENT_LOOKS`). */
  readonly look: string;
  readonly attitude: Attitude;
  /** Favour held, drawn as filled marks (clamped to 0..needed). */
  readonly favour?: number;
  /** Favour needed to befriend, drawn as that many marks (default 3, clamped to 1..6). */
  readonly favourNeeded?: number;
}

/** One round hut at (x, y): a low wall, a conical thatch roof, a dark door; `roof` and `wall` fills. */
function hut(
  c: PropContext,
  x: number,
  y: number,
  w: number,
  h: number,
  roof: string,
  wall: string,
): { nodes: SvgNode[]; points: Point[]; peak: Point } {
  const { pts, fill, line, T } = kit(c);
  const pal = c.palette;
  const eave = y - h * 0.42;
  const walls = pts([
    [x - w / 2, y],
    [x - w / 2, eave],
    [x + w / 2, eave],
    [x + w / 2, y],
  ]);
  const thatch = pts([
    [x - w / 2 - 2.2, eave + 0.8],
    [x - w * 0.18, y - h * 0.84],
    [x, y - h],
    [x + w * 0.18, y - h * 0.84],
    [x + w / 2 + 2.2, eave + 0.8],
  ]);
  const shade = pts([
    [x, y - h],
    [x + w * 0.18, y - h * 0.84],
    [x + w / 2 + 2.2, eave + 0.8],
    [x + w * 0.12, eave + 0.8],
  ]);
  const door = pts([
    [x - w * 0.14, y],
    [x - w * 0.14, y - h * 0.26],
    [x + w * 0.14, y - h * 0.26],
    [x + w * 0.14, y],
  ]);
  const straw = [0.25, 0.5, 0.75]
    .map((t) =>
      poly(
        pts([
          [x - w * 0.12 + (t - 0.5) * w * 0.9, eave - 1],
          [x + (t - 0.5) * w * 0.3, y - h * 0.8],
        ]),
        false,
      ),
    )
    .join('');
  return {
    nodes: [
      fill(poly(walls), wall),
      line(poly(walls), 0.9),
      fill(smoothClosed(door), pal.ink, 0.75),
      fill(poly(thatch), roof),
      fill(poly(shade), pal.ramps.bark.shade, 0.25),
      line(straw, 0.6, pal.ramps.bark.shade),
      line(poly(thatch)),
    ],
    points: [...walls, ...thatch],
    peak: T(x, y - h),
  };
}

/** A curl of smoke rising from (x, y) in screen px, like the fire's. */
function smoke(c: PropContext, from: Point, attrs: Record<string, string>): SvgNode[] {
  const pal = c.palette;
  const S = (dx: number, dy: number): Point => ({
    x: from.x + dx * c.k,
    y: from.y + dy * c.k * c.rise,
  });
  const curl = smoothOpen([S(0, 0), S(-3, -5), S(1.5, -10), S(-1, -15), S(2.5, -19)]);
  const puffs = [S(-1.5, -16), S(3, -21)]
    .map((p, i) => ellipsePath(p.x, p.y, (2.4 + i) * c.k, (1.8 + i * 0.6) * c.k))
    .join('');
  return [
    el('path', {
      d: curl,
      fill: 'none',
      stroke: pal.inkSoft,
      'stroke-width': c.ink * 1.3,
      'stroke-linecap': 'round',
      opacity: 0.8,
      ...attrs,
    }),
    el('path', {
      d: puffs,
      fill: pal.ramps.rock.light,
      stroke: pal.inkSoft,
      'stroke-width': c.ink * 0.7,
      opacity: 0.8,
      ...attrs,
    }),
  ];
}

/** A raised banner: a tall pole with a swallow-tailed pennant and a knob on top. */
function banner(c: PropContext, x: number, y: number): { nodes: SvgNode[]; points: Point[] } {
  const { pts, fill, line, T } = kit(c);
  const pal = c.palette;
  const pole = pts([
    [x, y],
    [x, y - 38],
  ]);
  const cloth = pts([
    [x + 0.6, y - 36],
    [x + 15, y - 34.5],
    [x + 11, y - 30],
    [x + 15, y - 25.5],
    [x + 0.6, y - 27],
  ]);
  const knob = T(x, y - 39);
  return {
    nodes: [
      line(poly(pole, false), 1.6, pal.ramps.bark.shade),
      fill(poly(cloth), pal.accents.sage.base),
      line(
        poly(
          pts([
            [x + 3, y - 31.5],
            [x + 9, y - 31.2],
          ]),
          false,
        ),
        0.8,
        pal.accents.ochre.shade,
      ),
      line(poly(cloth), 0.9),
      fill(ellipsePath(knob.x, knob.y, 1.6 * c.k, 1.6 * c.k), pal.accents.ochre.base),
      line(ellipsePath(knob.x, knob.y, 1.6 * c.k, 1.6 * c.k), 0.7),
    ],
    points: [...pole, ...cloth],
  };
}

/** A torch on a stake at (x, y): a stake and a two-tone flame. */
function stakeTorch(c: PropContext, x: number, y: number): { nodes: SvgNode[]; points: Point[] } {
  const { pts, fill, line } = kit(c);
  const pal = c.palette;
  const stake = pts([
    [x, y],
    [x, y - 20],
  ]);
  const flame = pts([
    [x, y - 19.5],
    [x - 3.2, y - 22],
    [x - 2.2, y - 26.5],
    [x + 0.4, y - 31],
    [x + 2.8, y - 25.5],
    [x + 3.2, y - 21.5],
  ]);
  const core = pts([
    [x + 0.2, y - 20.2],
    [x - 1.3, y - 22.5],
    [x + 0.3, y - 26.5],
    [x + 1.6, y - 22.5],
  ]);
  return {
    nodes: [
      line(poly(stake, false), 1.6, pal.ramps.bark.shade),
      fill(smoothClosed(flame), pal.accents.coral.base),
      fill(smoothClosed(core), pal.accents.ochre.light),
      line(smoothClosed(flame), 0.7, pal.accents.coral.shade),
    ],
    points: [...stake, ...flame],
  };
}

/** The favour marks: `needed` small rings on the ground in front, `held` of them filled ochre. */
function favourMarks(
  c: PropContext,
  held: number,
  needed: number,
): { nodes: SvgNode[]; points: Point[] } {
  const pal = c.palette;
  const n = Math.max(1, Math.min(6, Math.round(Number.isFinite(needed) ? needed : 3)));
  const h = Math.max(0, Math.min(n, Math.round(Number.isFinite(held) ? held : 0)));
  const step = 6.2 * c.k;
  const r = 2.3 * c.k;
  const y = c.origin.y + 10 * c.k * (c.squash / 0.6);
  const xs = Array.from({ length: n }, (_, i) => c.origin.x + (i - (n - 1) / 2) * step);
  const ring = (x: number): string => ellipsePath(x, y, r, r);
  const pill = ellipsePath(c.origin.x, y, ((n - 1) * step) / 2 + 4.6 * c.k, 4 * c.k);
  return {
    nodes: [
      el('g', { 'data-settlement': 'favour' }, [
        el('path', { d: pill, fill: pal.paper, opacity: 0.85 }),
        ...(h < n
          ? [
              el('path', {
                d: xs.slice(h).map(ring).join(''),
                fill: pal.paper,
                stroke: pal.inkSoft,
                'stroke-width': c.ink * 0.9,
              }),
            ]
          : []),
        ...(h > 0
          ? [
              el('path', {
                d: xs.slice(0, h).map(ring).join(''),
                fill: pal.accents.ochre.base,
                stroke: pal.ink,
                'stroke-width': c.ink * 0.9,
              }),
            ]
          : []),
      ]),
    ],
    points: [
      { x: xs[0]! - r * 2, y: y - r * 2 },
      { x: xs[n - 1]! + r * 2, y: y + r * 2 },
    ],
  };
}

/** A settlement on its hex in its attitude, with its favour marks. `c` is at the settlement's scale. */
export function drawSettlement(c: PropContext, settlement: SettlementArt): Drawn {
  const pal = c.palette;
  const angry = settlement.attitude === 'angry';
  const friendly = settlement.attitude === 'friendly';
  const sq = c.squash / 0.6;
  const river = settlement.look === 'river-folk';
  // River folk: the huts stand raised on stilts, thatched in reed brown, over shallows.
  const thatch = river ? pal.ramps.bark : pal.ramps.heath;
  const roof = angry ? pal.accents.coral.base : thatch.base;
  const roofBack = angry ? pal.accents.coral.light : thatch.light;
  const wall = pal.ramps.sand.light;
  // River folk stand on tall stilts; hill folk on a raised mound of earth.
  const lift = river ? 10 : 6;
  const big = hut(c, -5, -1 - lift, 17, 23, roof, wall);
  const small = hut(c, 10.5, 3 - lift, 12, 16, roofBack, wall);
  const stilts = river
    ? kit(c).line(
        [-10, -5, 0, 7, 10.5, 14]
          .map((x) => {
            const base = x > 4 ? 3 - lift : -1 - lift;
            return poly(
              kit(c).pts([
                [x, base],
                [x, base + lift + 3],
              ]),
              false,
            );
          })
          .join(''),
        1.3,
        pal.ramps.bark.shade,
      )
    : null;
  const rack = river
    ? kit(c).line(
        poly(
          kit(c).pts([
            [-20, 5],
            [-20, -9],
            [-13, -9],
            [-13, 5],
          ]),
          false,
        ) +
          poly(
            kit(c).pts([
              [-20, -6],
              [-13, -6],
              [-20, -3],
              [-13, -3],
            ]),
            false,
          ),
        0.9,
        pal.ramps.bark.shade,
      )
    : null;
  const boat = river
    ? [
        kit(c).fill(
          smoothClosed(
            kit(c).pts([
              [8, 8],
              [14, 9.5],
              [21, 8],
              [19, 11],
              [11, 11.5],
            ]),
          ),
          pal.ramps.bark.base,
        ),
        kit(c).line(
          smoothClosed(
            kit(c).pts([
              [8, 8],
              [14, 9.5],
              [21, 8],
              [19, 11],
              [11, 11.5],
            ]),
          ),
          0.9,
        ),
      ]
    : [];
  const fence = river
    ? null
    : kit(c).line(
        [-18, -15.5, -13, -10.5]
          .map((x, i) =>
            poly(
              kit(c).pts([
                [x, 2 - lift - i * 0.2],
                [x + 0.3, -5.5 - lift - i * 0.2],
              ]),
              false,
            ),
          )
          .join('') +
          poly(
            kit(c).pts([
              [-19, -lift - 0.5],
              [-9.5, -lift - 1.4],
            ]),
            false,
          ),
        1.1,
        pal.ramps.bark.shade,
      );
  const K = kit(c);
  const mound = river
    ? null
    : [
        K.fill(
          smoothClosed(
            K.pts([
              [-23, 3],
              [-19, -lift + 1],
              [-5, -lift - 1.5],
              [12, -lift - 0.5],
              [22, -lift + 2],
              [25, 3],
            ]),
          ),
          pal.ramps.earth.base,
        ),
        K.fill(
          smoothClosed(
            K.pts([
              [4, -lift - 1],
              [22, -lift + 2],
              [25, 3],
              [8, 3],
            ]),
          ),
          pal.ramps.earth.shade,
          0.5,
        ),
        K.line(
          smoothClosed(
            K.pts([
              [-23, 3],
              [-19, -lift + 1],
              [-5, -lift - 1.5],
              [12, -lift - 0.5],
              [22, -lift + 2],
              [25, 3],
            ]),
          ),
          0.9,
        ),
      ];
  // A tall pole with a bright pennant over the huts: hill folk's mark, visible above the tile's edge.
  const polePts = K.pts([
    [23, -lift],
    [23, -lift - 40],
  ]);
  const pole = river
    ? null
    : [
        K.line(poly(polePts, false), 1.5, pal.ramps.bark.shade),
        K.fill(
          poly(
            K.pts([
              [23, -lift - 40],
              [32, -lift - 37],
              [23, -lift - 33],
            ]),
          ),
          angry ? pal.ramps.rock.shade : pal.accents.ochre.base,
        ),
        K.line(
          poly(
            K.pts([
              [23, -lift - 40],
              [32, -lift - 37],
              [23, -lift - 33],
            ]),
          ),
          0.8,
        ),
      ];
  const ground = el('path', {
    d: ellipsePath(c.origin.x + 1 * c.k, c.origin.y + 2 * c.k, 24 * c.k, 7 * c.k * sq),
    fill: angry
      ? pal.accents.coral.light
      : river
        ? pal.ramps.water.light
        : friendly
          ? pal.accents.sage.light
          : pal.ramps.earth.light,
    opacity: angry ? 0.7 : 0.55,
  });
  const extras: SvgNode[] = [];
  const points: Point[] = [...big.points, ...small.points, ...(river ? [] : polePts)];
  let front: SvgNode[] = [];
  if (angry) {
    const torches = [stakeTorch(c, -14, 4), stakeTorch(c, 19, 5)];
    extras.push(el('g', { 'data-settlement': 'torches' }, torches[0]!.nodes));
    front = [el('g', { 'data-settlement': 'torches' }, torches[1]!.nodes)];
    points.push(...torches.flatMap((t) => t.points));
  } else {
    extras.push(...smoke(c, big.peak, { 'data-settlement': 'smoke' }));
    points.push({ x: big.peak.x, y: big.peak.y - 24 * c.k * c.rise });
    if (friendly) {
      const b = banner(c, 19, 4);
      front = [el('g', { 'data-settlement': 'banner' }, b.nodes)];
      points.push(...b.points);
    }
  }
  const favour = angry
    ? { nodes: [], points: [] }
    : favourMarks(
        c,
        friendly ? (settlement.favourNeeded ?? 3) : (settlement.favour ?? 0),
        settlement.favourNeeded ?? 3,
      );
  return {
    nodes: [
      ground,
      groundShadow(c, 20, 4.5, 2),
      el('g', { 'data-settlement': 'huts' }, [
        ...(mound ?? []),
        ...(stilts ? [stilts] : []),
        ...big.nodes,
        ...small.nodes,
        ...(fence ? [fence] : []),
        ...(rack ? [rack] : []),
        ...(pole ?? []),
        ...boat,
      ]),
      ...extras,
      ...front,
      ...favour.nodes,
    ],
    box: boxOf([...points, ...favour.points]),
  };
}

/** A settlement as a square, self-contained `<svg>` icon of `px` px, for its card. */
export function drawSettlementIcon(
  palette: Palette,
  px: number,
  settlement: SettlementArt,
  squash: number = ART_TUNING.tilt,
): SvgNode {
  const size = Number.isFinite(px) && px > 0 ? px : 48;
  const unit = 1.6;
  return squareIcon(
    drawSettlement(
      {
        palette,
        rng: rngFor('settlement-icon', settlement.look),
        origin: { x: 0, y: 0 },
        k: unit,
        squash,
        ink: 1.4 * unit * 0.8,
        rise: riseFor(squash),
      },
      settlement,
    ),
    size,
  );
}
