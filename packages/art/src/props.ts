/**
 * Upright props in side view, as on old maps: trees, tufts, dunes, rocks, cliffs, hills and the ruin. Each
 * draws at a base point on the ground and takes all variation from its own seeded generator. Local units
 * are px at the reference hex size (64), y up is negative; `k` scales them.
 */
import { ART_TUNING } from './config.ts';
import {
  boxOf,
  ellipsePath,
  f,
  mapper,
  poly,
  smoothClosed,
  smoothOpen,
  type Box,
  type Point,
} from './geom.ts';
import type { Palette } from './palette.ts';
import type { Rng } from './rng.ts';
import { el, type AttrValue, type SvgNode } from './svg.ts';

export interface PropContext {
  readonly palette: Palette;
  readonly rng: Rng;
  /** The base point on the ground, in screen px. */
  readonly origin: Point;
  /** Scale against the reference hex size. */
  readonly k: number;
  /** Vertical squash of the ground plane (for shadows). */
  readonly squash: number;
  /** The scene's base ink width in px (already scaled and held at its screen minimum). */
  readonly ink: number;
  /** Height scale for the view angle: 1 at a low view, less as the view looks further down. */
  readonly rise: number;
}

/**
 * How much upright things shrink in height at a plane squash: halfway between upright (1) and the true
 * foreshortening √(1 − squash²), so props keep their old-map, side-view charm at a high view.
 */
export function riseFor(squash: number): number {
  const reference = Math.sqrt(1 - 0.6 * 0.6);
  const truth = Math.sqrt(Math.max(0, 1 - squash * squash));
  return Math.min(1, (1 + truth / reference) / 2);
}

export interface Drawn {
  readonly nodes: SvgNode[];
  readonly box: Box;
}

export type PropDraw = (c: PropContext) => Drawn;

type Raw = readonly (readonly [number, number])[];

export function inkAttrs(colour: string, width: number): Record<string, AttrValue> {
  return {
    fill: 'none',
    stroke: colour,
    'stroke-width': width,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  };
}

/**
 * The base ink width for a scene: the tuned width at this hex size, but never thinner than `minInkPx` on
 * screen when the drawing is shown at `zoom` screen px per drawing px.
 */
export function inkWidth(k: number, zoom = 1, minInkPx: number = ART_TUNING.minInkPx): number {
  const base = ART_TUNING.inkWidth * k;
  if (!Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(minInkPx)) return base;
  return Math.max(base, minInkPx / zoom);
}

/** A soft wash shadow on the ground, squashed with the plane. */
export function groundShadow(c: PropContext, rx: number, ry: number, dx = 0): SvgNode {
  return el('path', {
    d: ellipsePath(c.origin.x + dx * c.k, c.origin.y, rx * c.k, ry * c.k * (c.squash / 0.6)),
    fill: c.palette.shadow,
    opacity: 0.16,
  });
}

function shape(c: PropContext, raw: Raw, jitter = 0): Point[] {
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  return raw.map(([x, y]) =>
    T(
      x + (jitter ? c.rng.range(-jitter, jitter) : 0),
      y + (jitter ? c.rng.range(-jitter, jitter) : 0),
    ),
  );
}

function wash(d: string, fill: string, opacity = 1): SvgNode {
  return el('path', opacity === 1 ? { d, fill } : { d, fill, opacity });
}

function ink(c: PropContext, d: string, scale = 1, colour?: string): SvgNode {
  return el('path', { d, ...inkAttrs(colour ?? c.palette.ink, c.ink * scale) });
}

