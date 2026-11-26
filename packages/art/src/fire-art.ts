/**
 * The fire rework's art: the brazier (a tall stone beacon cairn, cold or lit), the nights-left mark, the
 * fire ring over the hexes a burning fire guards, the `fears-fire` and `burnable` marks, the burnt deadfall
 * and snare, a pinned character under fallen stones, and the rockslide moment. Upright things draw like the
 * other features (rising from a soft footing, no pedestal); marks are self-contained `<svg>`s.
 * Parts of a lit brazier carry `data-fire="glow" | "flame" | "smoke" | "ring"`, like `drawFire`.
 */
import { ART_TUNING } from './config.ts';
import { kit } from './feature-kit.ts';
import { flameShapes } from './fire.ts';
import { boxOf, ellipsePath, mapper, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import { stroke } from './moment-kit.ts';
import type { Palette } from './palette.ts';
import { hexCenter, hexCorners, hexDistance, type Hex, type Projection } from './projection.ts';
import { inkAttrs, riseFor, type Drawn } from './props.ts';
import { el, type SvgNode } from './svg.ts';
import { planes, worldContext, type TraceOptions } from './traces.ts';

const P = (x: number, y: number): Point => ({ x, y });
const px = (size: number, fallback: number): number =>
  Number.isFinite(size) && size > 0 ? size : fallback;

type Raw = readonly (readonly [number, number])[];

/** The brazier's height to its rim in drawing units (a character is about 47 at the same scale). */
export const BRAZIER_HEIGHT = 46;
/** Most nights a lit brazier shows (notches and embers). */
export const NIGHTS_MAX = 3;

export interface BrazierOptions extends TraceOptions {
  /** Burning (flame, glow on its own hex) or cold (ash in the bowl). */
  readonly lit: boolean;
  /** Nights of fuel left, scratched as notches on its face while lit (0 to 3; default none). */
  readonly nightsLeft?: number;
}

const clampNights = (n: number | undefined): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(NIGHTS_MAX, Math.round(n!))) : 0;

/**
 * An old stone brazier: a beacon cairn of four stacked, tapering stones with a stone bowl at the top.
 * Cold, the bowl holds grey ash and a few charred ends (clearly made for fire); lit, the flame from
 * `drawFire` leaps over the rim, a warm glow lies on the ground of its own hex with a faint dashed hint of
 * the reach, and `nightsLeft` notches are scratched on its face.
 */
