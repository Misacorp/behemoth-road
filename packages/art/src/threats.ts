/**
 * Threats on a hex, drawn upright in side view like the props, keyed by the `icon` content gives each threat
 * type (`captors`, `swarm`, `rockslide`, `raiders`); an unknown key draws a neutral dark cairn. Every threat
 * stands on a faint coral stain (so it reads as hostile beside features), carries its strength as a row of
 * coral marks above it, and can show a short ground arrow toward the neighbour it steps to next and a pulsing
 * ring when it arrives tomorrow. Parts carry `data-threat="stain" | "figure" | "strength" | "arrow" | "pulse"`
 * so the map can animate the pulse and jolt the marks.
 */
import { ART_TUNING } from './config.ts';
import { kit } from './features.ts';
import { boxOf, ellipsePath, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import type { Palette, Ramp } from './palette.ts';
import { groundShadow, inkAttrs, riseFor, type Drawn, type PropContext } from './props.ts';
import { rngFor } from './rng.ts';
import { el, type SvgNode } from './svg.ts';

export const THREAT_LOOKS = ['captors', 'swarm', 'rockslide', 'raiders'] as const;
export type ThreatLook = (typeof THREAT_LOOKS)[number];

export interface ThreatArt {
  /** The threat type's content icon key (`THREAT_LOOKS`); unknown keys draw a neutral dark cairn. */
  readonly look: string;
  /** Its strength, drawn as that many marks (clamped to 0..6). */
  readonly strength: number;
  /** The neighbour offset (one of `DIRECTIONS`) it steps toward next; no arrow when absent or zero. */
  readonly toward?: { readonly q: number; readonly r: number } | null;
  /** It reaches the creature tomorrow: a ring on the ground the map pulses. */
  readonly arrivesTomorrow?: boolean;
}

/** A threat's figure only (no marks, arrow or pulse), in local units; `top` is its highest point (y). */
interface Figure {
  readonly nodes: SvgNode[];
  readonly points: Point[];
  readonly top: number;
}

type FigureDraw = (c: PropContext) => Figure;

/** A small hooded figure standing at (x, y), cloaked in `ramp`, its face in shadow with two pale eyes. */
function hooded(c: PropContext, x: number, y: number, ramp: Ramp, h = 21): Figure {
  const { pts, fill, line, T } = kit(c);
  const pal = c.palette;
  const s = h / 21;
  const body = pts([
    [x, y - 21 * s],
    [x + 4.5 * s, y - 18 * s],
    [x + 5.5 * s, y - 9 * s],
    [x + 6.5 * s, y],
    [x - 6.5 * s, y],
    [x - 5.5 * s, y - 9 * s],
    [x - 4.5 * s, y - 18 * s],
  ]);
  const shade = pts([
    [x + 1, y - 20 * s],
    [x + 4.5 * s, y - 18 * s],
    [x + 5.5 * s, y - 9 * s],
    [x + 6.5 * s, y],
    [x + 1.5 * s, y],
  ]);
  const face = T(x + 0.6 * s, y - 15.5 * s);
  const eyes = [T(x - 0.8 * s, y - 15.8 * s), T(x + 2 * s, y - 15.8 * s)];
  return {
    nodes: [
      fill(smoothClosed(body), ramp.base),
      fill(smoothClosed(shade), ramp.shade, 0.7),
      fill(ellipsePath(face.x, face.y, 3 * s * c.k, 2.6 * s * c.k * c.rise), pal.ink, 0.85),
      fill(
        eyes.map((e) => ellipsePath(e.x, e.y, 0.75 * c.k, 0.75 * c.k)).join(''),
        pal.ramps.sand.light,
      ),
      line(smoothClosed(body)),
    ],
    points: body,
    top: y - 21 * s,
  };
}

/** A captor band on foot: three hooded figures, a spear, a coil of rope and a net on a pole. */
const captors: FigureDraw = (c) => {
  const { pts, line, T, fill } = kit(c);
  const pal = c.palette;
  const ramp = pal.accents.plum;
  const back = hooded(c, 1, -3, pal.accents.slate, 20);
  const left = hooded(c, -10, 0, ramp);
  const right = hooded(c, 11, 1, ramp, 20);
  const spear = pts([
    [-16, 2],
    [-14, -31],
  ]);
  const tip = pts([
    [-15.4, -30],
    [-13.6, -36.5],
    [-12.2, -30.4],
  ]);
  const pole = pts([
    [17, 2],
    [18.5, -27],
  ]);
  const net = pts([
    [18.5, -27],
    [25, -22],
    [23, -14],
    [18, -17],
  ]);
  const coil = T(4.5, -9);
  const rope = smoothOpen(
    pts([
      [-4.5, -9],
      [0, -6],
      [4.5, -9],
    ]),
  );
  return {
    nodes: [
      groundShadow(c, 22, 4.5, 2),
      ...back.nodes,
      line(poly(spear, false), 1.4, pal.ramps.bark.shade),
      fill(poly(tip), pal.ramps.stone.base),
      line(poly(tip), 0.8),
      ...left.nodes,
      line(poly(pole, false), 1.4, pal.ramps.bark.shade),
      line(
        poly(net) +
          poly(
            pts([
              [20.5, -25.5],
              [20.5, -16],
            ]),
            false,
          ) +
          poly(
            pts([
              [18.5, -21.5],
              [24, -18],
            ]),
            false,
          ),
        0.7,
        pal.ramps.bark.base,
      ),
      ...right.nodes,
      line(rope, 0.9, pal.ramps.bark.base),
      fill(ellipsePath(coil.x, coil.y, 2.6 * c.k, 1.8 * c.k), pal.ramps.bark.light),
      line(
        ellipsePath(coil.x, coil.y, 2.6 * c.k, 1.8 * c.k) +
          ellipsePath(coil.x, coil.y, 1.2 * c.k, 0.8 * c.k),
        0.7,
        pal.ramps.bark.shade,
      ),
    ],
    points: [...back.points, ...left.points, ...right.points, ...spear, ...tip, ...net],
    top: -36.5,
  };
};

/** A pterodactyl at (x, y) in the air, wings spread, crest and beak turned by `dir`, `s` its size. */
function pterodactyl(c: PropContext, x: number, y: number, s: number, dir: 1 | -1): Figure {
  const { pts, fill, line } = kit(c);
  const pal = c.palette;
  const ramp = pal.accents.plum;
  const X = (u: number): number => x + dir * u * s;
  const Y = (v: number): number => y + v * s;
  const wings = pts([
    [X(-14), Y(1)],
    [X(-9), Y(-5)],
    [X(-4), Y(-3)],
    [X(0), Y(-1)],
    [X(4), Y(-3)],
    [X(9), Y(-6)],
    [X(14), Y(0)],
    [X(8), Y(-1.5)],
    [X(4), Y(1)],
    [X(0), Y(2)],
    [X(-4), Y(1)],
    [X(-8), Y(-0.5)],
  ]);
  const head = pts([
    [X(0.5), Y(-0.5)],
    [X(3), Y(-4)],
    [X(5.5), Y(-4.5)],
    [X(10), Y(-3.2)],
    [X(5), Y(-2.8)],
    [X(3), Y(0.5)],
  ]);
  const crest = pts([
    [X(3.6), Y(-4.2)],
    [X(0.5), Y(-7)],
    [X(4.6), Y(-4.8)],
  ]);
  const tail = pts([
    [X(-1), Y(1)],
    [X(-5), Y(4)],
  ]);
  return {
    nodes: [
      fill(poly(wings), ramp.base),
      fill(poly(head) + poly(crest), ramp.shade),
      line(poly(wings) + poly(head) + poly(crest), 0.9),
      line(poly(tail, false), 0.9),
    ],
    points: [...wings, ...head, ...crest],
    top: Y(-7),
  };
}

/** A pterodactyl swarm in the air over the hex, with their shadows on the ground below. */
const swarm: FigureDraw = (c) => {
  const pal = c.palette;
  const flyers = [
    pterodactyl(c, -8, -30, 1.25, 1),
    pterodactyl(c, 9, -43, 1.1, -1),
    pterodactyl(c, 8, -22, 0.95, 1),
  ];
  // Shadows sit on the ground, flattened with the plane; they do not rise with the view.
  const sq = c.squash / 0.6;
  const shadow = (x: number, w: number): string =>
    ellipsePath(c.origin.x + x * c.k, c.origin.y + 1 * c.k, w * c.k, 2.2 * c.k * sq);
  const { line, pts } = kit(c);
  const swoosh = smoothOpen(
    pts([
      [-20, -22],
      [-14, -19],
      [-6, -19],
    ]),
  );
  return {
    nodes: [
      el('path', {
        d: shadow(-8, 13) + shadow(9, 11) + shadow(8, 9),
        fill: pal.shadow,
        opacity: 0.3,
      }),
      line(swoosh, 0.8, pal.inkSoft),
      ...flyers.flatMap((f) => f.nodes),
    ],
    points: flyers.flatMap((f) => f.points),
    top: Math.min(...flyers.map((f) => f.top)),
  };
};

/** A teetering rockslide: a crag with boulders tipping off its crest, cracks, and stones rolling down. */
const rockslide: FigureDraw = (c) => {
  const { pts, fill, line, blob } = kit(c);
  const pal = c.palette;
  const slope = pts([
    [-21, 0],
    [-19, -13],
    [-12, -23],
    [-4, -24],
    [4, -14],
    [12, -6],
    [21, 0],
  ]);
  const shade = pts([
    [-4, -24],
    [4, -14],
    [12, -6],
    [21, 0],
    [3, 0],
    [-3, -14],
  ]);
  const crack = pts([
    [-9, -21],
    [-6, -15],
    [-8, -11],
    [-4, -5],
  ]);
  const big = blob(0, -27.5, 7, 6.2);
  const mid = blob(8.5, -12.5, 4.4, 4);
  const small = [blob(12, -5, 2.6, 2.4), blob(17.5, -1.8, 2.2, 2)];
  const dust = pts([
    [6, -3],
    [10, -1],
  ]);
  // Motion ticks either side of the perched boulder: it rocks on the edge.
  const wobble = smoothOpen(
    pts([
      [-8.5, -34],
      [-10, -30.5],
      [-8.5, -27],
    ]),
  );
  const wobble2 = smoothOpen(
    pts([
      [8.5, -35],
      [10, -31.5],
      [8.8, -28],
    ]),
  );
  const puffs = [pts([[15, -6]])[0]!, pts([[21, -3]])[0]!];
  return {
    nodes: [
      groundShadow(c, 22, 4.5),
      fill(smoothClosed(slope), pal.ramps.rock.base),
      fill(smoothClosed(shade), pal.ramps.rock.shade, 0.55),
      line(smoothClosed(slope)),
      line(poly(crack, false), 0.9, pal.ramps.rock.shade),
      fill(smoothClosed(big), pal.ramps.stone.base),
      line(smoothClosed(big)),
      fill(smoothClosed(mid), pal.ramps.stone.light),
      line(smoothClosed(mid)),
      ...small.flatMap((b) => [
        fill(smoothClosed(b), pal.ramps.stone.base),
        line(smoothClosed(b), 0.9),
      ]),
      line(wobble + wobble2, 0.9, pal.inkSoft),
      line(poly(dust, false), 0.7, pal.inkSoft),
      el('path', {
        d: puffs
          .map((p, i) => ellipsePath(p.x, p.y, (2.4 + i) * c.k, (1.6 + i * 0.4) * c.k))
          .join(''),
        fill: pal.ramps.rock.light,
        stroke: pal.inkSoft,
        'stroke-width': c.ink * 0.7,
        opacity: 0.85,
      }),
    ],
    points: [...slope, ...big, ...mid],
    top: -36.5,
  };
};

/** A torch held up at (x, y): a short haft and a two-tone flame. */
function torch(c: PropContext, x: number, y: number): Figure {
  const { pts, fill, line } = kit(c);
  const pal = c.palette;
  const haft = pts([
    [x - 1, y + 10],
    [x, y],
  ]);
  const flame = pts([
    [x, y + 0.5],
    [x - 3, y - 2],
    [x - 2, y - 6],
    [x + 0.5, y - 10],
    [x + 2.6, y - 5.5],
    [x + 3, y - 1.5],
  ]);
  const core = pts([
    [x + 0.2, y - 0.2],
    [x - 1.2, y - 2.4],
    [x + 0.3, y - 6],
    [x + 1.5, y - 2.4],
  ]);
  return {
    nodes: [
      line(poly(haft, false), 1.5, pal.ramps.bark.shade),
      fill(smoothClosed(flame), pal.accents.coral.base),
      fill(smoothClosed(core), pal.accents.ochre.light),
      line(smoothClosed(flame), 0.7, pal.accents.coral.shade),
    ],
    points: [...haft, ...flame],
    top: y - 10,
  };
}

/** Raiders: two hooded figures in red with torches held high, a warm glow at their feet. */
const raiders: FigureDraw = (c) => {
  const pal = c.palette;
  const sq = c.squash / 0.6;
  const left = hooded(c, -6, -1, pal.accents.coral);
  const right = hooded(c, 8, 1, pal.accents.rose);
  const torches = [torch(c, -13, -24), torch(c, 15, -22)];
  return {
    nodes: [
      el('path', {
        d: ellipsePath(c.origin.x, c.origin.y, 22 * c.k, 5.5 * c.k * sq),
        fill: pal.accents.ochre.light,
        opacity: 0.45,
      }),
      groundShadow(c, 18, 4, 2),
      ...torches[0]!.nodes,
      ...left.nodes,
      ...right.nodes,
      ...torches[1]!.nodes,
    ],
    points: [...left.points, ...right.points, ...torches.flatMap((t) => t.points)],
    top: Math.min(...torches.map((t) => t.top)),
  };
};

/** An unknown threat: a dark cairn of three stones. */
const cairn: FigureDraw = (c) => {
  const { fill, line, blob } = kit(c);
  const pal = c.palette;
  const stones = [blob(-5, -4, 6, 4), blob(5, -4, 5, 3.6), blob(0, -11, 4.6, 3.6)];
  return {
    nodes: [
      groundShadow(c, 12, 3),
      ...stones.flatMap((s) => [
        fill(smoothClosed(s), pal.accents.plum.shade),
        line(smoothClosed(s)),
      ]),
    ],
    points: stones.flat(),
    top: -15,
  };
};

const FIGURES: Readonly<Record<ThreatLook, FigureDraw>> = { captors, swarm, rockslide, raiders };

/** The strength marks: `n` coral diamonds in a row on a paper pill, centred above (x, y) in screen px. */
function strengthMarks(
  c: PropContext,
  n: number,
  at: Point,
): { nodes: SvgNode[]; points: Point[] } {
  const pal = c.palette;
  const count = Math.max(0, Math.min(6, Math.round(Number.isFinite(n) ? n : 0)));
  if (count === 0) return { nodes: [], points: [] };
  const step = 6.4 * c.k;
  const r = 2.5 * c.k;
  const half = ((count - 1) * step) / 2;
  const pill = { x0: at.x - half - 4.6 * c.k, x1: at.x + half + 4.6 * c.k };
  const h = 4.4 * c.k;
  const pillPath = `M${(pill.x0 + h).toFixed(1)} ${(at.y - h).toFixed(1)}H${(pill.x1 - h).toFixed(1)}A${h.toFixed(1)} ${h.toFixed(1)} 0 0 1 ${(pill.x1 - h).toFixed(1)} ${(at.y + h).toFixed(1)}H${(pill.x0 + h).toFixed(1)}A${h.toFixed(1)} ${h.toFixed(1)} 0 0 1 ${(pill.x0 + h).toFixed(1)} ${(at.y - h).toFixed(1)}Z`;
  const diamonds = Array.from({ length: count }, (_, i) => {
    const x = at.x - half + i * step;
    return poly([
      { x, y: at.y - r * 1.15 },
      { x: x + r, y: at.y },
      { x, y: at.y + r * 1.15 },
      { x: x - r, y: at.y },
    ]);
  }).join('');
  return {
    nodes: [
      el('g', { 'data-threat': 'strength' }, [
        el('path', {
          d: pillPath,
          fill: pal.paper,
          stroke: pal.ink,
          'stroke-width': c.ink * 0.8,
          opacity: 0.92,
        }),
        el('path', {
          d: diamonds,
          fill: pal.accents.coral.base,
          stroke: pal.accents.coral.shade,
          'stroke-width': c.ink * 0.8,
          'stroke-linejoin': 'round',
        }),
      ]),
    ],
    points: [
      { x: pill.x0, y: at.y - h },
      { x: pill.x1, y: at.y + h },
    ],
  };
}

/**
 * The short ground arrow from a threat's hex toward its next step: from about 0.4 to 0.9 of a hex size in
 * the neighbour's direction, on the ground plane. `hexSize` and `squash` are the map's (screen px).
 */
export function approachArrow(
  palette: Palette,
  origin: Point,
  toward: { q: number; r: number },
  hexSize: number,
  squash: number,
  ink: number,
): { nodes: SvgNode[]; points: Point[] } {
  const wx = 1.5 * toward.q;
  const wy = Math.sqrt(3) * (toward.r + toward.q / 2);
  const len = Math.hypot(wx, wy);
  if (!Number.isFinite(len) || len === 0) return { nodes: [], points: [] };
  const ux = wx / len;
  const uy = wy / len;
  const at = (d: number, side = 0): Point => ({
    x: origin.x + (ux * d - uy * side) * hexSize,
    y: origin.y + (uy * d + ux * side) * hexSize * squash,
  });
  const shaft = smoothOpen([at(0.42, 0.04), at(0.62, -0.02), at(0.8, 0)]);
  const head = poly([at(0.92, 0), at(0.76, 0.09), at(0.79, 0), at(0.76, -0.09)]);
  return {
    nodes: [
      el('g', { 'data-threat': 'arrow' }, [
        el('path', { d: shaft, ...inkAttrs(palette.paper, ink * 4.2), opacity: 0.85 }),
        el('path', { d: shaft, ...inkAttrs(palette.accents.coral.shade, ink * 2.2) }),
        el('path', {
          d: head,
          fill: palette.accents.coral.shade,
          stroke: palette.accents.coral.shade,
          'stroke-width': ink,
          'stroke-linejoin': 'round',
        }),
      ]),
    ],
    points: [at(0.42, 0.1), at(0.92, -0.1)],
  };
}

/**
 * A threat on its hex, with its stain, strength marks, pulse ring and approach arrow. `c` is at the threat's
 * scale (`ART_TUNING.threatScale` in a scene); `hexSize` is the map's hex size in screen px, for the arrow.
 */
export function drawThreat(c: PropContext, threat: ThreatArt, hexSize: number): Drawn {
  const pal = c.palette;
  const look = (THREAT_LOOKS as readonly string[]).includes(threat.look)
    ? FIGURES[threat.look as ThreatLook]
    : cairn;
  const figure = look(c);
  const sq = c.squash / 0.6;
  const stain = el('path', {
    d: ellipsePath(c.origin.x, c.origin.y + 1 * c.k, 23 * c.k, 6.5 * c.k * sq),
    fill: pal.accents.coral.light,
    opacity: 0.45,
    'data-threat': 'stain',
  });
  const pulse = threat.arrivesTomorrow
    ? [
        el('path', {
          d: ellipsePath(c.origin.x, c.origin.y + 1 * c.k, 27 * c.k, 8 * c.k * sq),
          fill: pal.accents.coral.light,
          'fill-opacity': 0.35,
          stroke: pal.accents.coral.shade,
          'stroke-width': c.ink * 1.5,
          'stroke-dasharray': `${(4 * c.k).toFixed(1)} ${(3 * c.k).toFixed(1)}`,
          'stroke-linecap': 'round',
          'data-threat': 'pulse',
        }),
      ]
    : [];
  const markAt = { x: c.origin.x, y: c.origin.y + (figure.top - 6) * c.k * c.rise };
  const marks = strengthMarks(c, threat.strength, markAt);
  // The arrow is drawn at the map's scale, not the threat's: its ink is the scene's base ink.
  const scale = hexSize > 0 ? c.k / (hexSize / ART_TUNING.hexSize) : 1;
  const arrow =
    threat.toward && hexSize > 0
      ? approachArrow(pal, c.origin, threat.toward, hexSize, c.squash, c.ink / scale)
      : { nodes: [], points: [] };
  return {
    nodes: [
      ...pulse,
      stain,
      el('g', { 'data-threat': 'figure' }, figure.nodes),
      ...arrow.nodes,
      ...marks.nodes,
    ],
    box: boxOf([
      ...figure.points,
      ...marks.points,
      ...arrow.points,
      { x: c.origin.x - 27 * c.k, y: c.origin.y + 9 * c.k * sq },
      { x: c.origin.x + 27 * c.k, y: c.origin.y - 9 * c.k * sq },
    ]),
  };
}

export interface ThreatIconOptions {
  /** Plane squash of the view it is drawn at (default 0.8, the map's). */
  readonly squash?: number;
  /** Draws the strength marks above the threat (default none). */
  readonly strength?: number;
}

/** A threat as a square, self-contained `<svg>` icon of `px` px, for its card. */
export function drawThreatIcon(
  look: string,
  palette: Palette,
  px: number,
  options: ThreatIconOptions = {},
): SvgNode {
  const size = Number.isFinite(px) && px > 0 ? px : 48;
  const squash = options.squash ?? ART_TUNING.tilt;
  const unit = 1.6;
  const drawn = drawThreat(
    {
      palette,
      rng: rngFor('threat-icon', look),
      origin: { x: 0, y: 0 },
      k: unit,
      squash,
      ink: 1.4 * unit * 0.8,
      rise: riseFor(squash),
    },
    { look, strength: options.strength ?? 0 },
    0,
  );
  return squareIcon(drawn, size);
}

/** Fits a drawing into a square `<svg>` of `size` px, centred, with a little room around it. */
export function squareIcon(drawn: Drawn, size: number, pad = 0.06): SvgNode {
  const { x0, y0, x1, y1 } = drawn.box;
  const side = Math.max(x1 - x0, y1 - y0) * (1 + pad * 2);
  const x = (x0 + x1) / 2 - side / 2;
  const y = (y0 + y1) / 2 - side / 2;
  return el(
    'svg',
    {
      viewBox: `${x.toFixed(2)} ${y.toFixed(2)} ${side.toFixed(2)} ${side.toFixed(2)}`,
      width: size,
      height: size,
    },
    drawn.nodes,
  );
}