const conifer: PropDraw = (c) => {
  const { rng, palette } = c;
  const ramp = palette.ramps.conifer;
  const h = rng.range(40, 54);
  const w = h * rng.range(0.4, 0.48);
  const lean = rng.range(-2.5, 2.5);
  const tiers = rng.int(2, 3);
  const right: [number, number][] = [];
  for (let i = 0; i < tiers; i += 1) {
    const yOut = -h * (0.12 + ((tiers - 1 - i) * 0.6) / tiers);
    const width = w * (0.5 - ((tiers - 1 - i) * 0.24) / tiers);
    if (i > 0) right.push([width * 0.42, yOut - h * 0.03]);
    right.push([width, yOut]);
  }
  right.sort((a, b) => a[1] - b[1]);
  const raw: [number, number][] = [
    [0, -h],
    ...right.map(([x, y]): [number, number] => [x, y]),
    ...right
      .slice()
      .reverse()
      .map(([x, y]): [number, number] => [-x, y]),
  ];
  const leaned: Raw = raw.map(([x, y]) => [x + lean * (-y / h), y]);
  const trunkRaw: Raw = [
    [-w * 0.07, -h * 0.14],
    [w * 0.07, -h * 0.14],
    [w * 0.06, 0],
    [-w * 0.06, 0],
  ];
  const crown = shape(c, leaned);
  const crownWash = shape(c, leaned, 1.4);
  const shadeRaw: Raw = [
    [lean, -h],
    ...leaned.slice(1, right.length + 1),
    [lean * 0.12, -h * 0.12],
  ];
  const trunk = shape(c, trunkRaw);
  return {
    nodes: [
      groundShadow(c, w * 0.55, w * 0.17, 2),
      wash(poly(trunk), palette.ramps.bark.base),
      ink(c, poly(trunk), 0.8),
      wash(poly(crownWash), ramp.base),
      wash(poly(shape(c, shadeRaw)), ramp.shade, 0.55),
      ink(c, poly(crown)),
    ],
    box: boxOf([...crown, ...trunk]),
  };
};

function blobRaw(
  rng: Rng,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  wobble: number,
): Raw {
  const out: [number, number][] = [];
  const turn = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i += 1) {
    const a = turn + (Math.PI * 2 * i) / n;
    const f = 1 + rng.range(-wobble, wobble);
    out.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
  }
  return out;
}

const broadleaf: PropDraw = (c) => {
  const { rng, palette } = c;
  const ramp = palette.ramps.foliage;
  const h = rng.range(34, 46);
  const cw = h * rng.range(0.62, 0.78);
  const cy = -h * 0.62;
  const ry = h * 0.36;
  const crownRaw = blobRaw(rng, 0, cy, cw / 2, ry, 9, 0.12);
  const crown = shape(c, crownRaw);
  const crownWash = shape(c, crownRaw, 1.5);
  const shade = shape(c, blobRaw(rng, cw * 0.12, cy + ry * 0.28, cw * 0.3, ry * 0.55, 7, 0.12));
  const light = shape(c, blobRaw(rng, -cw * 0.15, cy - ry * 0.3, cw * 0.2, ry * 0.32, 6, 0.15));
  const trunkRaw: Raw = [
    [-2.2, 0],
    [-1.4, cy + ry * 0.4],
    [1.4, cy + ry * 0.4],
    [2.2, 0],
  ];
  const trunk = shape(c, trunkRaw);
  return {
    nodes: [
      groundShadow(c, cw * 0.45, cw * 0.14, 2),
      wash(poly(trunk), palette.ramps.bark.base),
      ink(c, poly(trunk), 0.8),
      wash(smoothClosed(crownWash), ramp.base),
      wash(smoothClosed(shade), ramp.shade, 0.5),
      wash(smoothClosed(light), ramp.light, 0.7),
      ink(c, smoothClosed(crown)),
    ],
    box: boxOf([...crown, ...trunk]),
  };
};

const tuft: PropDraw = (c) => {
  const { rng, palette } = c;
  const blades = rng.int(3, 5);
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  const parts: string[] = [];
  const pts: Point[] = [];
  for (let i = 0; i < blades; i += 1) {
    const x = (i - (blades - 1) / 2) * 1.6;
    const len = rng.range(4, 7.5);
    const bend = (i - (blades - 1) / 2) * rng.range(0.8, 1.6);
    const a = T(x, 0);
    const m = T(x + bend * 0.4, -len * 0.6);
    const b = T(x + bend, -len);
    parts.push(smoothOpen([a, m, b]));
    pts.push(a, b);
  }
  return {
    nodes: [el('path', { d: parts.join(''), ...inkAttrs(palette.inkSoft, c.ink * 0.8) })],
    box: boxOf(pts),
  };
};

