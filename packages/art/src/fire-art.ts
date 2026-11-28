/**
 * The fire rework's art: the brazier (a low stone bowl under a tall flame, cold or lit), the nights-left mark, the
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

/** The brazier's height to its rim in drawing units (a character is about 47 at the same scale): a low stone bowl. */
export const BRAZIER_HEIGHT = 16;
/** Most nights a lit brazier shows (notches and embers). */
export const NIGHTS_MAX = 4;

export interface BrazierOptions extends TraceOptions {
  /** Burning (flame, glow on its own hex) or cold (ash in the bowl). */
  readonly lit: boolean;
  /** Nights of fuel left, scratched as notches on its face while lit (0 to 3; default none). */
  readonly nightsLeft?: number;
  /** Cold but stocked (found with wood laid in the bowl): a few sticks laid in it instead of ash. */
  readonly stocked?: boolean;
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

  // Two squat tiers, each a little off line, the right face shaded: the stone is low so the flame leads.
  const tiers: readonly [number, number][] = [
    [15, 7.4],
    [12.6, 5.6],
  ];
  let y0 = 0;
  tiers.forEach(([w, h], i) => {
    const y1 = y0 - h;
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
    y0 = y1;
  });
  // The bowl: a flared stone cup, dark inside.
  const top = y0;
  const bowl = pts([
    [-9 + lean, top - 0.4],
    [-13.5 + lean, top - 3.6],
    [13.5 + lean, top - 3.6],
    [9 + lean, top - 0.4],
  ]);
  const bowlFace = pts([
    [3 + lean, top - 0.4],
    [4 + lean, top - 3.4],
    [13.5 + lean, top - 3.6],
    [9 + lean, top - 0.4],
  ]);
  const rim = blob(lean, top - 3.6, 13.5, 2.8);
  all.push(...bowl, ...rim);
  nodes.push(
    fill(poly(bowl), pal.ramps.stone.base),
    fill(poly(bowlFace), pal.ramps.rock.shade, 0.35),
    line(poly(bowl), 0.9),
    fill(smoothClosed(rim), pal.ramps.rock.shade),
    line(smoothClosed(rim), 0.9),
  );
  const brim = top - 3.6;