export function drawBrazier(palette: Palette, opts: BrazierOptions): Drawn {
  const c = worldContext(palette, 'brazier', opts);
  const { pts, fill, line, blob } = kit(c);
  const { G } = planes(c);
  const pal = palette;
  const nodes: SvgNode[] = [];
  const all: Point[] = [];
  const g = G(0, 0);
  const lean = c.rng.range(-0.8, 0.8);
  const nights = clampNights(opts.nightsLeft);

  if (opts.lit) {
    nodes.push(
      el('path', {
        d: ellipsePath(g.x, g.y, 52 * c.k, 52 * c.k * c.squash),
        fill: 'none',
        stroke: pal.accents.ochre.base,
        'stroke-width': Math.max(1, c.ink * 0.7),
        'stroke-dasharray': `${(5 * c.k).toFixed(1)} ${(6 * c.k).toFixed(1)}`,
        opacity: 0.3,
        'data-fire': 'ring',
      }),
      el('path', {
        d: ellipsePath(g.x, g.y, 34 * c.k, 34 * c.k * c.squash * 0.62),
        fill: pal.accents.ochre.light,
        opacity: 0.4,
        'data-fire': 'glow',
      }),
      el('path', {
        d: ellipsePath(g.x, g.y, 20 * c.k, 20 * c.k * c.squash * 0.6),
        fill: pal.accents.ochre.light,
        opacity: 0.55,
        'data-fire': 'glow',
      }),
    );
  } else {
    nodes.push(
      el('path', {
        d: ellipsePath(g.x + 2 * c.k, g.y, 20 * c.k, 4.6 * c.k * (c.squash / 0.6)),
        fill: pal.shadow,
        opacity: 0.18,
      }),
    );
  }
  // A darker patch of ground holds the foot.
  nodes.push(
    el('path', {
      d: ellipsePath(g.x, g.y, 15 * c.k, 3.6 * c.k * c.squash),
      fill: pal.ramps.earth.shade,
      opacity: 0.3,
    }),
  );

  // Four tapering tiers, each a little off line, the right face shaded.
  const tierH = 10;
  for (let i = 0; i < 4; i += 1) {
    const w = 15 - i * 2.2;
    const y0 = -i * tierH;
    const y1 = y0 - tierH - 0.6;
    const off = lean * i * 0.5 + (i % 2 ? 0.8 : -0.6);
    const body = pts([
      [off - w, y0],
      [off - w + 1, y1],
      [off + w - 1.2, y1 - 0.4],
      [off + w, y0],
    ]);
    const face = pts([
      [off + w * 0.35, y0],
      [off + w * 0.3, y1],
      [off + w - 1.2, y1 - 0.4],
      [off + w, y0],
    ]);
    all.push(...body);
    nodes.push(
      fill(poly(body), i % 2 ? pal.ramps.stone.base : pal.ramps.stone.light),
      fill(poly(face), pal.ramps.rock.shade, 0.35),
      line(poly(body), 0.9),
    );
  }
  // The bowl: a flared stone cup, dark inside.
  const top = -4 * tierH;
  const bowl = pts([
    [-8 + lean, top - 0.4],
    [-12.5 + lean, top - 5.4],
    [12.5 + lean, top - 5.4],
    [8 + lean, top - 0.4],
  ]);
  const bowlFace = pts([
    [3 + lean, top - 0.4],
    [4 + lean, top - 5],
    [12.5 + lean, top - 5.4],
    [8 + lean, top - 0.4],
  ]);
  const rim = blob(lean, top - 5.4, 12.5, 2.8);
  all.push(...bowl, ...rim);
  nodes.push(
    fill(poly(bowl), pal.ramps.stone.base),
    fill(poly(bowlFace), pal.ramps.rock.shade, 0.35),
    line(poly(bowl), 0.9),
    fill(smoothClosed(rim), pal.ramps.rock.shade),
    line(smoothClosed(rim), 0.9),
  );
  const brim = top - 5.4;

  if (opts.lit) {
    // Notches scratched on the second tier: one per night left.
    if (nights > 0) {
      const notches = Array.from({ length: nights }, (_, i) => {
        const x = -4 + i * 4;
        return poly(
          pts([
            [x, -14],
            [x - 0.4, -18.5],
          ]),
          false,
        );
      }).join('');
      nodes.push(line(notches, 1.1, pal.ink));
    }
    const sway = c.rng.range(-1, 1);
    const shapes = flameShapes(sway);
    // Embers glow on the rim, then the flame stands in the bowl and rises past it.
    const Tf = mapper(
      { x: c.origin.x + lean * c.k, y: c.origin.y + (brim + 1) * c.k * c.rise },
      c.k * 1.15,
      1,
      c.k * c.rise * 1.45,
    );
    const tall = (raw: Raw): Point[] => raw.map(([x, y]) => Tf(x, y));
    const flame = tall(shapes.flame);
    const core = tall(shapes.core);
    const smoke = tall(shapes.smoke.slice(0, 5));
    const spark = Tf(6 + sway, -16);
    all.push(...flame, ...smoke);
    nodes.push(
      fill(smoothClosed(blob(lean, brim, 10, 2)), pal.accents.ochre.light, 0.9),
      el('path', { d: smoothClosed(flame), fill: pal.accents.coral.base, 'data-fire': 'flame' }),
      el('path', { d: smoothClosed(core), fill: pal.accents.ochre.light, 'data-fire': 'flame' }),
      el('path', {
        ...inkAttrs(pal.accents.coral.shade, c.ink * 0.9),
        d: smoothClosed(flame),
        'data-fire': 'flame',
      }),
      el('path', {
        d: ellipsePath(spark.x, spark.y, 0.9 * c.k, 0.9 * c.k),
        fill: pal.accents.ochre.base,
        'data-fire': 'flame',
      }),
      el('path', {
        ...inkAttrs(pal.inkSoft, c.ink * 1.2),
        d: smoothOpen(smoke),
        opacity: 0.7,
        'data-fire': 'smoke',
      }),
    );
    all.push(
      P(g.x - 52 * c.k, g.y - 52 * c.k * c.squash),
      P(g.x + 52 * c.k, g.y + 52 * c.k * c.squash),
    );
  } else {
    // Cold: a heap of grey ash and a few charred ends.
    const ash = blob(lean, brim - 0.4, 9, 1.8);
    const ends = pts([
      [-5 + lean, brim],
      [-7 + lean, brim - 5],
      [1 + lean, brim - 1],
      [5 + lean, brim - 4.5],
      [6 + lean, brim - 0.5],
    ]);
    all.push(...ends);
    nodes.push(
      fill(smoothClosed(ash), pal.ramps.stone.light),
      line(poly(ends.slice(0, 3), false) + poly(ends.slice(2), false), 1.3, pal.inkSoft),
      fill(
        [blob(-14, 1.4, 1.5, 0.8), blob(13, 2, 1.2, 0.7)].map((b) => poly(b)).join(''),
        pal.ramps.stone.light,
      ),
    );
  }
  const found = boxOf(all);
  return { nodes, box: { ...found, y1: Math.max(found.y1, g.y + 4 * c.k * c.squash) } };
}