const dune: PropDraw = (c) => {
  const { rng, palette } = c;
  const ramp = palette.ramps.sand;
  const w = rng.range(24, 34);
  const h = rng.range(8, 13);
  const px = rng.range(-0.2, 0.25) * w;
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  const P = (x: number, y: number): string => {
    const p = T(x, y);
    return `${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`;
  };
  const top = `M${P(-w, 0)}C${P(-w * 0.5, 0)} ${P(px - w * 0.3, -h)} ${P(px, -h)}C${P(px + w * 0.25, -h)} ${P(w * 0.55, 0)} ${P(w, 0)}`;
  const lee = `M${P(px, -h)}C${P(px + w * 0.25, -h)} ${P(w * 0.55, 0)} ${P(w, 0)}L${P(px + w * 0.12, 0)}Q${P(px + w * 0.02, -h * 0.4)} ${P(px, -h)}Z`;
  const ripple = `M${P(-w * 0.62, -h * 0.12)}C${P(-w * 0.4, -h * 0.2)} ${P(px - w * 0.3, -h * 0.62)} ${P(px - w * 0.12, -h * 0.72)}`;
  return {
    nodes: [
      el('path', { d: `${top}Z`, fill: ramp.light }),
      el('path', { d: lee, fill: ramp.shade, opacity: 0.55 }),
      el('path', { d: ripple, ...inkAttrs(palette.inkSoft, c.ink * 0.6) }),
      ink(c, top),
    ],
    box: boxOf([T(-w, 0), T(w, 0), T(px, -h)]),
  };
};

const reeds: PropDraw = (c) => {
  const { rng, palette } = c;
  const stems = rng.int(5, 8);
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  const P = (x: number, y: number): Point => T(x, y);
  const parts: string[] = [];
  const heads: string[] = [];
  const pts: Point[] = [];
  for (let i = 0; i < stems; i += 1) {
    const x = (i - (stems - 1) / 2) * 1.9 + rng.range(-0.5, 0.5);
    const len = rng.range(13, 22);
    const lean = (i - (stems - 1) / 2) * rng.range(0.5, 1.1);
    const a = P(x, 0);
    const m = P(x + lean * 0.4, -len * 0.55);
    const b = P(x + lean, -len);
    parts.push(smoothOpen([a, m, b]));
    pts.push(a, b);
    // Every other stem carries a brown seed head: a narrow oval at its tip.
    if (i % 2 === 0) {
      const t = P(x + lean * 1.05, -len - 1.8);
      heads.push(ellipsePath(t.x, t.y, 0.9 * c.k, 1.9 * c.k));
      pts.push(t);
    }
  }
  const pool = P(0, 0.6);
  return {
    nodes: [
      el('path', {
        d: ellipsePath(pool.x, pool.y, 9 * c.k, 2 * c.k * c.rise),
        fill: palette.ramps.water.base,
        opacity: 0.8,
      }),
      el('path', { d: parts.join(''), ...inkAttrs(palette.ramps.foliage.shade, c.ink * 0.9) }),
      el('path', {
        d: heads.join(''),
        fill: palette.ramps.bark.base,
        stroke: palette.ink,
        'stroke-width': c.ink * 0.6,
      }),
    ],
    box: boxOf(pts),
  };
};

const rock: PropDraw = (c) => {
  const { rng, palette } = c;
  const ramp = palette.ramps.rock;
  const w = rng.range(10, 16);
  const h = rng.range(9, 14);
  const raw: Raw = [
    [-w, 0],
    [-w * 0.85, -h * 0.55],
    [-w * 0.25, -h],
    [w * 0.35, -h * 0.88],
    [w * 0.9, -h * 0.35],
    [w, 0],
  ];
  const outline = shape(c, raw, 1);
  const facetRaw: Raw = [
    [w * 0.35, -h * 0.88],
    [w * 0.9, -h * 0.35],
    [w, 0],
    [w * 0.1, 0],
    [w * 0.05, -h * 0.55],
  ];
  const crack = shape(c, [
    [-w * 0.25, -h],
    [-w * 0.1, -h * 0.6],
    [w * 0.05, -h * 0.55],
  ]);
  return {
    nodes: [
      groundShadow(c, w * 1.1, w * 0.25, 2),
      wash(poly(shape(c, raw, 1)), ramp.light),
      wash(poly(shape(c, facetRaw)), ramp.shade, 0.6),
      ink(c, poly(crack, false), 0.7, palette.inkSoft),
      ink(c, poly(outline)),
    ],
    box: boxOf(outline),
  };
};

