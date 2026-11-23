/**
 * The creature, seen from above at the map's view angle: an ancient walking hill. It is modelled as soft
 * solids (a broad body, a long neck, a large head with swept horns, thick legs, a tapering tail) in its own
 * frame, turned to its heading and projected like the ground: a point at plane position (X, Y) and height Z
 * lands at (X, Y·squash − Z·√(1 − squash²)). So one drawing serves all six hex directions, and the moss,
 * trees, rock and pond on its back face the viewer. At scale 1 the body fills its seven-hex footprint and
 * the head and tail reach past it.
 */
import { boxOf, ellipsePath, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { inkAttrs, type Drawn } from './props.ts';
import { el, type SvgNode } from './svg.ts';

export type CreatureBody = 'highback' | 'broad' | 'longneck' | 'low';

export interface CreatureLook {
  readonly id: string;
  /**
   * Its build: `highback` (the default) a high back with a moderately long neck and tail, kept mostly
   * inside its footprint; `broad` a high tortoise-like back and a strong neck; `longneck` a narrower body with a neck
   * that rises high and a long tail; `low` a wide, low, mossy mound with its head held low.
   */
  readonly body: CreatureBody;
  /** Size against its footprint: at 1 the body stays mostly inside the seven hexes. */
  readonly scale: number;
  readonly markings: 'spots' | 'none';
  readonly horns: 'swept' | 'none';
  /** What covers its back: a small landscape (moss, trees, a rock, a pond), only moss, or bare hide. */
  readonly back: 'landscape' | 'moss' | 'bare';
  readonly tail: 'tuft' | 'plain';
}

/** The first creature: tame, slow and gentle, and very large. */
export const GENTLE_AMBLER: CreatureLook = {
  id: 'gentle-ambler',
  body: 'highback',
  scale: 1,
  markings: 'spots',
  horns: 'swept',
  back: 'landscape',
  tail: 'tuft',
};

export interface CreatureArt {
  /** Centre hex of its seven-hex footprint. */
  readonly q: number;
  readonly r: number;
  /** The axial step it walks along (one of the six neighbour offsets); its head points this way. */
  readonly heading: { readonly q: number; readonly r: number };
  /** How much the team stores hold (in units); drawn as crates on its back when above 0. */
  readonly stores?: number;
  /** Guardians defending it today: a ring and that many shields mark it (default: the characters marked defending). */
  readonly defenders?: number;
  readonly look: CreatureLook;
  /** Its appetite sign, as the viewer sees it (core `signs.appetite`, with `faint` for non-keepers). */
  readonly appetite?: CreatureAppetite | null;
  /** `lying` while it lingers. */
  readonly pose?: CreaturePose;
  /** The day's reaction cues (core `signs.cues`): each fire's hex and how the creature felt about it. */
  readonly cues?: readonly {
    readonly hex: { readonly q: number; readonly r: number };
    readonly reaction: CueReaction;
  }[];
}

export type AppetiteKind = 'underfed' | 'overfed';

/**
 * An appetite sign. Underfed: the head and tail droop, the hide and moss go dull, ribs show (one per
 * level). Overfed: the body grows rounder and sags, the eyes grow heavy, and doze bubbles rise (one per
 * level). `faint` is what non-keepers see: the same sign at half strength, in lighter ink.
 */
export interface CreatureAppetite {
  readonly kind: AppetiteKind;
  readonly level: 1 | 2 | 3;
  readonly faint?: boolean;
}

export type CreaturePose = 'standing' | 'lying';

/** How the creature felt about a fire: drawn to it, shying from it, or not caring. */
export type CueReaction = 'toward' | 'away' | 'unmoved';

export interface CreatureCue {
  readonly reaction: CueReaction;
  /** The fire's hex minus the creature's centre hex (axial); only its direction matters. */
  readonly offset: { readonly q: number; readonly r: number };
}

/** The creature's state on the day: appetite, pose and reaction cues. All optional. */
export interface CreatureMood {
  readonly appetite?: CreatureAppetite | null;
  readonly pose?: CreaturePose;
  readonly cues?: readonly CreatureCue[];
}

/** The mood a scene draws for a creature: its cues' hexes turned into offsets from its centre. */
export function moodOf(creature: CreatureArt): CreatureMood {
  return {
    appetite: creature.appetite ?? null,
    pose: creature.pose ?? 'standing',
    cues: (creature.cues ?? []).map((c) => ({
      reaction: c.reaction,
      offset: { q: c.hex.q - creature.q, r: c.hex.r - creature.r },
    })),
  };
}

/** How strongly the appetite shows (0 to 1 for each kind), and how many marks to draw. */
function appetiteShow(mood: CreatureMood): {
  under: number;
  over: number;
  marks: number;
  faint: boolean;
} {
  const a = mood.appetite;
  if (!a || (a.kind !== 'underfed' && a.kind !== 'overfed'))
    return { under: 0, over: 0, marks: 0, faint: false };
  const level = Number.isFinite(a.level) ? Math.min(3, Math.max(1, Math.round(a.level))) : 1;
  const faint = a.faint === true;
  // Each level a clear step; faint shows the level-1 strength of the same sign.
  const step = APPETITE_STEPS[level - 1]!;
  const s = faint ? Math.max(APPETITE_STEPS[0], step * FAINT_SHARE) : step;
  return {
    under: a.kind === 'underfed' ? s : 0,
    over: a.kind === 'overfed' ? s : 0,
    marks: level,
    faint,
  };
}

/** How strongly each appetite level shows, from level 1 to 3. */
const APPETITE_STEPS = [0.5, 0.75, 1] as const;
/** Faint (non-keepers): this share of the level's strength, never below level 1's. */
const FAINT_SHARE = 0.75;

/** The body cut: the body ellipsoid is drawn down to this angle below its equator; legs show beneath. */
const BODY_CUT = -0.25;

/** A build reshaped by the mood: thinner and drooping when underfed, rounder when overfed, low when lying. */
function shapeBuild(base: Build, mood: CreatureMood): Build {
  const { under, over } = appetiteShow(mood);
  // Underfed: a narrow, low, sunken body on thin legs, the moss shrunk back. Overfed: a wide, bulging body.
  let body: Solid = {
    ...base.body,
    a: base.body.a * (1 - 0.08 * under + 0.18 * over),
    b: base.body.b * (1 - 0.38 * under + 0.5 * over),
    c: base.body.c * (1 - 0.3 * under + 0.18 * over),
    z: base.body.z - 0.08 * under - 0.12 * over,
  };
  let head: Solid = {
    ...base.head,
    u: base.head.u - 0.15 * under,
    z: base.head.z - 0.62 * under - 0.08 * over,
  };
  const legRadius = base.legRadius * (1 - 0.45 * under + 0.25 * over);
  const legSpread: Build['legSpread'] = [
    base.legSpread[0],
    base.legSpread[1] * (1 - 0.2 * under + 0.25 * over),
  ];
  const mossUp = Math.min(0.94, base.mossUp + 0.4 * under);
  const [n0, n1] = base.neck;
  let neck: Build['neck'] = [
    [n0[0], n0[1] - 0.08 * over, n0[2]],
    [n1[0] - 0.15 * under, n1[1] - 0.6 * under - 0.08 * over, n1[2] * (1 - 0.15 * under)],
  ];
  const [t0, t1] = base.tail;
  let tail: Build['tail'] = [
    [t0[0], t0[1] - 0.1 * under, t0[2]],
    [t1[0], Math.max(0.06, t1[1] - 0.18 * under), t1[2]],
  ];
  if (mood.pose === 'lying') {
    // Flatten the body and lower everything until it rests on the ground; the head comes down to rest low.
    body = { ...body, a: body.a * 1.06, b: body.b * 1.12, c: body.c * 0.68 };
    const drop = Math.max(0, body.z + body.c * Math.sin(BODY_CUT) + 0.02);
    body = { ...body, z: body.z - drop };
    const headZ = Math.max(head.c + 0.06, head.z - drop - 0.3);
    head = { ...head, z: headZ, u: head.u - 0.08 };
    neck = [
      [neck[0][0], neck[0][1] - drop, neck[0][2]],
      [neck[1][0] - 0.08, headZ + 0.02, neck[1][2]],
    ];
    tail = [
      [tail[0][0], Math.max(0.1, tail[0][1] - drop), tail[0][2]],
      [tail[1][0], 0.05, tail[1][2]],
    ];
  }
  return { ...base, body, head, neck, tail, legRadius, legSpread, mossUp };
}

interface V3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** An ellipsoid in the creature frame: centre (u, v, z), semi-axes a (forward), b (across), c (up). */
interface Solid {
  readonly u: number;
  readonly v: number;
  readonly z: number;
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

interface Build {
  readonly body: Solid;
  readonly legRadius: number;
  readonly legSpread: readonly [number, number];
  /** Neck from the shoulder to the head: start, end and radii (u, z, radius). */
  readonly neck: readonly [readonly [number, number, number], readonly [number, number, number]];
  readonly head: Solid;
  readonly tail: readonly [readonly [number, number, number], readonly [number, number, number]];
  readonly trees: number;
  /** How far down the back the moss reaches: the least upward tilt of the surface it covers. */
  readonly mossUp: number;
}

/** The three builds, in hex sizes at scale 1. */
const BUILDS: Readonly<Record<CreatureBody, Build>> = {
  highback: {
    body: { u: -0.1, v: 0, z: 0.72, a: 1.3, b: 1.08, c: 0.9 },
    legRadius: 0.34,
    legSpread: [0.78, 0.66],
    neck: [
      [1.05, 0.95, 0.4],
      [1.75, 1.2, 0.28],
    ],
    head: { u: 2.0, v: 0, z: 1.22, a: 0.36, b: 0.31, c: 0.27 },
    tail: [
      [-1.2, 0.72, 0.32],
      [-2.3, 0.22, 0.08],
    ],
    trees: 3,
    mossUp: 0.55,
  },
  broad: {
    body: { u: 0, v: 0, z: 1.0, a: 2.0, b: 1.75, c: 1.4 },
    legRadius: 0.56,
    legSpread: [1.1, 1.0],
    neck: [
      [1.82, 1.5, 0.62],
      [2.5, 1.85, 0.44],
    ],
    head: { u: 2.98, v: 0, z: 1.92, a: 0.62, b: 0.54, c: 0.46 },
    tail: [
      [-1.75, 1.05, 0.5],
      [-2.8, 0.3, 0.14],
    ],
    trees: 3,
    mossUp: 0.58,
  },
  longneck: {
    body: { u: -0.15, v: 0, z: 1.2, a: 1.85, b: 1.3, c: 1.1 },
    legRadius: 0.46,
    legSpread: [1.05, 0.82],
    neck: [
      [1.62, 1.8, 0.5],
      [2.75, 3.0, 0.3],
    ],
    head: { u: 3.1, v: 0, z: 3.15, a: 0.54, b: 0.42, c: 0.38 },
    tail: [
      [-1.7, 1.25, 0.46],
      [-3.6, 0.3, 0.09],
    ],
    trees: 2,
    mossUp: 0.62,
  },
  low: {
    body: { u: 0, v: 0, z: 0.75, a: 2.2, b: 1.95, c: 1.0 },
    legRadius: 0.58,
    legSpread: [1.3, 1.22],
    neck: [
      [2.02, 0.98, 0.56],
      [2.5, 1.0, 0.48],
    ],
    head: { u: 2.92, v: 0, z: 1.05, a: 0.6, b: 0.56, c: 0.42 },
    tail: [
      [-2.0, 0.75, 0.42],
      [-2.75, 0.3, 0.16],
    ],
    trees: 3,
    mossUp: 0.35,
  },
};

/** Convex hull (monotone chain). */
function hull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Drops points closer than `min` to the previous one, so smoothed outlines stay calm. */
function thin(points: readonly Point[], min: number): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= min) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 3 && first && last && Math.hypot(first.x - last.x, first.y - last.y) < min)
    out.pop();
  return out;
}