/**
 * The nights-left mark for beside a lit brazier, a centred `<svg>` (`size` px tall, default 24, 2.25 times
 * as wide): three ember slots, the first `nights` (0 to 3) lit, the rest faint outlines. No numbers.
 */
export function drawNightsLeft(palette: Palette, nights: number, size = 24): SvgNode {
  const n = clampNights(nights);
  const pal = palette;
  const ember = (x: number): string =>
    `M${x} 6c-3 0-4.6-2-4.6-4.2 0-2 1.5-3 2-5.8 1.4 1.2 1.8 2.2 1.8 2.2.6-1 1.2-1.8 1.6-2.6.4 2.2 1.8 3.2 1.8 6.2 0 2.4-1.4 4.2-2.6 4.2z`;
  const nodes = [0, 1, 2].map((i) => {
    const lit = i < n;
    return el('path', {
      d: ember((i - 1) * 11),
      fill: lit ? pal.accents.coral.base : 'none',
      stroke: lit ? pal.accents.coral.shade : pal.inkSoft,
      'stroke-width': lit ? 1.3 : 1,
      'stroke-linejoin': 'round',
      ...(lit ? {} : { opacity: 0.4, 'stroke-dasharray': '2 2' }),
      'data-ember': lit ? 'lit' : 'spent',
    });
  });
  const h = px(size, 24);
  return el('svg', { viewBox: '-18 -8 36 16', width: h * 2.25, height: h }, [
    el('path', {
      d: 'M-16 -7h32a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-32a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z',
      fill: pal.paper,
      opacity: 0.85,
    }),
    ...nodes,
  ]);
}

/**
 * The fire ring: a faint warm wash over every hex within `radius` (default 1) of a burning fire on `hex`,
 * with a thin dashed line round its outer edge, on the ground plane (drawing coordinates, like
 * `drawEscortRing`). Quiet on purpose: low opacity and no lines inside, so it never competes with the
 * window edge or the fog. Carries `data-fire-ring="q,r"`.
 */