/** An escarpment: a rock face running across the tile, a strip of plateau on top and rubble at its foot. */
const cliff: PropDraw = (c) => {
  const { rng, palette } = c;
  const ramp = palette.ramps.rock;
  const w = rng.range(44, 50);
  const h = rng.range(22, 28);
  const n = 11;
  // The jagged top edge of the face, low at both ends where the ridge meets the ground.
  const edge: [number, number][] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = -w + 2 * w * t;
    // Flat along the ridge, dropping steeply at both ends.
    const end = Math.min(1, t / 0.14, (1 - t) / 0.14);
    const rise = end * end * (3 - 2 * end);
    edge.push([x, -(h + rng.range(-2.2, 2.2)) * rise - 0.5]);
  }
  const back = 9;
  // The plateau's back edge: the top edge raised, pulled in at the ends.
  const top: [number, number][] = edge.map(([x, y], i) => {
    const t = i / n;
    const inset = Math.min(1, t / 0.2, (1 - t) / 0.2);
    return [x * (1 - 0.05 * inset) + back * 0.25 * inset, y - back * inset];
  });
  const face: Raw = [...edge, [w, 0], [-w, 0]];
  const plateau: Raw = [...edge, ...top.slice().reverse()];
  const shade: Raw = [...edge.slice(Math.floor(n * 0.62)), [w, 0], [w * 0.22, 0]];
  const fissures: string[] = [];
  for (let i = 1; i < n; i += 1) {
    if (!rng.chance(0.55)) continue;
    const [x, y] = edge[i]!;
    const len = -y * rng.range(0.45, 0.85);
    fissures.push(
      poly(
        shape(c, [
          [x + rng.range(-1, 1), y + 2],
          [x + rng.range(-2, 2), y + 2 + len * 0.5],
          [x + rng.range(-1.5, 1.5), y + 2 + len],
        ]),
        false,
      ),
    );
  }
  const ledge = smoothOpen(
    shape(c, [
      [-w * 0.7, -h * 0.42],
      [-w * 0.2, -h * 0.5 + rng.range(-2, 2)],
      [w * 0.3, -h * 0.46],
      [w * 0.62, -h * 0.4],
    ]),
  );
  const rubble: string[] = [];
  const rubblePts: Point[] = [];
  for (let i = 0; i < 3; i += 1) {
    const x = rng.range(-w * 0.8, w * 0.8);
    const r = rng.range(2, 3.6);
    const p = shape(c, [
      [x - r, 2.5],
      [x - r * 0.6, 2.5 - r * 0.9],
      [x + r * 0.5, 2.5 - r],
      [x + r, 2.5],
    ]);
    rubble.push(poly(p));
    rubblePts.push(...p);
  }
  const faceS = shape(c, face);
  const plateauS = shape(c, plateau);
  return {
    nodes: [
      groundShadow(c, w * 1.02, 7, 0),
      wash(poly(shape(c, face, 0.8)), ramp.base),
      wash(poly(plateauS), palette.ramps.heath.light),
      wash(poly(shape(c, shade)), ramp.shade, 0.55),
      el('path', { d: fissures.join('') + ledge, ...inkAttrs(palette.inkSoft, c.ink * 0.75) }),
      wash(rubble.join(''), ramp.shade, 0.7),
      ink(c, poly(plateauS)),
      ink(
        c,
        poly(faceS.slice(0, n + 1).concat([faceS[n + 1]!]), false) +
          poly([faceS[0]!, faceS[n + 2]!], false),
        1,
      ),
    ],
    box: boxOf([...faceS, ...plateauS, ...rubblePts]),
  };
};