  if (opts.lit) {
    // Notches scratched on the foot tier: one per night left.
    if (nights > 0) {
      const notches = Array.from({ length: nights }, (_, i) => {
        const x = -6 + i * 4;
        return poly(
          pts([
            [x, -1.6],
            [x - 0.4, -5.6],
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
      c.k * 2.7,
      1,
      c.k * c.rise * 2.4,
    );
    const tall = (raw: Raw): Point[] => raw.map(([x, y]) => Tf(x, y));
    const flame = tall(shapes.flame);
    const core = tall(shapes.core);
    const smoke = tall(shapes.smoke.slice(0, 4));
    const spark = Tf(4.5 + sway, -17);
    all.push(...flame, ...smoke);
    nodes.push(
      fill(smoothClosed(blob(lean, brim, 11, 2)), pal.accents.ochre.light, 0.9),
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
  } else if (opts.stocked) {
    // Cold but stocked: a few sticks laid crosswise in the bowl, ready to light.
    const sticks = [
      pts([
        [-8 + lean, brim - 0.5],
        [5 + lean, brim - 5.5],
      ]),
      pts([
        [8 + lean, brim - 0.5],
        [-5 + lean, brim - 5.5],
      ]),
      pts([
        [-6 + lean, brim - 4],
        [6 + lean, brim - 3.6],
      ]),
    ];
    all.push(...sticks.flat());
    nodes.push(
      fill(smoothClosed(blob(lean, brim - 0.4, 9, 1.8)), pal.ramps.rock.shade, 0.6),
      el(
        'g',
        { 'data-stocked': 'true' },
        sticks.flatMap((s) => [
          el('path', { d: poly(s, false), ...inkAttrs(pal.ramps.bark.shade, c.ink * 2.4) }),
          el('path', { d: poly(s, false), ...inkAttrs(pal.ramps.bark.light, c.ink * 1.1) }),
        ]),
      ),
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
 * The nights-left mark for beside a lit brazier, a centred `<svg>` (`size` px tall, default 24, 3 times
 * as wide): four ember slots, the first `nights` (0 to 4) lit, the rest faint outlines. No numbers.
 */
export function drawNightsLeft(palette: Palette, nights: number, size = 24): SvgNode {
  const n = clampNights(nights);
  const pal = palette;
  const ember = (x: number): string =>
    `M${x} 6c-3 0-4.6-2-4.6-4.2 0-2 1.5-3 2-5.8 1.4 1.2 1.8 2.2 1.8 2.2.6-1 1.2-1.8 1.6-2.6.4 2.2 1.8 3.2 1.8 6.2 0 2.4-1.4 4.2-2.6 4.2z`;
  const nodes = [0, 1, 2, 3].map((i) => {
    const lit = i < n;
    return el('path', {
      d: ember((i - 1.5) * 11),
      fill: lit ? pal.accents.coral.base : 'none',
      stroke: lit ? pal.accents.coral.shade : pal.inkSoft,
      'stroke-width': lit ? 1.3 : 1,
      'stroke-linejoin': 'round',
      ...(lit ? {} : { opacity: 0.4, 'stroke-dasharray': '2 2' }),
      'data-ember': lit ? 'lit' : 'spent',
    });
  });
  const h = px(size, 24);
  return el('svg', { viewBox: '-24 -8 48 16', width: h * 3, height: h }, [
    el('path', {
      d: 'M-22 -7h44a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-44a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z',
      fill: pal.paperDeep,
      stroke: pal.ink,
      'stroke-width': 0.9,
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

/**
 * A jagged, multi-tongue flame (three pointed tongues with sharp notches between) from its base centre
 * (`cx`, `by`), `w` wide and `h` tall, as a polygon. Used by the small marks so no one reads them as a drop.
 */
export function jaggedFlame(cx: number, by: number, w: number, h: number): Point[] {
  const raw: Raw = [
    [-0.92, 0],
    [-1, -0.38],
    [-0.64, -0.66],
    [-0.46, -0.34],
    [-0.2, -0.58],
    [0.02, -1],
    [0.22, -0.56],
    [0.36, -0.34],
    [0.64, -0.78],
    [0.82, -0.42],
    [1, -0.3],
    [0.92, 0],
  ];
  return raw.map(([x, y]) => P(cx + x * w * 0.5, by + y * h));
}

/** The pale inner flame of `jaggedFlame`: the same shape, small and low. */
const jaggedCore = (cx: number, by: number, w: number, h: number): Point[] =>
  jaggedFlame(cx, by - h * 0.04, w * 0.5, h * 0.55);

/** The two-tone jagged flame as nodes: coral body with an ink-soft edge, pale core. */
export const jaggedFlameNodes = (
  pal: Palette,
  cx: number,
  by: number,
  w: number,
  h: number,
): SvgNode[] => [
  el('path', {
    d: poly(jaggedFlame(cx, by, w, h)),
    fill: pal.accents.coral.base,
    stroke: pal.accents.coral.shade,
    'stroke-width': 1,
    'stroke-linejoin': 'round',
  }),
  el('path', { d: poly(jaggedCore(cx, by, w, h)), fill: pal.accents.ochre.light }),
];

const disc = (pal: Palette): SvgNode =>
  el('path', {
    d: ellipsePath(0, 0, 11, 11),
    fill: pal.paper,
    stroke: pal.ink,
    'stroke-width': 1.4,
  });

/**
 * The `fears-fire` mark for a threat, tips and the glossary: a small beast rearing back from a flame, its
 * forelegs up and speed lines behind it, on a paper disc.
 */
export function drawFearsFireMark(palette: Palette, size = 24): SvgNode {
  const pal = palette;
  const s = px(size, 24);
  const line = (d: string, width: number, colour: string): SvgNode =>
    el('path', { d, ...inkAttrs(colour, width) });
  const hide = pal.ramps.hide;
  return el('svg', { viewBox: '-12 -12 24 24', width: s, height: s, 'data-mark': 'fears-fire' }, [
    disc(pal),
    // The flame, low at the left.
    ...jaggedFlameNodes(pal, -6.2, 8, 6.6, 9.5),
    // Speed lines trailing the beast.
    line('M6.2 -5.6L9.4 -5.6M7.2 -3.2L10.2 -3.2M8 -0.8L10.4 -0.8', 1, pal.inkSoft),
    // Raised forelegs, hind legs braced, a curled tail.
    line('M0.8 3.6L-1.8 1.2M2.6 4.6L0.6 6.6', 1.4, pal.ink),
    line('M3.6 6.2L3 8.8M6.6 6.2L7.2 8.8', 1.4, pal.ink),
    line('M7.8 2.6C10.2 2.8 10.4 -0.4 8.6 -0.8', 1.3, pal.ink),
    // Body leaning back, head thrown up with an ear, a snout and a wide eye.
    el('path', {
      d: 'M1.6 3.4C1.8 0.8 5.2 -0.4 7.4 1.2C8.8 2.6 8.2 5.6 5.4 6.2C3 6.6 1.4 5.6 1.6 3.4Z',
      fill: hide.base,
      stroke: pal.ink,
      'stroke-width': 1.1,
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: 'M0.8 -3.6L2.2 -5.8L3.6 -3.4Z',
      fill: hide.shade,
      stroke: pal.ink,
      'stroke-width': 0.9,
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: ellipsePath(1.6, -1.6, 2.9, 2.6),
      fill: hide.light,
      stroke: pal.ink,
      'stroke-width': 1.1,
    }),
    el('path', { d: ellipsePath(1, -2, 0.75, 0.75), fill: pal.ink }),
  ]);
}

/**
 * The `burnable` hint for tips: a log with a twig and a small jagged flame licking up from it (it could
 * take fire), on a paper disc.
 */
export function drawBurnableMark(palette: Palette, size = 24): SvgNode {
  const pal = palette;
  const s = px(size, 24);
  const bark = pal.ramps.bark;
  const log = 'M-8.4 6.6L7.6 6.6';
  return el('svg', { viewBox: '-12 -12 24 24', width: s, height: s, 'data-mark': 'burnable' }, [
    disc(pal),
    el('path', { d: 'M3.4 6L7.2 2.2M2 6L-1 2.4', ...inkAttrs(bark.shade, 1.4) }),
    el('path', { d: log, ...inkAttrs(bark.shade, 5) }),
    el('path', { d: log, ...inkAttrs(bark.base, 3.2) }),
    el('path', {
      d: ellipsePath(-8.4, 6.6, 1.5, 2.4),
      fill: pal.ramps.sand.light,
      stroke: bark.shade,
      'stroke-width': 0.8,
    }),
    ...jaggedFlameNodes(pal, -0.4, 5, 9.6, 12),
  ]);
}

/**
 * The fire glow: a clear warm orange wash laid on the ground of a lit brazier's own hex and the hexes within
 * `radius` (default 1) of it, strongest at the brazier and fading out, with the hex edges faintly lit.
 * Draw it on the ground plane under the props (drawing coordinates, like `drawFireRing`). A cold brazier
 * has none. Carries `data-fire-glow="q,r"`.
 */
export function drawFireGlow(p: Projection, hex: Hex, palette: Palette, radius = 1): SvgNode {
  const reach = Number.isFinite(radius) ? Math.max(0, Math.min(4, Math.round(radius))) : 1;
  const c = hexCenter(p, hex.q, hex.r);
  const fillD: string[] = [];
  for (let dq = -reach; dq <= reach; dq += 1)
    for (let dr = -reach; dr <= reach; dr += 1)
      if (hexDistance({ q: 0, r: 0 }, { q: dq, r: dr }) <= reach)
        fillD.push(poly(hexCorners(p, hexCenter(p, hex.q + dq, hex.r + dr))));
  const id = `fire_glow_${palette.id}_${hex.q}_${hex.r}_${reach}`.replaceAll('-', 'm');
  const rx = p.size * (Math.sqrt(3) * reach + 1);
  const stop = (offset: string, colour: string, opacity: number): SvgNode =>
    el('stop', { offset, 'stop-color': colour, 'stop-opacity': opacity });
  return el('g', { 'data-fire-glow': `${hex.q},${hex.r}` }, [
    el('defs', {}, [
      el(
        'radialGradient',
        {
          id,
          gradientUnits: 'userSpaceOnUse',
          cx: c.x,
          cy: c.y,
          r: rx,
          gradientTransform: `translate(${c.x.toFixed(2)} ${c.y.toFixed(2)}) scale(1 ${p.squash.toFixed(3)}) translate(${(-c.x).toFixed(2)} ${(-c.y).toFixed(2)})`,
        },
        [
          stop('0%', palette.accents.coral.base, 0.85),
          stop('45%', palette.accents.coral.base, 0.55),
          stop('100%', palette.accents.ochre.base, 0.3),
        ],
      ),
    ]),
    el('path', { d: fillD.join(''), fill: `url(#${id})` }),
    el('path', {
      d: fillD.join(''),
      fill: 'none',
      stroke: palette.accents.coral.base,
      'stroke-width': Math.max(1, 1.2 * p.k),
      opacity: 0.35,
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
/** How far a pinned character is laid over from upright, in degrees (90 is flat). */
const LIE_DEGREES = 84;
/** The parts `drawCharacter` draws first: a soft shadow, the footing disc and its outline. A test pins this. */
export const FOOTING_NODES = 3;

/**
 * A character pinned under a slide lies almost flat: the standee `drawn` at `origin` (its feet, same
 * arguments as `drawCharacter`) turned onto its side, head to the left, resting on the ground. The standee's
 * footing disc (its first `FOOTING_NODES` parts) stays out, since a lying figure has no stand.
 * `drawPinned` then heaps the stones over it.
 */
export function liePinned(drawn: Drawn, origin: Point, size: number): Drawn {
  const k = (size * ART_TUNING.characterHeight) / HEIGHT_UNITS;
  const body = drawn.nodes.slice(FOOTING_NODES);
  const lift = 9 * k;
  const length = HEIGHT_UNITS * k;
  return {
    nodes: [
      el(
        'g',
        {
          transform: `translate(0 ${(-lift).toFixed(2)}) rotate(${-LIE_DEGREES} ${origin.x.toFixed(2)} ${origin.y.toFixed(2)})`,
          'data-mark': 'pinned-body',
        },
        body,
      ),
    ],
    box: {
      x0: origin.x - length - 12 * k,
      x1: origin.x + 14 * k,
      y0: origin.y - lift - 14 * k,
      y1: origin.y + 4 * k,
    },
  };
}

/**
 * Pinned: fallen stones heaped over the middle of a character who lies almost flat on the ground (see
 * `liePinned`, which lays the standee down), their head and one arm reaching out past the stones, a dust
 * puff at the feet and motes in the air. `origin` is the standee's feet, with the same arguments as
 * `drawCharacter`. Parts carry `data-mark="pinned"`.
 */
export function drawPinned(
  palette: Palette,
  origin: Point,
  size: number,
  squash: number,
  ink: number,
): Drawn {
  const k = (size * ART_TUNING.characterHeight) / HEIGHT_UNITS;
  // Local units run along the lying body: x is minus towards the head, y is up (negative).
  const T = mapper(origin, k, 1, k * riseFor(squash));
  const pal = palette;
  const pts = (raw: Raw): Point[] => raw.map(([x, y]) => T(x, y));
  const w = ink * 0.95;
  const nodes: SvgNode[] = [];
  const all: Point[] = [];
  const sq = squash / 0.6;
  const rocks: readonly { raw: Raw; tone: 'light' | 'base' }[] = [
    // The low back stone over the feet.
    {
      raw: [
        [-3, 0.5],
        [-3.6, -8],
        [2, -13],
        [10, -10.5],
        [12, 0.5],
      ],
      tone: 'base',
    },
    // The big boulder across the hips and belly.
    {
      raw: [
        [-24, 0.5],
        [-25.5, -10],
        [-19, -19],
        [-8.5, -21],
        [-1.5, -14],
        [-1, 0.5],
      ],
      tone: 'light',
    },
    // A stone against the chest.
    {
      raw: [
        [-35, 0.5],
        [-34.5, -9],
        [-29.5, -13.5],
        [-24, -9.5],
        [-23, 0.5],
      ],
      tone: 'base',
    },
    // One resting on the big boulder.
    {
      raw: [
        [-18, -15],
        [-16, -23.5],
        [-9, -25],
        [-6.5, -18],
        [-11, -14],
      ],
      tone: 'light',
    },
  ];
  const dust = [
    [14, 1, 3.6],
    [9, 3.2, 3],
    [-37, 3, 3],
    [-27, 3.4, 3.4],
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
  all.push(T(-62, -12), T(17, 5));
  // The arm reaching out past the head: a sleeve, then a hand with fingers.
  const shoulder = T(-37, -3.4);
  const wrist = T(-58, -2.6);
  const hand = T(-61, -3);
  nodes.push(
    el('path', {
      d: poly([shoulder, T(-48, -5.4), wrist], false),
      ...inkAttrs(pal.ink, w * 1.1 + 5.4 * k),
      'data-mark': 'pinned',
    }),
    el('path', {
      d: poly([shoulder, T(-48, -5.4), wrist], false),
      ...inkAttrs(pal.ramps.hide.base, 5.4 * k),
      'data-mark': 'pinned',
    }),
    el('path', {
      d: ellipsePath(hand.x, hand.y, 3.2 * k, 2.4 * k * sq),
      fill: pal.skin,
      stroke: pal.ink,
      'stroke-width': w * 0.9,
      'data-mark': 'pinned',
    }),
    el('path', {
      d: poly([T(-63, -4.6), T(-66, -6)], false) + poly([T(-63.5, -2.4), T(-66.5, -2.6)], false),
      ...inkAttrs(pal.ink, w * 0.8),
      'data-mark': 'pinned',
    }),
  );
  all.push(T(-67, -7), T(-67, 2));
  for (const r of rocks) {
    const body = pts(r.raw);
    all.push(...body);
    nodes.push(
      el('path', { d: poly(body), fill: pal.ramps.rock[r.tone], 'data-mark': 'pinned' }),
      el('path', { ...inkAttrs(pal.ink, w), d: poly(body), 'data-mark': 'pinned' }),
    );
  }
  const motes = [T(-30, -22), T(-14, -29), T(8, -17), T(13, -10)];
  all.push(...motes);
  nodes.push(
    el('path', {
      d: motes
        .map((m, i) =>
          ellipsePath(m.x, m.y, (1.1 - (i % 2) * 0.3) * k * 1.4, (1.1 - (i % 2) * 0.3) * k * 1.4),
        )
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