/** Pulls each point towards the centroid by a calm, repeatable wobble: a lumpy edge for moss. */
function lumpy(points: readonly Point[], amount: number, phase: number): Point[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / Math.max(1, points.length);
  const cy = points.reduce((s, p) => s + p.y, 0) / Math.max(1, points.length);
  return points.map((p, i) => {
    const f =
      1 - amount * (0.5 + 0.5 * Math.sin(i * 2.4 + phase) * Math.cos(i * 0.9 + phase * 0.5));
    return { x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f };
  });
}

/** A unit vector along an axial step, on the ground plane (x east, y south). */
function planeDirection(step: { q: number; r: number }): { x: number; y: number } {
  const x = 1.5 * step.q;
  const y = Math.sqrt(3) * (step.r + step.q / 2);
  const len = Math.hypot(x, y);
  // A step that is zero or not a number faces north.
  if (!Number.isFinite(len) || len <= 0) return { x: 0, y: -1 };
  return { x: x / len, y: y / len };
}

const fmt = (n: number): string => (Math.round(n * 10) / 10).toString();

/** The creature's frame turned to its heading and projected: shared by the drawing and the rider anchors. */
function creatureFrame(
  look: CreatureLook,
  heading: { q: number; r: number },
  origin: Point,
  size: number,
  squash: number,
  mood: CreatureMood = {},
) {
  const build = shapeBuild(BUILDS[look.body] ?? BUILDS.highback, mood);
  const S = Number.isFinite(look.scale) && look.scale > 0 ? look.scale : 1;
  const t = Number.isFinite(squash) ? Math.min(1, Math.max(0.2, squash)) : 0.8;
  const rise = Math.sqrt(Math.max(0, 1 - t * t));
  const fwd = planeDirection(heading);
  const right = { x: -fwd.y, y: fwd.x };
  const world = (u: number, v: number, z: number): V3 => ({
    x: (u * fwd.x + v * right.x) * S,
    y: (u * fwd.y + v * right.y) * S,
    z: z * S,
  });
  const screen = (p: V3): Point => ({
    x: origin.x + p.x * size,
    y: origin.y + (p.y * t - p.z * rise) * size,
  });
  const body = build.body;
  /** A point on top of the back, at (fu, fv) as shares of the body's half-length and half-width. */
  const back = (fu: number, fv: number): V3 => {
    const u = body.u + fu * body.a;
    const v = fv * body.b;
    const k = 1 - fu * fu - fv * fv;
    return world(u, v, body.z + body.c * Math.sqrt(Math.max(0, k)));
  };
  return { build, S, t, rise, fwd, right, world, screen, back };
}