const hill: PropDraw = (c) => {
  const { rng, palette } = c;
  const ramp = palette.ramps.heath;
  const w = rng.range(22, 30);
  const h = rng.range(14, 20);
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  const curve = (t: number): Point => {
    // A cubic hump from (-w, 0) to (w, 0) with controls at (-w*0.55, -h*1.3) and (w*0.5, -h*1.3).
    const u = 1 - t;
    const x =
      u * u * u * -w + 3 * u * u * t * (-w * 0.55) + 3 * u * t * t * (w * 0.5) + t * t * t * w;
    const y = 3 * u * u * t * (-h * 1.3) + 3 * u * t * t * (-h * 1.3);
    return { x, y };
  };
  const top: Point[] = [];
  for (let i = 0; i <= 12; i += 1) top.push(curve(i / 12));
  const topScreen = top.map((p) => T(p.x, p.y));
  const hachures: string[] = [];
  const n = rng.int(5, 7);
  for (let i = 0; i < n; i += 1) {
    const p = curve(0.55 + (i / n) * 0.4);
    const len = 3 + (h + p.y) * 0.12 + rng.range(0, 2);
    hachures.push(poly([T(p.x, p.y + 1.2), T(p.x + len * 0.35, p.y + 1.2 + len)], false));
  }
  return {
    nodes: [
      el('path', { d: `${smoothOpen(topScreen)}Z`, fill: ramp.light }),
      el('path', {
        d: `${smoothOpen(topScreen.slice(6))}L${f(T(w * 0.1, 0).x)} ${f(T(w * 0.1, 0).y)}Z`,
        fill: ramp.shade,
        opacity: 0.5,
      }),
      el('path', { d: hachures.join(''), ...inkAttrs(palette.inkSoft, c.ink * 0.75) }),
      ink(c, smoothOpen(topScreen)),
    ],
    box: boxOf(topScreen),
  };
};

const ruin: PropDraw = (outer) => {
  const c = { ...outer, k: outer.k * 1.55, ink: outer.ink * 1.15 };
  const { rng, palette } = c;
  const ramp = palette.ramps.stone;
  const tall = rng.range(28, 34);
  const short = rng.range(15, 20);
  const col = (x: number, h: number, broken: boolean): Raw => {
    const top: [number, number][] = broken
      ? [
          [x + 3.6, -h + 1.5],
          [x + 1.2, -h - 1.5],
          [x - 0.8, -h + 0.8],
          [x - 3.6, -h - 0.6],
        ]
      : [
          [x + 3.6, -h],
          [x - 3.6, -h],
        ];
    return [[x - 3.6, -4], [x + 3.6, -4], ...top];
  };
  const colA = col(-11, tall, false);
  const colB = col(9, short, true);
  const lintel: Raw = [
    [-19, -tall - 5],
    [-1, -tall - 5.5],
    [-0.5, -tall],
    [-18.5, -tall + 0.4],
  ];
  const slab: Raw = [
    [-21, 0],
    [-20, -4],
    [20, -4.5],
    [21, 0],
  ];
  const fallen: Raw = [
    [15, 0],
    [16, -4.5],
    [24, -3.6],
    [24.5, 0],
  ];
  const shadeOf = (x: number, h: number): Raw => [
    [x + 0.8, -4],
    [x + 3.6, -4],
    [x + 3.6, -h + 1],
    [x + 0.8, -h + 1],
  ];
  const all = [colA, colB, lintel, slab, fallen].map((r) => shape(c, r, 0.4));
  const lines = [
    poly(
      shape(c, [
        [-11, -tall * 0.55],
        [-9.5, -tall * 0.45],
      ]),
      false,
    ),
    poly(
      shape(c, [
        [9, -short * 0.6],
        [10.5, -short * 0.48],
      ]),
      false,
    ),
  ];
  return {
    nodes: [
      groundShadow(c, 24, 5, 3),
      ...all.map((pts) => wash(poly(pts), ramp.light)),
      wash(
        poly(shape(c, shadeOf(-11, tall))) + poly(shape(c, shadeOf(9, short))),
        ramp.shade,
        0.55,
      ),
      el('path', { d: lines.join(''), ...inkAttrs(palette.inkSoft, c.ink * 0.7) }),
      ink(c, all.map((pts) => poly(pts)).join('')),
    ],
    box: boxOf(all.flat()),
  };
};

/**
 * The glint (the hint mark): something here is undiscovered, never what. Made to read at phone zoom: a large
 * four-point twinkle with a soft glow, two small sparkles, and a ring on the ground around the hex's heart
 * that pulses. Its parts carry `data-glint` (`ring`, `halo`, `star`, `specks`) so the map can pulse the
 * ring and the glow and twinkle the star. Warm and light, never the red of a threat.
 */