export function drawFireRing(p: Projection, hex: Hex, palette: Palette, radius = 1): SvgNode {
  const reach = Number.isFinite(radius) ? Math.max(0, Math.min(4, Math.round(radius))) : 1;
  const edges = new Map<string, { a: Point; b: Point; n: number }>();
  const fillD: string[] = [];
  for (let dq = -reach; dq <= reach; dq += 1) {
    for (let dr = -reach; dr <= reach; dr += 1) {
      if (hexDistance({ q: 0, r: 0 }, { q: dq, r: dr }) > reach) continue;
      const corners = hexCorners(p, hexCenter(p, hex.q + dq, hex.r + dr));
      fillD.push(poly(corners));
      corners.forEach((a, i) => {
        const b = corners[(i + 1) % 6]!;
        const key = [a, b]
          .map((q) => `${Math.round(q.x)},${Math.round(q.y)}`)
          .sort()
          .join('|');
        const seen = edges.get(key);
        if (seen) seen.n += 1;
        else edges.set(key, { a, b, n: 1 });
      });
    }
  }
  const rim = [...edges.values()].filter((e) => e.n === 1).map((e) => poly([e.a, e.b], false));
  return el('g', { 'data-fire-ring': `${hex.q},${hex.r}` }, [
    el('path', { d: fillD.join(''), fill: palette.accents.ochre.light, opacity: 0.16 }),
    el('path', {
      d: rim.join(''),
      fill: 'none',
      stroke: palette.accents.ochre.base,
      'stroke-width': Math.max(1, 1.2 * p.k),
      'stroke-dasharray': `${(5 * p.k).toFixed(1)} ${(5 * p.k).toFixed(1)}`,
      'stroke-linecap': 'round',
      opacity: 0.45,
    }),
  ]);
}

/** The flame of `drawFire`, shrunk to sit in a 24-unit mark. */
const markFlame = (): string =>
  smoothClosed(flameShapes(0).flame.map(([x, y]) => P(x * 0.62, y * 0.62 + 5.5)));

const disc = (pal: Palette): SvgNode =>
  el('path', {
    d: ellipsePath(0, 0, 11, 11),
    fill: pal.paper,
    stroke: pal.ink,
    'stroke-width': 1.4,
  });

/** The `fears-fire` mark for a threat, tips and the glossary: a small flame crossed by a slash, on a paper disc. */
export function drawFearsFireMark(palette: Palette, size = 24): SvgNode {
  const pal = palette;
  const s = px(size, 24);
  return el('svg', { viewBox: '-12 -12 24 24', width: s, height: s }, [
    disc(pal),
    el('path', {
      d: markFlame(),
      fill: pal.accents.coral.base,
      stroke: pal.accents.coral.shade,
      'stroke-width': 1.1,
      'stroke-linejoin': 'round',
    }),
    el('path', { d: 'M-7 -7L7 7', ...inkAttrs(pal.paper, 4.4) }),
    el('path', { d: 'M-7 -7L7 7', ...inkAttrs(pal.ink, 1.9) }),
  ]);
}

/** The `burnable` hint for tips: a flame in dashed outline only (it could take fire), on a paper disc. */
export function drawBurnableMark(palette: Palette, size = 24): SvgNode {
  const pal = palette;
  const s = px(size, 24);
  return el('svg', { viewBox: '-12 -12 24 24', width: s, height: s }, [
    disc(pal),
    el('path', {
      d: markFlame(),
      fill: 'none',
      stroke: pal.accents.coral.shade,
      'stroke-width': 1.5,
      'stroke-dasharray': '2.6 2',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }),
  ]);
}

export const BURNT_LOOKS = ['deadfall', 'snare'] as const;
export type BurntLook = (typeof BURNT_LOOKS)[number];

/**
 * The used-up look of a burnt feature: a patch of ash and charred stumps where it stood. `deadfall`: two
 * broken black stubs of trunk; `snare`: a split charred stake and a curl of burnt cord. Same options as
 * the other world art; an unknown look draws the deadfall.
 */