/**
 * Where riders stand on the back, as shares of the body's half-length and half-width: the middle first,
 * then a ring of six, then a wider ring of eight (fifteen in all, the player cap). The landscape on the
 * back stays out at the rim, clear of these.
 */
export function riderSlot(index: number): { fu: number; fv: number } {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) % 15 : 0;
  if (i === 0) return { fu: 0, fv: 0 };
  if (i <= 6) {
    const a = ((i - 1) * Math.PI) / 3 + Math.PI / 6;
    return { fu: Math.cos(a) * 0.3, fv: Math.sin(a) * 0.34 };
  }
  const a = ((i - 7) * Math.PI) / 4;
  return { fu: Math.cos(a) * 0.62, fv: Math.sin(a) * 0.66 };
}

/** The feet of the rider in slot `index` on the creature's back, in drawing coordinates. */
export function riderAnchor(
  look: CreatureLook,
  heading: { q: number; r: number },
  index: number,
  origin: Point,
  size: number,
  squash: number,
  /** The creature's mood: lying or a changed appetite moves its back. */
  mood: CreatureMood = {},
): Point {
  const f = creatureFrame(look, heading, origin, size, squash, mood);
  const { fu, fv } = riderSlot(index);
  // Shift the slots towards the viewer (world south), where the back is seen best from the high view.
  const bias = 0.28;
  return f.screen(f.back(fu + bias * f.fwd.y, fv + bias * f.right.y));
}