export const hintMark: PropDraw = (c) => {
  const { palette } = c;
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  const cy = -32;
  const star: Point[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? (i % 4 === 0 ? 26 : 17) : 3.6;
    star.push(T(Math.cos(a) * rr, cy + Math.sin(a) * rr));
  }
  const d1 = T(24, cy - 20);
  const d2 = T(-23, cy + 14);
  const ringRx = 38 * c.k;
  const ringRy = ringRx * c.squash;
  const small = (p: Point, r: number): string => {
    const w = r * c.k;
    const h = r * c.k * c.rise;
    return poly([
      { x: p.x, y: p.y - h },
      { x: p.x + 0.3 * w, y: p.y - 0.3 * h },
      { x: p.x + w, y: p.y },
      { x: p.x + 0.3 * w, y: p.y + 0.3 * h },
      { x: p.x, y: p.y + h },
      { x: p.x - 0.3 * w, y: p.y + 0.3 * h },
      { x: p.x - w, y: p.y },
      { x: p.x - 0.3 * w, y: p.y - 0.3 * h },
    ]);
  };
  return {
    nodes: [
      el('path', {
        d: ellipsePath(c.origin.x, c.origin.y, ringRx, ringRy),
        fill: palette.hint,
        'fill-opacity': 0.14,
        stroke: palette.hint,
        'stroke-width': c.ink * 1.6,
        'stroke-opacity': 0.75,
        'stroke-dasharray': `${6 * c.k} ${4 * c.k}`,
        'data-glint': 'ring',
      }),
      el('path', {
        d: ellipsePath(c.origin.x, c.origin.y + cy * c.k * c.rise, 26 * c.k, 26 * c.k),
        fill: palette.hint,
        opacity: 0.16,
        'data-glint': 'halo',
      }),
      el('path', {
        d: poly(star),
        fill: palette.paper,
        stroke: palette.hint,
        'stroke-width': c.ink * 1.3,
        'stroke-linejoin': 'round',
        'data-glint': 'star',
      }),
      el('path', {
        d: small(d1, 7) + small(d2, 5.5),
        fill: palette.paper,
        stroke: palette.hint,
        'stroke-width': c.ink * 0.9,
        'stroke-linejoin': 'round',
        'data-glint': 'specks',
      }),
    ],
    box: boxOf([
      ...star,
      d1,
      d2,
      { x: c.origin.x - ringRx, y: c.origin.y - ringRy },
      { x: c.origin.x + ringRx, y: c.origin.y + ringRy },
      T(-30, cy - 30),
      T(30, cy + 30),
    ]),
  };
};

/** Prop drawers by kind. Hand-drawn overrides can replace any entry (`renderScene`'s `overrides`). */
/** Glass waste: a cluster of tall, dark, glassy spikes leaning from a pale skirt of splinters, each with a glint. */
const shards: PropDraw = (c) => {
  const { rng, palette } = c;
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  const P = (x: number, y: number): Point => T(x, y);
  const n = rng.int(3, 5);
  const nodes: SvgNode[] = [groundShadow(c, 15, 3.4, 1)];
  const all: Point[] = [P(-15, 1), P(15, 1)];
  const glints: string[] = [];
  const stars: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = (i - (n - 1) / 2) * 6.2 + rng.range(-1.4, 1.4);
    const h = (i === Math.floor(n / 2) ? 1 : rng.range(0.55, 0.85)) * rng.range(30, 38);
    const w = rng.range(3.4, 5.2);
    const lean = rng.range(-5, 5);
    const body = [
      P(x - w, 0),
      P(x - w * 0.55 + lean * 0.3, -h * 0.55),
      P(x + lean, -h),
      P(x + w * 0.6 + lean * 0.4, -h * 0.5),
      P(x + w, 0),
    ];
    const facet = [
      P(x + w * 0.1, 0),
      P(x + lean * 0.5 + w * 0.05, -h * 0.55),
      P(x + lean, -h),
      P(x + w * 0.6 + lean * 0.4, -h * 0.5),
      P(x + w, 0),
    ];
    all.push(...body);
    nodes.push(
      wash(poly(body), palette.ramps.crag.shade),
      wash(poly(facet), palette.ink, 0.55),
      ink(c, poly(body), 0.9),
    );
    glints.push(poly([P(x - w * 0.55, -h * 0.12), P(x - w * 0.3 + lean * 0.25, -h * 0.52)], false));
    if (i % 2 === 0) {
      const t = P(x + lean * 0.9, -h * 0.82);
      const r = 2.4 * c.k;
      stars.push(
        `M${f(t.x)} ${f(t.y - r)}L${f(t.x + r * 0.28)} ${f(t.y - r * 0.28)}L${f(t.x + r)} ${f(t.y)}L${f(t.x + r * 0.28)} ${f(t.y + r * 0.28)}L${f(t.x)} ${f(t.y + r)}L${f(t.x - r * 0.28)} ${f(t.y + r * 0.28)}L${f(t.x - r)} ${f(t.y)}L${f(t.x - r * 0.28)} ${f(t.y - r * 0.28)}Z`,
      );
    }
  }
  // Splinters at the foot.
  const bits = [-13, -9, 8, 12].map((x, i) => {
    const b = P(x + rng.range(-1, 1), 0.4);
    return poly([b, P(x + 1.6, -1 - (i % 2)), P(x + 3.4, 0.4)]);
  });
  nodes.push(
    wash(bits.join(''), palette.ramps.crag.shade, 0.9),
    ink(c, glints.join(''), 0.7, palette.paper),
    wash(stars.join(''), palette.paper),
  );
  return { nodes, box: boxOf(all) };
};

