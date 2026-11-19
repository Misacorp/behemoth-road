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

export type CreatureBody = 'broad' | 'longneck' | 'low';

export interface CreatureLook {
  readonly id: string;
  /**
   * Its build: `broad` a high tortoise-like back and a strong neck; `longneck` a narrower body with a neck
   * that rises high and a long tail; `low` a wide, low, mossy mound with its head held low.
   */
  readonly body: CreatureBody;
  /** Size against its footprint: 1 fills the seven hexes. */
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
  body: 'broad',
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
  readonly look: CreatureLook;
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
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

const fmt = (n: number): string => (Math.round(n * 10) / 10).toString();

export function drawCreature(
  palette: Palette,
  look: CreatureLook,
  origin: Point,
  size: number,
  squash: number,
  ink: number,
  heading: { q: number; r: number },
): Drawn {
  const build = BUILDS[look.body] ?? BUILDS.broad;
  const S = Number.isFinite(look.scale) && look.scale > 0 ? look.scale : 1;
  const unit = size * S;
  const t = squash;
  const rise = Math.sqrt(Math.max(0, 1 - t * t));
  const fwd = planeDirection(heading.q === 0 && heading.r === 0 ? { q: 0, r: -1 } : heading);
  const right = { x: -fwd.y, y: fwd.x };
  // Creature frame (u forward, v to its right, z up; hex sizes at scale 1) to the world, then the screen.
  const world = (u: number, v: number, z: number): V3 => ({
    x: (u * fwd.x + v * right.x) * S,
    y: (u * fwd.y + v * right.y) * S,
    z: z * S,
  });
  const screen = (p: V3): Point => ({
    x: origin.x + p.x * size,
    y: origin.y + (p.y * t - p.z * rise) * size,
  });
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
  ): Point[] => {
    const pts: Point[] = [];
    for (let k = 0; k <= 6; k += 1) {
      const f = k / 6;
      const u = from[0] + (to[0] - from[0]) * f;
      const z = from[1] + (to[1] - from[1]) * f;
      const r = from[2] + (to[2] - from[2]) * f;
      for (let i = 0; i < 16; i += 1) {
        const a = (Math.PI * 2 * i) / 16;
        pts.push(at(u, Math.cos(a) * r, z + Math.sin(a) * r));
      }
    }
    const h = thin(hull(pts), minGap);
    everything.push(...h);
    return h;
  };

  type Piece = { depth: number; nodes: SvgNode[] };
  const pieces: Piece[] = [];
  // Painter's depth: plane y (south is nearer); a hair of forward bias so body, neck and head stack in order.
  const depthAt = (u: number, v: number): number => world(u, v, 0).y + u * 0.002;

  const body = build.body;
  const head = build.head;

  // Shadow on the ground.
  const shadow = Array.from({ length: 20 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 20;
    return at(body.u + Math.cos(a) * (body.a + 0.5), Math.sin(a) * (body.b + 0.3), 0);
  });
  pieces.push({ depth: -1e6, nodes: [fill(smoothClosed(shadow), palette.shadow, 0.2)] });

  // Legs: thick columns under the body with mossy feet; the body hides their tops.
  const legTop = body.z;
  const legs: Piece[] = [];
  for (const [su, sv] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
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
  const bodyOutline = outline(body, -0.25);
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
  bodyNodes.push(line(smoothClosed(bodyOutline)));

  if (look.back === 'landscape') {
    // A tiny pond and a rock lying on the back.
    const pondAt = screen(top(body.u - body.a * 0.35, body.b * 0.3));
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
    const rockAt = screen(top(body.u + body.a * 0.25, body.b * 0.42));
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
      [0.15, -0.35, 1],
      [-0.45, -0.05, 0.8],
      [0.55, 0.05, 0.7],
    ].slice(0, build.trees) as [number, number, number][];
    const trees = treeSpots
      .map(([fu, fv, hgt]) => ({ base: screen(top(body.u + fu * body.a, fv * body.b)), hgt }))
      .sort((a, b) => a.base.y - b.base.y);
    for (const { base, hgt } of trees) {
      const k = (unit / 64) * 1.25 * hgt;
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
  pieces.push({ depth: depthAt(body.u, 0), nodes: bodyNodes });

  // Neck: a strong tapering tube from the shoulder to the head.
  const neckOutline = tube(build.neck[0], build.neck[1]);
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
            return at(u0 + (u1 - u0) * f, -r * 0.3, z0 + (z1 - z0) * f + r * 0.7);
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
    u: head.u + head.a * 0.75,
    v: 0,
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
  for (const side of [1, -1]) {
    const th = side * 0.75;
    if (faces(surface(head, th, 0.3).n)) {
      const a = screen(surface(head, th - 0.2 * side, 0.32).p);
      const m = screen(surface(head, th, 0.22).p);
      const b = screen(surface(head, th + 0.2 * side, 0.32).p);
      face.push(smoothOpen([a, m, b]));
    }
    blush.push(patch(head, side * 0.95, -0.05, 0.16));
    const nos = surface(snout, side * 0.4, 0.3);
    if (faces(nos.n)) {
      const p = screen(nos.p);
      face.push(ellipsePath(p.x, p.y, unit * 0.018, unit * 0.014));
    }
  }
  if (blush.join('')) headCore.push(fill(blush.join(''), palette.accents.rose.base, 0.4));
  if (face.length) headCore.push(line(face.join(''), w * 1.1));
  pieces.push({ depth: depthAt(head.u, 0) + 0.001, nodes: headCore });

  const snoutOutline = outline(snout);
  pieces.push({
    depth: depthAt(snout.u, 0) + 0.002,
    nodes: [
      fill(smoothClosed(snoutOutline), palette.belly),
      line(smoothClosed(snoutOutline), w * 0.95),
    ],
  });
  // Re-draw the face on the muzzle side when the muzzle covers it (heading towards the viewer).
  if (face.length && depthAt(snout.u, 0) > depthAt(head.u, 0)) {
    const nostrils = face.filter((d) => d.includes('A'));
    if (nostrils.length)
      pieces.push({
        depth: depthAt(snout.u, 0) + 0.003,
        nodes: [line(nostrils.join(''), w * 1.1)],
      });
  }

  // Small ears low on the sides of the head.
  for (const side of [1, -1]) {
    const pts = [
      at(head.u - head.a * 0.15, side * head.b * 0.75, head.z + head.c * 0.45),
      at(head.u - head.a * 0.55, side * head.b * 1.2, head.z + head.c * 0.25),
      at(head.u - head.a * 0.45, side * head.b * 0.8, head.z + head.c * 0.2),
    ];
    everything.push(...pts);
    pieces.push({
      depth: depthAt(head.u - head.a * 0.4, side * head.b) + 0.0005,
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
          world(
            head.u - head.a * (0.05 + 0.95 * f),
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
      const mid = path[3]!;
      pieces.push({
        depth: mid.y + (head.u - head.a * 0.5) * 0.002 + 0.0007,
        nodes: [fill(smoothOpen(horn) + 'Z', palette.horn), line(smoothOpen(horn) + 'Z', w * 0.9)],
      });
    }
  }

  pieces.sort((a, b) => a.depth - b.depth);
  return { nodes: pieces.flatMap((p) => p.nodes), box: boxOf(everything) };
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