export function drawCreature(
  palette: Palette,
  look: CreatureLook,
  origin: Point,
  size: number,
  squash: number,
  ink: number,
  heading: { q: number; r: number },
  /** How much the team stores hold (in units): drawn as up to three crates on the back. */
  stores = 0,
  /** Appetite sign, pose and reaction cues. */
  mood: CreatureMood = {},
): Drawn & { readonly silhouettes: readonly (readonly Point[])[] } {
  // Creature frame (u forward, v to its right, z up; hex sizes at scale 1) to the world, then the screen.
  const frame = creatureFrame(look, heading, origin, size, squash, mood);
  const { build, S, t, rise, world, screen, fwd, right } = frame;
  const show = appetiteShow(mood);
  const lying = mood.pose === 'lying';
  const cues = (mood.cues ?? []).flatMap((cue) => {
    const x = 1.5 * cue.offset.q;
    const y = Math.sqrt(3) * (cue.offset.r + cue.offset.q / 2);
    const fu = x * fwd.x + y * fwd.y;
    const fv = x * right.x + y * right.y;
    const len = Math.hypot(fu, fv);
    if (!Number.isFinite(len) || len <= 0) return [];
    return [{ reaction: cue.reaction, u: fu / len, v: fv / len, angle: Math.atan2(fv, fu) }];
  });
  // The head turns to the first fire it is drawn to; failing that, away from the first it shies from.
  const lure = cues.find((c) => c.reaction === 'toward');
  const fear = cues.find((c) => c.reaction === 'away');
  const yaw = lure
    ? Math.max(-1.1, Math.min(1.1, lure.angle)) * 0.75
    : fear
      ? -(Math.sign(fear.angle) || 1) * 0.45
      : 0;
  const unit = size * S;
  const at = (u: number, v: number, z: number): Point => screen(world(u, v, z));
  // Faces the viewer: the view direction is (0, rise, t) in world terms (south and up).
  const faces = (n: V3): boolean => n.y * rise + n.z * t > 0.05;

  const hide = palette.ramps.hide;
  const moss = palette.ramps.moss;
  const w = ink * 1.15;
  const line = (d: string, width = w, colour = palette.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, width) });
  const fill = (d: string, colour: string, opacity = 1): SvgNode =>
    el('path', opacity === 1 ? { d, fill: colour } : { d, fill: colour, opacity });
  const everything: Point[] = [];
  /** The outline of every solid part, for measuring what the creature covers. */
  const silhouettes: Point[][] = [];
  const minGap = unit * 0.05;

  const surface = (s: Solid, theta: number, phi: number): { p: V3; n: V3 } => {
    const cu = Math.cos(phi) * Math.cos(theta);
    const cv = Math.cos(phi) * Math.sin(theta);
    const cz = Math.sin(phi);
    const p = world(s.u + s.a * cu, s.v + s.b * cv, s.z + s.c * cz);
    const nl = world(cu / s.a, cv / s.b, 0);
    const n = { x: nl.x, y: nl.y, z: (cz / s.c) * S };
    const len = Math.hypot(n.x, n.y, n.z) || 1;
    return { p, n: { x: n.x / len, y: n.y / len, z: n.z / len } };
  };
  const outline = (s: Solid, minPhi = -Math.PI / 2): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < 32; i += 1) {
      for (let j = 0; j <= 8; j += 1) {
        pts.push(
          screen(surface(s, (Math.PI * 2 * i) / 32, minPhi + ((Math.PI / 2 - minPhi) * j) / 8).p),
        );
      }
    }
    const h = thin(hull(pts), minGap);
    everything.push(...h);
    silhouettes.push(h);
    return h;
  };
  /** Surface points of a solid whose normal points up at least `minUp`, as a hull. */
  const cap = (s: Solid, minUp: number): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < 32; i += 1) {
      for (let j = 0; j <= 12; j += 1) {
        const { p, n } = surface(s, (Math.PI * 2 * i) / 32, (Math.PI / 2) * (j / 12));
        if (n.z >= minUp) pts.push(screen(p));
      }
    }
    return thin(hull(pts), minGap);
  };
  /** A round patch lying on a solid's surface around (theta, phi), if it faces the viewer. */
  const patch = (s: Solid, theta: number, phi: number, r: number): string => {
    if (!faces(surface(s, theta, phi).n)) return '';
    const pts: Point[] = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI * 2 * i) / 8;
      pts.push(
        screen(
          surface(
            s,
            theta + (Math.cos(a) * r) / Math.max(0.25, Math.cos(phi)),
            phi + Math.sin(a) * r,
          ).p,
        ),
      );
    }
    return smoothClosed(pts);
  };
  /** A tapered tube between two points (u, z, radius) along the creature's midline, as a hull. */
  const tube = (
    from: readonly [number, number, number],
    to: readonly [number, number, number],
    /** How far the far end sits to the creature's right (a turned head pulls the neck along). */
    toV = 0,
  ): Point[] => {
    const pts: Point[] = [];
    for (let k = 0; k <= 6; k += 1) {
      const f = k / 6;
      const u = from[0] + (to[0] - from[0]) * f;
      const z = from[1] + (to[1] - from[1]) * f;
      const r = from[2] + (to[2] - from[2]) * f;
      const v = toV * f * f;
      for (let i = 0; i < 16; i += 1) {
        const a = (Math.PI * 2 * i) / 16;
        pts.push(at(u, v + Math.cos(a) * r, z + Math.sin(a) * r));
      }
    }
    const h = thin(hull(pts), minGap);
    everything.push(...h);
    silhouettes.push(h);
    return h;
  };

  type Piece = { depth: number; nodes: SvgNode[] };
  const pieces: Piece[] = [];
  // Painter's depth: plane y (south is nearer); a hair of forward bias so body, neck and head stack in order.
  const depthAt = (u: number, v: number): number => world(u, v, 0).y + u * 0.002;

  const body = build.body;
  // The head turns about the neck's end: its centre swings round, and its parts turn with it.
  const pivot = build.neck[1][0];
  const reach = build.head.u - pivot;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const head: Solid = { ...build.head, u: pivot + reach * cy, v: reach * sy };
  /** A point on the head, `du` forward and `dv` to the right of its centre, in the head's own turned frame. */
  const hp = (du: number, dv: number, z: number): V3 =>
    world(head.u + du * cy - dv * sy, head.v + du * sy + dv * cy, z);

  // Shadow on the ground: tighter and darker when it lies down.
  const shadow = Array.from({ length: 20 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 20;
    const grow = lying ? [0.75, 0.6] : [0.5, 0.3];
    return at(body.u + Math.cos(a) * (body.a + grow[0]!), Math.sin(a) * (body.b + grow[1]!), 0);
  });
  pieces.push({
    depth: -1e6,
    nodes: [fill(smoothClosed(shadow), palette.shadow, lying ? 0.34 : 0.2)],
  });
  // Appetite aura: a wash on the ground around it that reads at a glance, cool grey when underfed, warm
  // when overfed.
  if (show.under > 0 || show.over > 0) {
    const ramp = show.under > 0 ? palette.accents.slate : palette.accents.ochre;
    const strength = Math.max(show.under, show.over);
    const ring = (grow: number): string =>
      smoothClosed(
        Array.from({ length: 24 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 24;
          const wob = 1 + 0.05 * Math.sin(i * 2.7);
          return at(
            body.u + Math.cos(a) * (body.a + grow) * wob,
            Math.sin(a) * (body.b + grow) * wob,
            0,
          );
        }),
      );
    pieces.push({
      depth: -2e6,
      nodes: [
        el('path', {
          d: ring(1.15),
          fill: ramp.light,
          opacity: 0.35 + 0.35 * strength,
          'data-sign': 'aura',
        }),
        el('path', {
          d: ring(0.85),
          fill: ramp.base,
          opacity: 0.2 + 0.3 * strength,
          'data-sign': 'aura',
        }),
      ],
    });
  }

  // Legs: thick columns under the body with mossy feet; the body hides their tops.
  const legTop = body.z;
  const legs: Piece[] = [];
  for (const [su, sv] of (lying
    ? []
    : [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) as readonly (readonly [number, number])[]) {
    const u = body.u + su * build.legSpread[0];
    const v = sv * build.legSpread[1];
    const r = build.legRadius;
    const pts: Point[] = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (Math.PI * 2 * i) / 16;
      pts.push(
        at(u + Math.cos(a) * r * 1.05, v + Math.sin(a) * r * 1.05, 0),
        at(u + Math.cos(a) * r, v + Math.sin(a) * r, legTop),
      );
    }
    const h = thin(hull(pts), minGap);
    everything.push(...h);
    silhouettes.push(h);
    const tufts: string[] = [];
    const centreY = world(u, v, 0).y;
    for (let i = 0; i < 12; i += 1) {
      const a = (Math.PI * 2 * i) / 12;
      const fu = u + Math.cos(a) * r * 1.06;
      const fv = v + Math.sin(a) * r * 1.06;
      // Only the side of the foot that faces the viewer shows its moss.
      if (world(fu, fv, 0).y <= centreY) continue;
      const q = at(fu, fv, 0.05);
      tufts.push(ellipsePath(q.x, q.y, unit * 0.075, unit * 0.05));
    }
    legs.push({
      depth: -1e5 + depthAt(u, v),
      nodes: [
        fill(smoothClosed(h), hide.shade),
        line(smoothClosed(h)),
        fill(tufts.join(''), moss.base, 0.9),
      ],
    });
  }
  pieces.push(...legs);
  if (lying) {
    // Legs tucked under the body: only the two front paws peek out on the ground.
    for (const side of [1, -1]) {
      const paw: Solid = {
        u: body.u + body.a * 0.98,
        v: side * build.legSpread[1] * 0.9,
        z: 0.06,
        a: build.legRadius * 0.62,
        b: build.legRadius * 0.44,
        c: build.legRadius * 0.3,
      };
      const pawOutline = outline(paw);
      const toes = [-1, 0, 1].map((k) => {
        const q = at(paw.u + paw.a * 0.85, paw.v + k * paw.b * 0.45, paw.z + paw.c * 0.4);
        return ellipsePath(q.x, q.y, unit * 0.03, unit * 0.022);
      });
      pieces.push({
        depth: depthAt(paw.u, paw.v),
        nodes: [
          fill(smoothClosed(pawOutline), hide.base),
          line(smoothClosed(pawOutline), w * 0.9),
          line(toes.join(''), w * 0.6, palette.inkSoft),
        ],
      });
    }
  }

  // Tail: a tapering tube, with a tuft at its tip.
  const tailOutline = tube(build.tail[0], build.tail[1]);
  const tailNodes = [fill(smoothClosed(tailOutline), hide.base), line(smoothClosed(tailOutline))];
  if (look.tail === 'tuft') {
    const tip = at(build.tail[1][0] - 0.05, 0, build.tail[1][1]);
    const tuft = ellipsePath(tip.x, tip.y, unit * 0.16, unit * 0.13);
    tailNodes.push(fill(tuft, moss.shade), line(tuft, w * 0.9));
  }
  // The tail hangs low, so the body always covers its root.
  pieces.push({ depth: -5e4, nodes: tailNodes });

  // Body: shaded rim, lit back, spots on the flanks, a moss blanket, and the landscape on top.
  const bodyOutline = outline(body, BODY_CUT);
  const bodyNodes: SvgNode[] = [
    fill(smoothClosed(bodyOutline), hide.shade),
    fill(smoothClosed(cap(body, 0.3)), hide.base),
  ];
  if (look.markings === 'spots') {
    const spots: [number, number, number][] = [
      [0.5, 0.35, 0.1],
      [1.2, 0.3, 0.08],
      [2.2, 0.32, 0.09],
      [2.9, 0.38, 0.08],
      [3.6, 0.3, 0.1],
      [4.4, 0.34, 0.08],
      [5.1, 0.3, 0.09],
      [5.8, 0.36, 0.08],
    ];
    bodyNodes.push(
      fill(spots.map(([th, ph, r]) => patch(body, th, ph, r)).join(''), palette.marking, 0.6),
    );
  }
  const top = (u: number, v: number): V3 => {
    const k = 1 - ((u - body.u) / body.a) ** 2 - ((v - body.v) / body.b) ** 2;
    return world(u, v, body.z + body.c * Math.sqrt(Math.max(0, k)));
  };
  if (look.back !== 'bare') {
    const mossCap = lumpy(cap(body, build.mossUp), 0.16, 1.3);
    // A darker moss edge shows the blanket's thickness; light on the upper left rounds the back.
    const mossEdge = mossCap.map((p) => ({ x: p.x + unit * 0.03, y: p.y + unit * 0.07 }));
    bodyNodes.push(
      fill(smoothClosed(mossEdge), moss.shade, 0.85),
      fill(smoothClosed(mossCap), moss.base),
    );
    const crown = cap(body, 0.86).map((p) => ({ x: p.x - unit * 0.35, y: p.y - unit * 0.18 }));
    if (crown.length > 2)
      bodyNodes.push(fill(smoothClosed(lumpy(crown, 0.12, 2.1)), moss.light, 0.75));
    const lee = cap(body, 0.7).map((p) => ({ x: p.x + unit * 0.45, y: p.y + unit * 0.22 }));
    if (lee.length > 2) bodyNodes.push(fill(smoothClosed(lumpy(lee, 0.2, 0.4)), moss.shade, 0.3));
    // Moss texture: darker hollows and light tufts, laid on the back.
    const dark: string[] = [];
    const light: string[] = [];
    const spots = [
      [0.9, 0.4],
      [0.2, -0.7],
      [-0.6, 0.6],
      [-1.1, -0.2],
      [0.5, 0.9],
      [1.2, -0.5],
      [-0.3, -0.1],
      [0.1, 0.35],
      [-0.9, 0.9],
      [0.7, -1.0],
    ] as const;
    spots.forEach(([fu, fv], i) => {
      const p = screen(top(body.u + fu * body.a * 0.6, fv * body.b * 0.6));
      const r = unit * (i % 3 === 0 ? 0.14 : 0.09);
      (i % 2 ? light : dark).push(ellipsePath(p.x, p.y, r, r * t));
    });
    bodyNodes.push(fill(dark.join(''), moss.shade, 0.55), fill(light.join(''), moss.light, 0.7));
  }
  // Appetite on the body. Underfed: a dull grey wash over hide and moss, and ribs on the flank facing the
  // viewer, one per level. Overfed: a round sheen low on the near flank.
  const signInk = show.faint ? palette.inkSoft : palette.ink;
  if (show.under > 0) {
    bodyNodes.push(fill(smoothClosed(bodyOutline), palette.accents.slate.base, 0.75 * show.under));
    const ribs: string[] = [];
    for (const side of [1, -1]) {
      if (!faces(surface(body, side * (Math.PI / 2), 0.1).n)) continue;
      for (let i = 0; i < show.marks; i += 1) {
        const th = side * (Math.PI / 2 + (i - (show.marks - 1) / 2) * 0.32);
        ribs.push(
          smoothOpen([-0.2, 0.08, 0.36, 0.55].map((ph) => screen(surface(body, th, ph).p))),
        );
      }
    }
    if (ribs.length)
      bodyNodes.push(
        el('path', {
          d: ribs.join(''),
          ...inkAttrs(signInk, w * 1.8),
          'data-sign': 'ribs',
        }),
      );
  }
  if (show.over > 0) {
    const sheen = [1, -1]
      .map((side) => patch(body, side * (Math.PI / 2), -0.02, 0.22 + 0.2 * show.over))
      .join('');
    if (sheen) bodyNodes.push(fill(sheen, hide.light, 0.35 + 0.4 * show.over));
  }
  bodyNodes.push(line(smoothClosed(bodyOutline)));

  if (look.back === 'landscape') {
    // A tiny pond and a rock lying on the back.
    const pondAt = screen(frame.back(-0.62, 0.42));
    const pond = ellipsePath(pondAt.x, pondAt.y, unit * 0.32, unit * 0.32 * t * 0.75);
    bodyNodes.push(
      fill(pond, palette.ramps.water.base),
      fill(
        ellipsePath(pondAt.x - unit * 0.06, pondAt.y - unit * 0.03, unit * 0.16, unit * 0.06),
        palette.ramps.water.light,
        0.9,
      ),
      line(pond, w * 0.85),
    );
    const rockAt = screen(frame.back(0.2, 0.74));
    const rk = unit / 64;
    const rock = [
      { x: -11, y: 2 },
      { x: -9, y: -6 },
      { x: -2, y: -10 },
      { x: 6, y: -8 },
      { x: 11, y: -1 },
      { x: 10, y: 3 },
    ].map((p) => ({ x: rockAt.x + p.x * rk, y: rockAt.y + p.y * rk * rise * 1.4 }));
    bodyNodes.push(
      fill(poly(rock), palette.ramps.rock.light),
      fill(
        poly([
          rock[2]!,
          rock[3]!,
          rock[4]!,
          rock[5]!,
          { x: rockAt.x + 1 * rk, y: rockAt.y + 2 * rk },
        ]),
        palette.ramps.rock.shade,
        0.55,
      ),
      line(poly(rock), w * 0.9),
    );
    // Trees standing upright on the back, back to front.
    const treeSpots: [number, number, number][] = [
      [0.42, -0.6, 1],
      [-0.55, -0.5, 0.85],
      [0.7, 0.32, 0.7],
    ].slice(0, build.trees) as [number, number, number][];
    const trees = treeSpots
      .map(([fu, fv, hgt]) => ({ base: screen(frame.back(fu, fv)), hgt }))
      .sort((a, b) => a.base.y - b.base.y);
    for (const { base, hgt } of trees) {
      const k = (unit / 64) * 0.95 * hgt;
      const trunkTop = { x: base.x, y: base.y - 20 * k * rise };
      const lobe = (dx: number, dy: number, r: number): string =>
        smoothClosed(
          Array.from({ length: 8 }, (_, i) => {
            const a = (Math.PI * 2 * i) / 8;
            const f = 1 + (i % 2 ? -0.08 : 0.06);
            return {
              x: trunkTop.x + (dx + Math.cos(a) * r * f) * k,
              y: trunkTop.y + (dy + Math.sin(a) * r * 0.9 * f) * k,
            };
          }),
        );
      const lobes = [lobe(-7, -3, 9), lobe(7, -3, 9), lobe(0, -12, 10)];
      everything.push({ x: trunkTop.x, y: trunkTop.y - 24 * k });
      silhouettes.push([
        { x: trunkTop.x - 16 * k, y: trunkTop.y - 22 * k },
        { x: trunkTop.x + 16 * k, y: trunkTop.y - 22 * k },
        { x: trunkTop.x + 16 * k, y: base.y },
        { x: trunkTop.x - 16 * k, y: base.y },
      ]);
      bodyNodes.push(
        fill(ellipsePath(base.x + 3 * k, base.y + 1 * k, 14 * k, 5 * k), palette.shadow, 0.22),
        line(
          `M${fmt(base.x)} ${fmt(base.y)}L${fmt(trunkTop.x)} ${fmt(trunkTop.y)}`,
          w * 2.2,
          palette.ramps.bark.shade,
        ),
        ...lobes.map((d) => fill(d, palette.ramps.foliage.base)),
        fill(lobe(-2, -14, 4.5), palette.ramps.foliage.light, 0.85),
        line(lobes.join(''), w * 0.9),
      );
    }
    // Grass tufts and two flowers.
    const blades: string[] = [];
    for (const [fu, fv] of [
      [0.75, -0.45],
      [-0.75, 0.45],
      [0.3, 0.6],
      [-0.2, -0.75],
    ] as const) {
      const b = screen(top(body.u + fu * body.a * 0.8, fv * body.b * 0.8));
      const k = unit / 64;
      for (let i = -1; i <= 1; i += 1) {
        blades.push(
          smoothOpen([
            b,
            { x: b.x + i * 2 * k, y: b.y - 4 * k },
            { x: b.x + i * 3.6 * k, y: b.y - 7 * k },
          ]),
        );
      }
    }
    const f1 = screen(top(body.u + body.a * 0.5, -body.b * 0.25));
    const f2 = screen(top(body.u - body.a * 0.1, body.b * 0.55));
    bodyNodes.push(
      line(blades.join(''), w * 0.7, palette.inkSoft),
      fill(ellipsePath(f1.x, f1.y, unit * 0.04, unit * 0.035), palette.accents.rose.base),
      fill(ellipsePath(f2.x, f2.y, unit * 0.035, unit * 0.03), palette.accents.ochre.base),
    );
  }
  // The team stores: crates lashed near the tail, clear of the riders' slots; one more per few units held.
  const crates =
    Number.isFinite(stores) && stores > 0 ? Math.min(3, 1 + Math.floor((stores - 1) / 4)) : 0;
  const crateSpots: [number, number][] = [
    [-0.78, -0.22],
    [-0.78, 0.26],
    [-0.62, 0.02],
  ];
  const placedCrates = crateSpots
    .slice(0, crates)
    .map(([fu, fv]) => screen(frame.back(fu, fv)))
    .sort((a, b) => a.y - b.y);
  for (const base of placedCrates) {
    const k = unit / 64;
    const cw = 7 * k;
    const h = 7 * k * rise * 1.2;
    const front = `M${fmt(base.x - cw)} ${fmt(base.y)}h${fmt(2 * cw)}v${fmt(-h)}h${fmt(-2 * cw)}z`;
    const lid = `M${fmt(base.x - cw)} ${fmt(base.y - h)}l${fmt(2.5 * k)} ${fmt(-3 * k * t)}h${fmt(2 * cw)}l${fmt(-2.5 * k)} ${fmt(3 * k * t)}z`;
    everything.push(
      { x: base.x - cw, y: base.y - h - 3 * k },
      { x: base.x + cw + 2.5 * k, y: base.y },
    );
    bodyNodes.push(
      fill(
        ellipsePath(base.x + 1.5 * k, base.y + 0.5 * k, cw * 1.2, 2.2 * k),
        palette.shadow,
        0.22,
      ),
      fill(front, palette.ramps.bark.light),
      fill(lid, palette.ramps.bark.base),
      line(front + lid, w * 0.8),
      line(
        `M${fmt(base.x - cw)} ${fmt(base.y - h)}L${fmt(base.x + cw)} ${fmt(base.y)}`,
        0.9,
        palette.ramps.bark.shade,
      ),
    );
  }
  pieces.push({ depth: depthAt(body.u, 0), nodes: bodyNodes });

  // Neck: a strong tapering tube from the shoulder to the head.
  const neckOutline = tube(build.neck[0], build.neck[1], head.v * 0.5);
  pieces.push({
    depth: depthAt((build.neck[0][0] + build.neck[1][0]) / 2, 0),
    nodes: [
      fill(smoothClosed(neckOutline), hide.base),
      line(
        smoothOpen(
          [0, 0.5, 1].map((f) => {
            const [u0, z0, r0] = build.neck[0];
            const [u1, z1, r1] = build.neck[1];
            const r = r0 + (r1 - r0) * f;
            return at(
              u0 + (u1 - u0) * f,
              head.v * 0.5 * f * f - r * 0.3,
              z0 + (z1 - z0) * f + r * 0.7,
            );
          }),
        ),
        unit * build.neck[1][2] * 0.35,
        hide.light,
      ),
      line(smoothClosed(neckOutline)),
    ],
  });

  // Head: large and calm, a pale muzzle, closed eyes, a blush; swept horns and small ears.
  const snout: Solid = {
    u: head.u + head.a * 0.75 * cy,
    v: head.v + head.a * 0.75 * sy,
    z: head.z - head.c * 0.3,
    a: head.a * 0.45,
    b: head.b * 0.6,
    c: head.c * 0.5,
  };
  const headOutline = outline(head);
  const headCore: SvgNode[] = [
    fill(smoothClosed(headOutline), hide.base),
    fill(smoothClosed(cap({ ...head, a: head.a * 0.6, b: head.b * 0.55 }, 0.55)), hide.light, 0.7),
    line(smoothClosed(headOutline)),
  ];
  const face: string[] = [];
  const blush: string[] = [];
  const lids: string[] = [];
  for (const side of [1, -1]) {
    const th = side * 0.75 + yaw;
    if (faces(surface(head, th, 0.3).n)) {
      const a = screen(surface(head, th - 0.2 * side, 0.32).p);
      const m = screen(surface(head, th, 0.22).p);
      const b = screen(surface(head, th + 0.2 * side, 0.32).p);
      if (show.over > 0) {
        // Drowsy: a heavy lid over a flat, half-shut eye.
        const lidTop = screen(surface(head, th, 0.42).p);
        const flat = screen(surface(head, th, 0.27).p);
        lids.push(smoothClosed([a, lidTop, b, flat]));
        face.push(smoothOpen([a, flat, b]));
      } else {
        face.push(smoothOpen([a, m, b]));
      }
    }
    // Underfed, the blush is gone.
    if (show.under === 0) blush.push(patch(head, side * 0.95 + yaw, -0.05, 0.16));
    const nos = surface(snout, side * 0.4 + yaw, 0.3);
    if (faces(nos.n)) {
      const p = screen(nos.p);
      face.push(ellipsePath(p.x, p.y, unit * 0.018, unit * 0.014));
    }
  }
  if (blush.join('')) headCore.push(fill(blush.join(''), palette.accents.rose.base, 0.4));
  if (show.under > 0)
    headCore.push(fill(smoothClosed(headOutline), palette.accents.slate.base, 0.75 * show.under));
  if (lids.length)
    headCore.push(
      el('path', { d: lids.join(''), fill: hide.shade, 'data-sign': 'lids' }),
      line(lids.join(''), w * 0.8, signInk),
    );
  if (face.length) headCore.push(line(face.join(''), w * 1.1));
  pieces.push({ depth: depthAt(head.u, head.v) + 0.001, nodes: headCore });

  const snoutOutline = outline(snout);
  pieces.push({
    depth: depthAt(snout.u, snout.v) + 0.002,
    nodes: [
      fill(smoothClosed(snoutOutline), palette.belly),
      line(smoothClosed(snoutOutline), w * 0.95),
    ],
  });
  // Re-draw the face on the muzzle side when the muzzle covers it (heading towards the viewer).
  if (face.length && depthAt(snout.u, snout.v) > depthAt(head.u, head.v)) {
    const nostrils = face.filter((d) => d.includes('A'));
    if (nostrils.length)
      pieces.push({
        depth: depthAt(snout.u, snout.v) + 0.003,
        nodes: [line(nostrils.join(''), w * 1.1)],
      });
  }

  // Small ears low on the sides of the head.
  // Drawn to a fire, the ears prick up and forward; shying from one, they lie flat back.
  const ear = lure
    ? { tipU: -0.2, tipV: 1.1, tipZ: 0.95 }
    : fear
      ? { tipU: -0.85, tipV: 1.05, tipZ: 0.2 }
      : { tipU: -0.55, tipV: 1.2, tipZ: 0.25 };
  for (const side of [1, -1]) {
    const pts = [
      screen(hp(-head.a * 0.15, side * head.b * 0.75, head.z + head.c * 0.45)),
      screen(hp(head.a * ear.tipU, side * head.b * ear.tipV, head.z + head.c * ear.tipZ)),
      screen(hp(-head.a * 0.45, side * head.b * 0.8, head.z + head.c * 0.2)),
    ];
    everything.push(...pts);
    silhouettes.push(pts);
    const earAt = hp(-head.a * 0.4, side * head.b, 0);
    pieces.push({
      depth: earAt.y + (head.u - head.a * 0.4) * 0.002 + 0.0005,
      nodes: [fill(smoothClosed(pts), hide.shade), line(smoothClosed(pts), w * 0.85)],
    });
  }

  // Swept horns: from the crown, curving back and a little up and out.
  if (look.horns === 'swept') {
    for (const side of [1, -1]) {
      const path: V3[] = [];
      for (let k = 0; k <= 6; k += 1) {
        const f = k / 6;
        path.push(
          hp(
            -head.a * (0.05 + 0.95 * f),
            side * head.b * (0.38 + 0.35 * f),
            head.z + head.c * (0.85 + 0.55 * Math.sin(f * Math.PI * 0.6)),
          ),
        );
      }
      const pts = path.map(screen);
      const widthAt = (f: number): number => unit * 0.075 * (1 - f * 0.85);
      const left: Point[] = [];
      const rightSide: Point[] = [];
      pts.forEach((p, i) => {
        const nb = pts[Math.min(pts.length - 1, i + 1)]!;
        const pb = pts[Math.max(0, i - 1)]!;
        const dx = nb.x - pb.x;
        const dy = nb.y - pb.y;
        const len = Math.hypot(dx, dy) || 1;
        const wd = widthAt(i / (pts.length - 1));
        left.push({ x: p.x - (dy / len) * wd, y: p.y + (dx / len) * wd });
        rightSide.push({ x: p.x + (dy / len) * wd, y: p.y - (dx / len) * wd });
      });
      const horn = [...left, ...rightSide.reverse()];
      everything.push(...horn);
      silhouettes.push(horn);
      const mid = path[3]!;
      pieces.push({
        depth: mid.y + (head.u - head.a * 0.5) * 0.002 + 0.0007,
        nodes: [fill(smoothOpen(horn) + 'Z', palette.horn), line(smoothOpen(horn) + 'Z', w * 0.9)],
      });
    }
  }

  // Overfed: doze bubbles rising from the crown, one per level.
  if (show.over > 0) {
    const crown = screen(hp(-head.a * 0.2, 0, head.z + head.c * 1.25));
    const bubbles = Array.from({ length: show.marks }, (_, i) => {
      const x = crown.x + unit * (0.3 + 0.38 * i);
      const y = crown.y - unit * (0.3 + 0.52 * i);
      const r = unit * (0.13 + 0.07 * i);
      everything.push({ x: x + r, y: y - r });
      return ellipsePath(x, y, r, r);
    });
    pieces.push({
      depth: 1e6,
      nodes: [
        el('path', {
          d: bubbles.join(''),
          fill: palette.paper,
          stroke: signInk,
          'stroke-width': w * 1.1,
          'data-sign': 'doze',
        }),
      ],
    });
  }

  // Reaction cues, each on the side of the fire it answers.
  /** The body's rim (in the plane, from its centre) in the frame direction `angle`. */
  const rim = (angle: number): number =>
    1 / Math.hypot(Math.cos(angle) / body.a, Math.sin(angle) / body.b);
  const cueNodes: SvgNode[] = [];
  for (const cue of cues) {
    if (cue.reaction === 'toward') {
      // A glance: a dashed look-line from the head (or the rim, for a fire behind) towards the fire.
      const fromHead = Math.cos(cue.angle) > -0.2;
      const base = fromHead
        ? { u: head.u, v: head.v, z: head.z, r: head.a + 0.2 }
        : { u: body.u, v: 0, z: body.z, r: rim(cue.angle) + 0.15 };
      const pt = (d: number): Point =>
        at(base.u + cue.u * (base.r + d), base.v + cue.v * (base.r + d), base.z);
      const a = pt(0);
      const b = pt(1.15);
      // Two short alert strokes fanning out from the head on the fire's side.
      const tick = (turn: number): string => {
        const ang = cue.angle + turn;
        const p0 = at(
          base.u + Math.cos(ang) * (base.r + 0.05),
          base.v + Math.sin(ang) * (base.r + 0.05),
          base.z + 0.25,
        );
        const p1 = at(
          base.u + Math.cos(ang) * (base.r + 0.32),
          base.v + Math.sin(ang) * (base.r + 0.32),
          base.z + 0.42,
        );
        return `M${fmt(p0.x)} ${fmt(p0.y)}L${fmt(p1.x)} ${fmt(p1.y)}`;
      };
      everything.push(a, b);
      cueNodes.push(
        el('path', {
          d: `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`,
          ...inkAttrs(palette.hint, w * 2),
          'stroke-dasharray': `${fmt(unit * 0.12)} ${fmt(unit * 0.1)}`,
          'data-cue': 'toward',
        }),
        el('path', {
          d: ellipsePath(b.x, b.y, unit * 0.08, unit * 0.08),
          fill: palette.hint,
          'data-cue': 'toward',
        }),
        el('path', {
          d: tick(-0.5) + tick(0.5),
          ...inkAttrs(palette.hint, w * 1.5),
          'data-cue': 'toward',
        }),
      );
    } else if (cue.reaction === 'away') {
      // A flinch: three short shiver arcs off the rim on the fire's side.
      const z = body.z;
      const arcs = [0.32, 0.6, 0.88].map((d, i) => {
        const spread = 0.62 - i * 0.1;
        return smoothOpen(
          [-1, -0.5, 0, 0.5, 1].map((f) => {
            const ang = cue.angle + f * spread;
            const r = rim(ang) + d;
            return at(body.u + Math.cos(ang) * r, Math.sin(ang) * r, z);
          }),
        );
      });
      const far = at(body.u + cue.u * (rim(cue.angle) + 1), cue.v * (rim(cue.angle) + 1), z);
      everything.push(far);
      cueNodes.push(
        el('path', {
          d: arcs.join(''),
          ...inkAttrs(palette.accents.coral.shade, w * 2.6),
          'data-cue': 'away',
        }),
      );
    } else if (cue.reaction === 'unmoved') {
      // Calm: still rings on the ground on the fire's side, like a pond nothing disturbs.
      // Off the rim on the fire's side; past the head when the fire is ahead.
      const ahead = Math.abs(cue.angle) < 0.7;
      const r0 = ahead ? head.u + head.a + 0.6 - body.u : rim(cue.angle) + 0.55;
      const cu = body.u + cue.u * r0;
      const cv = cue.v * r0;
      const ring = (r: number): string =>
        smoothClosed(
          Array.from({ length: 12 }, (_, i) => {
            const a = (Math.PI * 2 * i) / 12;
            return at(cu + Math.cos(a) * r, cv + Math.sin(a) * r, 0.02);
          }),
        );
      everything.push(at(cu + 0.4, cv + 0.4, 0), at(cu - 0.4, cv - 0.4, 0));
      cueNodes.push(
        el('path', {
          d: ring(0.2),
          fill: palette.accents.sage.light,
          stroke: palette.accents.sage.shade,
          'stroke-width': w,
          'data-cue': 'unmoved',
        }),
        el('path', {
          d: ring(0.38),
          ...inkAttrs(palette.accents.sage.shade, w * 1.1),
          'data-cue': 'unmoved',
        }),
      );
    }
  }
  if (cueNodes.length) pieces.push({ depth: 2e6, nodes: cueNodes });

  pieces.sort((a, b) => a.depth - b.depth);
  return { nodes: pieces.flatMap((p) => p.nodes), box: boxOf(everything), silhouettes };
}