/** A dead reed or two standing in murk: bare stems, snapped and hooked at the tip, with bubbles at the foot. */
const deadreed: PropDraw = (c) => {
  const { rng, palette } = c;
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  const P = (x: number, y: number): Point => T(x, y);
  const stems = rng.int(3, 4);
  const parts: string[] = [];
  const pts: Point[] = [];
  for (let i = 0; i < stems; i += 1) {
    const x = (i - (stems - 1) / 2) * 3.2 + rng.range(-0.6, 0.6);
    const len = rng.range(15, 24);
    const lean = (i - (stems - 1) / 2) * rng.range(0.7, 1.4);
    const hook = i % 2 ? 1 : -1;
    const a = P(x, 0);
    const m = P(x + lean * 0.5, -len * 0.6);
    const b = P(x + lean, -len);
    const hookEnd = P(x + lean + hook * 3.6, -len + 3.4);
    parts.push(smoothOpen([a, m, b, hookEnd]));
    pts.push(a, b, hookEnd);
  }
  const pool = P(0, 0.8);
  const bubbles = [
    [-8, 0.2, 1.7],
    [6, 1.2, 1.3],
    [9.5, -0.4, 0.9],
  ] as const;
  return {
    nodes: [
      el('path', {
        d: ellipsePath(pool.x, pool.y, 11 * c.k, 2.4 * c.k * c.rise),
        fill: palette.ramps.toxic.shade,
        opacity: 0.8,
      }),
      el('path', { d: parts.join(''), ...inkAttrs(palette.ramps.bark.shade, c.ink * 1.1) }),
      el('path', {
        d: bubbles
          .map(([x, y, r]) => {
            const b = P(x, y);
            return ellipsePath(b.x, b.y, r * c.k, r * c.k);
          })
          .join(''),
        fill: palette.accents.plum.light,
        stroke: palette.accents.plum.shade,
        'stroke-width': c.ink * 0.6,
      }),
    ],
    box: boxOf([...pts, P(-11, 1), P(11, 1)]),
  };
};

export const PROP_DRAWERS: Readonly<Record<string, PropDraw>> = {
  conifer,
  broadleaf,
  tuft,
  dune,
  reeds,
  rock,
  cliff,
  hill,
  ruin,
  shards,
  deadreed,
};

/** How much ground a prop needs around its base, in hex sizes (keeps props from piling up). */
export const PROP_SPACING: Readonly<Record<string, number>> = {
  conifer: 0.28,
  broadleaf: 0.32,
  tuft: 0.14,
  dune: 0.42,
  reeds: 0.3,
  rock: 0.24,
  cliff: 0.9,
  hill: 0.44,
  ruin: 0.6,
  shards: 0.5,
  deadreed: 0.34,
};