export function drawBurnt(palette: Palette, look: string, opts: TraceOptions = {}): Drawn {
  const snare = look === 'snare';
  const c = worldContext(palette, `burnt-${snare ? 'snare' : 'deadfall'}`, opts);
  const { pts, fill, line, blob } = kit(c);
  const { G } = planes(c);
  const pal = palette;
  const g = G(0, 0);
  const w = snare ? 11 : 16;
  const ashAt = (x: number, y: number, rx: number, ry: number): string =>
    ellipsePath(g.x + x * c.k, g.y + y * c.k * c.squash, rx * c.k, ry * c.k * c.squash);
  const nodes: SvgNode[] = [
    el('path', { d: ashAt(0, 0, w, 3), fill: pal.ramps.stone.base, opacity: 0.7 }),
    el('path', { d: ashAt(w * 0.35, 1, w * 0.6, 2.2), fill: pal.ramps.stone.light, opacity: 0.85 }),
  ];
  const all: Point[] = [P(g.x - w * c.k, g.y), P(g.x + w * c.k, g.y + 3 * c.k * c.squash)];
  const char = (raw: Raw): void => {
    const body = pts(raw);
    all.push(...body);
    nodes.push(fill(poly(body), pal.inkSoft), line(poly(body), 1));
  };
  if (snare) {
    // A split, blackened stake with a jagged top and a burnt curl of cord on the ash.
    char([
      [-4, 0],
      [-4.4, -8],
      [-2.6, -6.4],
      [-1.4, -11],
      [0.4, -6.8],
      [2, -8.4],
      [2.6, 0],
    ]);
    const cord = pts([
      [3, -0.5],
      [6, -2.6],
      [9, -0.6],
      [6.8, 0.8],
      [4.4, 0.2],
    ]);
    all.push(...cord);
    nodes.push(line(smoothOpen(cord), 0.9, pal.inkSoft));
  } else {
    // Two broken stubs of trunk, ends split and black, a fallen charred chunk between.
    char([
      [-14, 0],
      [-14.6, -7],
      [-12, -5.4],
      [-10.4, -9.4],
      [-8, -5.6],
      [-6.4, 0],
    ]);
    char([
      [3, 0],
      [2.6, -5],
      [5, -3.6],
      [7, -6.6],
      [9.6, -3.4],
      [11.4, 0],
    ]);
    const chunk = blob(-1, -1.2, 3.4, 1.3);
    all.push(...chunk);
    nodes.push(fill(smoothClosed(chunk), pal.inkSoft), line(smoothClosed(chunk), 0.8));
  }
  nodes.push(
    fill(
      [blob(-w * 0.9, 1.6, 1.2, 0.6), blob(w * 0.8, 2, 1, 0.5)].map((b) => poly(b)).join(''),
      pal.ramps.stone.light,
    ),
  );
  return { nodes, box: boxOf(all) };
}

/** The character standee's height in its own units (`drawCharacter`). */
const HEIGHT_UNITS = 50;

/**
 * Pinned: fallen stones heaped over a character's legs, a dust puff at their feet and motes in the air,
 * drawn over a standee at `origin` (its feet) with the same arguments as `drawCharacter`, so it sits on
 * any look. Parts carry `data-mark="pinned"`.
 */