/** Whether a hex lies in the creature's seven-hex footprint. */
export function inFootprint(
  creature: { q: number; r: number },
  hex: { q: number; r: number },
): boolean {
  const dq = hex.q - creature.q;
  const dr = hex.r - creature.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 <= 1;
}

export interface CreatureIconOptions {
  /** Plane squash of the view it is drawn at (default 0.8, the map's). */
  readonly squash?: number;
  /** Which way it walks (default towards the viewer, so its face shows). */
  readonly heading?: { readonly q: number; readonly r: number };
  /** Ink line width on screen, in px, whatever the icon's size (default 1.1). */
  readonly inkPx?: number;
  /** Space around the drawing, as a share of its size (default 0.04). */
  readonly pad?: number;
}

/**
 * The creature as a square, self-contained `<svg>` icon of `px` px. The ink is chosen for the size it is
 * shown at, so lines stay light from a 32 px button to a 96 px page.
 */
export function drawCreatureIcon(
  palette: Palette,
  look: CreatureLook,
  px: number,
  options: CreatureIconOptions = {},
): SvgNode {
  const size = Number.isFinite(px) && px > 0 ? px : 48;
  const squash = options.squash ?? 0.8;
  const heading = options.heading ?? { q: 0, r: 1 };
  const unit = 14;
  // First pass to measure, then the ink that lands at `inkPx` once the drawing is fitted to `size`.
  const probe = drawCreature(palette, look, { x: 0, y: 0 }, unit, squash, 1, heading);
  const span = (b: { x0: number; y0: number; x1: number; y1: number }): number =>
    Math.max(b.x1 - b.x0, b.y1 - b.y0);
  const pad = options.pad ?? 0.04;
  const scale = size / (span(probe.box) * (1 + pad * 2));
  const inkPx = options.inkPx ?? 1.1;
  const drawn = drawCreature(
    palette,
    look,
    { x: 0, y: 0 },
    unit,
    squash,
    inkPx / scale / 1.15,
    heading,
  );
  const { x0, y0, x1, y1 } = drawn.box;
  const side = span(drawn.box) * (1 + pad * 2);
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