export function drawPinned(
  palette: Palette,
  origin: Point,
  size: number,
  squash: number,
  ink: number,
): Drawn {
  const k = (size * ART_TUNING.characterHeight) / HEIGHT_UNITS;
  const T = mapper(origin, k, 1, k * riseFor(squash));
  const pal = palette;
  const pts = (raw: Raw): Point[] => raw.map(([x, y]) => T(x, y));
  const w = ink * 0.95;
  const nodes: SvgNode[] = [];
  const all: Point[] = [];
  const sq = squash / 0.6;
  const rocks: readonly { raw: Raw; tone: 'light' | 'base' }[] = [
    {
      raw: [
        [-12, 0.5],
        [-13, -6],
        [-8, -10],
        [-2, -8],
        [-1, 0.5],
      ],
      tone: 'base',
    },
    {
      raw: [
        [-3, 0.5],
        [-4, -9],
        [1, -15.5],
        [8, -13],
        [9.5, -6],
        [8, 0.5],
      ],
      tone: 'light',
    },
    {
      raw: [
        [5, 0.5],
        [6, -5],
        [11.5, -7.5],
        [14, -2],
        [13, 0.5],
      ],
      tone: 'base',
    },
    {
      raw: [
        [-9, -6],
        [-7.5, -12.5],
        [-1, -13.5],
        [0.6, -8.5],
        [-4, -6],
      ],
      tone: 'light',
    },
  ];
  const dust = [
    [-15, 1, 3.6],
    [-8, 3.4, 3],
    [10, 3, 3.4],
    [16, 0.8, 2.8],
  ] as const;
  nodes.push(
    el('path', {
      d: dust
        .map(([x, y, r]) => ellipsePath(T(x, y).x, T(x, y).y, r * k, r * 0.62 * k * sq))
        .join(''),
      fill: pal.ramps.earth.light,
      stroke: pal.inkSoft,
      'stroke-width': w * 0.7,
      opacity: 0.85,
      'data-mark': 'pinned',
    }),
  );
  all.push(T(-19, 4), T(19, 4));
  for (const r of rocks) {
    const body = pts(r.raw);
    all.push(...body);
    nodes.push(
      el('path', { d: poly(body), fill: pal.ramps.rock[r.tone], 'data-mark': 'pinned' }),
      el('path', { ...inkAttrs(pal.ink, w), d: poly(body), 'data-mark': 'pinned' }),
    );
  }
  const motes = [T(-13, -17), T(-6, -22), T(12, -16), T(15, -10)];
  all.push(...motes);
  nodes.push(
    el('path', {
      d: motes
        .map((m, i) => ellipsePath(m.x, m.y, (1.1 - (i % 2) * 0.3) * k, (1.1 - (i % 2) * 0.3) * k))
        .join(''),
      fill: pal.inkSoft,
      opacity: 0.7,
      'data-mark': 'pinned',
    }),
  );
  return { nodes, box: boxOf(all) };
}

/** The falling-slide moment: dust at the ground, rocks tumbling down with motion strokes, flying chips. */
function rockslide(pal: Palette): SvgNode[] {
  const rock = (x: number, y: number, r: number, a: number): string =>
    poly(
      [0, 1, 2, 3, 4].map((i) => {
        const t = a + (Math.PI * 2 * i) / 5;
        const f = i % 2 ? 0.78 : 1.05;
        return P(x + Math.cos(t) * r * f, y + Math.sin(t) * r * f);
      }),
    );
  const puff = (x: number, y: number, r: number): string => ellipsePath(x, y, r, r * 0.6);
  return [
    el('path', {
      d: puff(-12, 15, 5.5) + puff(-2, 17, 6.5) + puff(9, 16, 6) + puff(17, 13, 4.5),
      fill: pal.ramps.earth.light,
      stroke: pal.inkSoft,
      'stroke-width': 1.1,
      opacity: 0.85,
      'data-part': '0',
    }),
    el('g', { 'data-part': '1' }, [
      el('path', {
        d: 'M-9 -22L-7 -14M3 -23L5 -13M13 -20L15 -12',
        ...stroke(pal.inkSoft, 1.3, { opacity: 0.6 }),
      }),
      el('path', {
        d: rock(-8, -6, 6.5, 0.3) + rock(4, -1, 7.5, 1.1) + rock(14, -9, 4.6, 2),
        fill: pal.ramps.rock.base,
        stroke: pal.ink,
        'stroke-width': 1.6,
        'stroke-linejoin': 'round',
      }),
      el('path', { d: rock(3, -2.5, 3.2, 1.1), fill: pal.ramps.rock.light }),
    ]),
    el('path', {
      d:
        ellipsePath(-19, 6, 1.3, 1.3) +
        ellipsePath(20, 4, 1.2, 1.2) +
        ellipsePath(-14, -14, 1, 1) +
        ellipsePath(18, -17, 1, 1),
      fill: pal.inkSoft,
      'data-part': '2',
    }),
  ];
}

export const FIRE_MOMENT_KINDS = ['rockslide'] as const;
export type FireMomentKind = (typeof FIRE_MOMENT_KINDS)[number];
export const FIRE_MOMENTS: Readonly<Record<FireMomentKind, (p: Palette) => SvgNode[]>> = {
  rockslide,
};
