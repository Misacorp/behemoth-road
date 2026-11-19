/**
 * The creature, seen from above at the map's view angle. It is modelled as a few soft solids (body, head,
 * legs, ears, tail) in its own frame, turned to its heading and projected like the ground: a point at plane
 * position (X, Y) and height Z lands at (X, Y·squash − Z·√(1 − squash²)). So one drawing serves all six hex
 * directions, and the body's back, its spots and the garden growing on it face the viewer.
 */
import { boxOf, ellipsePath, smoothClosed, smoothOpen, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { inkAttrs, type Drawn } from './props.ts';
import { el, type SvgNode } from './svg.ts';

export interface CreatureLook {
  readonly id: string;
  /** Its outline from above: a round back or a longer one. */
  readonly body: 'round' | 'long';
  readonly legs: 'stumpy' | 'tall';
  readonly markings: 'spots' | 'stripes' | 'none';
  readonly ears: 'leaf' | 'round';
  readonly horns: 'nubs' | 'none';
  /** What grows on its back. */
  readonly back: 'garden' | 'bare';
  readonly tail: 'tuft' | 'short';
}

/** The first creature: tame, slow and gentle. */
export const GENTLE_AMBLER: CreatureLook = {
  id: 'gentle-ambler',
  body: 'round',
  legs: 'stumpy',
  markings: 'spots',
  ears: 'leaf',
  horns: 'nubs',
  back: 'garden',
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

/** Convex hull (monotone chain), counter-clockwise. */
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

/** Drops hull points closer than `min` to the previous one, so the smoothed outline stays calm. */
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

/** A unit vector along an axial step, on the ground plane (x east, y south). */
function planeDirection(step: { q: number; r: number }): { x: number; y: number } {
  const x = 1.5 * step.q;
  const y = Math.sqrt(3) * (step.r + step.q / 2);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

export function drawCreature(
  palette: Palette,
  look: CreatureLook,
  origin: Point,
  size: number,
  squash: number,
  ink: number,
  heading: { q: number; r: number },
): Drawn {
  const t = squash;
  const rise = Math.sqrt(Math.max(0, 1 - t * t));
  const fwd = planeDirection(heading.q === 0 && heading.r === 0 ? { q: 0, r: -1 } : heading);
  const right = { x: -fwd.y, y: fwd.x };
  const lift = look.legs === 'tall' ? 0.14 : 0;
  // Creature frame (u forward, v to its right, z up, in hex sizes) to the world, then to the screen.
  const world = (u: number, v: number, z: number): V3 => ({
    x: u * fwd.x + v * right.x,
    y: u * fwd.y + v * right.y,
    z,
  });
  const screen = (p: V3): Point => ({
    x: origin.x + p.x * size,
    y: origin.y + (p.y * t - p.z * rise) * size,
  });
  const at = (u: number, v: number, z: number): Point => screen(world(u, v, z));
  // Faces the viewer: the view direction is (0, rise, t) in world terms (south and up).
  const faces = (n: V3): boolean => n.y * rise + n.z * t > 0.05;

  const hide = palette.ramps.hide;
  const w = ink * 1.1;
  const line = (d: string, width = w, colour = palette.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, width) });
  const fill = (d: string, colour: string, opacity = 1): SvgNode =>
    el('path', opacity === 1 ? { d, fill: colour } : { d, fill: colour, opacity });
  const everything: Point[] = [];

  /** An ellipsoid in the creature frame: centre (u, v, z), semi-axes a (forward), b (across), c (up). */
  interface Solid {
    readonly u: number;
    readonly v: number;
    readonly z: number;
    readonly a: number;
    readonly b: number;
    readonly c: number;
  }
  const surface = (s: Solid, theta: number, phi: number): { p: V3; n: V3 } => {
    const cu = Math.cos(phi) * Math.cos(theta);
    const cv = Math.cos(phi) * Math.sin(theta);
    const cz = Math.sin(phi);
    const p = world(s.u + s.a * cu, s.v + s.b * cv, s.z + s.c * cz);
    const nl = world(cu / s.a, cv / s.b, 0);
    const n = { x: nl.x, y: nl.y, z: cz / s.c };
    const len = Math.hypot(n.x, n.y, n.z) || 1;
    return { p, n: { x: n.x / len, y: n.y / len, z: n.z / len } };
  };
  const outline = (s: Solid, minZ = -Math.PI / 2): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < 28; i += 1) {
      for (let j = 0; j <= 8; j += 1) {
        const phi = minZ + ((Math.PI / 2 - minZ) * j) / 8;
        pts.push(screen(surface(s, (Math.PI * 2 * i) / 28, phi).p));
      }
    }
    const h = thin(hull(pts), size * 0.06);
    everything.push(...h);
    return h;
  };
  /** The lit top of a solid: surface points whose normal points up more than `minUp`. */
  const cap = (
    s: Solid,
    minUp: number,
    shift: { x: number; y: number } = { x: 0, y: 0 },
  ): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < 28; i += 1) {
      for (let j = 0; j <= 10; j += 1) {
        const { p, n } = surface(s, (Math.PI * 2 * i) / 28, (Math.PI / 2) * (j / 10));
        if (n.z >= minUp) pts.push(screen({ x: p.x + shift.x, y: p.y + shift.y, z: p.z }));
      }
    }
    return thin(hull(pts), size * 0.05);
  };
  /** A small round patch lying on a solid's surface around (theta, phi), if it faces the viewer. */
  const patch = (s: Solid, theta: number, phi: number, r: number): string => {
    const centre = surface(s, theta, phi);
    if (!faces(centre.n)) return '';
    const pts: Point[] = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI * 2 * i) / 8;
      pts.push(
        screen(
          surface(
            s,
            theta + (Math.cos(a) * r) / Math.max(0.2, Math.cos(phi)),
            phi + Math.sin(a) * r,
          ).p,
        ),
      );
    }
    return smoothClosed(pts);
  };

  type Part = { depth: number; nodes: SvgNode[] };
  const parts: Part[] = [];
  const depthOf = (u: number, v: number): number => world(u, v, 0).y;

  const long = look.body === 'long';
  const body: Solid = {
    u: long ? -0.05 : 0,
    v: 0,
    z: 0.62 + lift,
    a: long ? 1.6 : 1.18,
    b: long ? 0.78 : 0.9,
    c: 0.5,
  };
  const head: Solid = { u: body.u + body.a + 0.34, v: 0, z: 0.82 + lift, a: 0.44, b: 0.4, c: 0.32 };
  const snout: Solid = { u: head.u + 0.37, v: 0, z: head.z - 0.08, a: 0.17, b: 0.23, c: 0.15 };
  const neck: Solid = {
    u: body.u + body.a - 0.05,
    v: 0,
    z: 0.76 + lift,
    a: 0.42,
    b: 0.32,
    c: 0.28,
  };

  // Shadow on the ground.
  const shadow = Array.from({ length: 16 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 16;
    return at(body.u + 0.15 + Math.cos(a) * (body.a + 0.35), Math.sin(a) * (body.b + 0.12), 0);
  });
  parts.push({ depth: -99, nodes: [fill(smoothClosed(shadow), palette.shadow, 0.18)] });

  // Legs: short columns under the body; only their feet show beside it.
  for (const [lu, lv] of [
    [0.62, 0.6],
    [0.62, -0.6],
    [-0.62, 0.6],
    [-0.62, -0.6],
  ] as const) {
    const u = body.u + lu * (long ? 1.15 : 1);
    const pts: Point[] = [];
    for (let i = 0; i < 12; i += 1) {
      const a = (Math.PI * 2 * i) / 12;
      pts.push(
        at(u + Math.cos(a) * 0.2, lv + Math.sin(a) * 0.19, 0),
        at(u + Math.cos(a) * 0.21, lv + Math.sin(a) * 0.2, 0.42 + lift),
      );
    }
    const h = thin(hull(pts), size * 0.04);
    everything.push(...h);
    const toe = at(u + 0.12, lv, 0.04);
    const toes = [-0.08, 0, 0.08]
      .map((d) => {
        const a = at(u + 0.17, lv + d, 0.02);
        return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}l0 ${(-size * 0.035).toFixed(1)}`;
      })
      .join('');
    parts.push({
      depth: -50,
      nodes: [
        fill(smoothClosed(h), hide.shade),
        line(smoothClosed(h)),
        ...(faces(world(1, 0, 0.3)) || toe.y > origin.y
          ? [line(toes, w * 0.7, palette.inkSoft)]
          : []),
      ],
    });
  }

  // Tail at the back.
  const tailBase = { u: body.u - body.a + 0.05, z: body.z - 0.05 };
  const tailPts = [
    at(tailBase.u - 0.02, 0, tailBase.z + 0.04),
    at(tailBase.u - 0.18, 0.1, tailBase.z),
    at(tailBase.u - 0.2, 0.28, tailBase.z - 0.06),
  ];
  const tailNodes: SvgNode[] = [
    line(smoothOpen(tailPts), size * 0.12 + w * 2),
    line(smoothOpen(tailPts), size * 0.12, hide.base),
  ];
  if (look.tail === 'tuft') {
    const tip = tailPts[2]!;
    const tuft = ellipsePath(tip.x, tip.y, size * 0.11, size * 0.1);
    tailNodes.push(fill(tuft, palette.marking), line(tuft));
  }
  everything.push(...tailPts);
  parts.push({ depth: depthOf(tailBase.u - 0.3, 0), nodes: tailNodes });

  // Body: a shaded rim, the lit back on top, light from the upper left, spots on the back.
  const bodyOutline = outline(body, -0.2);
  const bodyNodes: SvgNode[] = [
    fill(smoothClosed(bodyOutline), hide.shade),
    fill(smoothClosed(cap(body, 0.35)), hide.base),
    fill(
      smoothClosed(
        cap({ ...body, a: body.a * 0.55, b: body.b * 0.5, c: body.c * 0.98 }, 0.55, {
          x: -0.22,
          y: -0.18,
        }),
      ),
      hide.light,
      0.75,
    ),
  ];
  if (look.markings === 'spots') {
    const spots: [number, number, number][] = [
      [0.35, 1.05, 0.16],
      [2.4, 1.0, 0.14],
      [1.4, 1.2, 0.13],
      [4.0, 1.05, 0.12],
      [0.2, 0.55, 0.11],
      [5.3, 0.75, 0.11],
      [3.1, 0.6, 0.1],
    ];
    bodyNodes.push(
      fill(spots.map(([th, ph, r]) => patch(body, th, ph, r)).join(''), palette.marking, 0.7),
    );
  } else if (look.markings === 'stripes') {
    const d = [-0.5, -0.15, 0.2, 0.55]
      .map((uu) => {
        const pts = [-0.85, -0.45, 0, 0.45, 0.85].map((vv) => {
          const zz =
            body.z + body.c * Math.sqrt(Math.max(0, 1 - (uu / body.a) ** 2 - (vv / body.b) ** 2));
          return world(body.u + uu, vv, zz);
        });
        const a = pts.map((p) => screen({ ...p, x: p.x - fwd.x * 0.06, y: p.y - fwd.y * 0.06 }));
        const b = pts
          .map((p) => screen({ ...p, x: p.x + fwd.x * 0.06, y: p.y + fwd.y * 0.06 }))
          .reverse();
        return smoothClosed([...a, ...b]);
      })
      .join('');
    bodyNodes.push(fill(d, palette.marking, 0.6));
  }
  bodyNodes.push(line(smoothClosed(bodyOutline)));

  // The garden on its back: a small three-lobed tree, tufts and two flowers, standing upright.
  if (look.back === 'garden') {
    const top = (uu: number, vv: number): Point =>
      at(
        body.u + uu,
        vv,
        body.z + body.c * Math.sqrt(Math.max(0, 1 - (uu / body.a) ** 2 - (vv / body.b) ** 2)),
      );
    const base = top(-0.15, 0.08);
    const up = size * rise;
    const s = (size / 64) * 1.45;
    const trunkTop = { x: base.x, y: base.y - up * 0.32 };
    const lobe = (dx: number, dy: number, r: number): string =>
      smoothClosed(
        Array.from({ length: 7 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 7;
          const f = 1 + (i % 2 ? -0.08 : 0.06);
          return {
            x: trunkTop.x + (dx + Math.cos(a) * r * f) * s,
            y: trunkTop.y + (dy + Math.sin(a) * r * 0.85 * f) * s,
          };
        }),
      );
    const lobes = [lobe(-5, -2, 6.5), lobe(5, -2, 6.5), lobe(0, -8, 7)];
    everything.push(trunkTop, { x: trunkTop.x, y: trunkTop.y - 16 * s });
    const blades: string[] = [];
    for (const [uu, vv] of [
      [0.45, -0.35],
      [-0.55, 0.4],
      [0.15, 0.5],
    ] as const) {
      const b = top(uu, vv);
      for (let i = -1; i <= 1; i += 1) {
        blades.push(
          smoothOpen([
            b,
            { x: b.x + i * 1.6 * s, y: b.y - 3.5 * s },
            { x: b.x + i * 3 * s, y: b.y - 6 * s },
          ]),
        );
      }
    }
    const f1 = top(0.5, 0.3);
    const f2 = top(-0.5, -0.35);
    bodyNodes.push(
      line(blades.join(''), w * 0.65, palette.inkSoft),
      fill(ellipsePath(f1.x, f1.y, 2.2 * s, 1.8 * s), palette.accents.rose.base),
      fill(ellipsePath(f2.x, f2.y, 2 * s, 1.7 * s), palette.accents.ochre.base),
      fill(ellipsePath(base.x + 2 * s, base.y + 1 * s, 9 * s, 3.5 * s), palette.shadow, 0.18),
      line(
        `M${base.x.toFixed(1)} ${base.y.toFixed(1)}L${trunkTop.x.toFixed(1)} ${trunkTop.y.toFixed(1)}`,
        w * 1.8,
        palette.ramps.bark.shade,
      ),
      ...lobes.map((d) => fill(d, palette.ramps.foliage.base)),
      fill(lobe(-1, -9, 3), palette.ramps.foliage.light, 0.8),
      line(lobes.join(''), w * 0.85),
    );
  }
  parts.push({ depth: depthOf(body.u, 0), nodes: bodyNodes });

  // Neck, head, snout, ears, nubs and the face, which shows only where it faces the viewer.
  const headNodes: SvgNode[] = [];
  const neckOutline = outline(neck);
  headNodes.push(fill(smoothClosed(neckOutline), hide.base));
  const headFacesViewer = faces(world(1, 0, 0));
  const ears: [number, number][] =
    look.ears === 'leaf'
      ? [
          [1, 0],
          [-1, 0],
        ]
      : [
          [1, 1],
          [-1, 1],
        ];
  const earNodes: SvgNode[] = [];
  for (const [side] of ears) {
    if (look.ears === 'leaf') {
      const pts = [
        at(head.u + 0.08, side * 0.26, head.z + 0.22),
        at(head.u - 0.12, side * 0.62, head.z + 0.14),
        at(head.u - 0.3, side * 0.78, head.z + 0.06),
        at(head.u - 0.2, side * 0.5, head.z + 0.12),
        at(head.u - 0.06, side * 0.3, head.z + 0.14),
      ];
      everything.push(...pts);
      earNodes.push(fill(smoothClosed(pts), hide.base), line(smoothClosed(pts)));
    } else {
      const c = at(head.u - 0.08, side * 0.32, head.z + 0.24);
      earNodes.push(
        fill(ellipsePath(c.x, c.y, size * 0.1, size * 0.09), hide.base),
        line(ellipsePath(c.x, c.y, size * 0.1, size * 0.09)),
      );
    }
  }
  const snoutOutline = outline(snout);
  const snoutNodes = [
    fill(smoothClosed(snoutOutline), palette.belly),
    line(smoothClosed(snoutOutline), w * 0.9),
  ];
  const headOutline = outline(head);
  const headCore = [
    fill(smoothClosed(headOutline), hide.base),
    fill(
      smoothClosed(
        cap({ ...head, a: head.a * 0.6, b: head.b * 0.55 }, 0.5, { x: -0.06, y: -0.05 }),
      ),
      hide.light,
      0.7,
    ),
    line(smoothClosed(headOutline)),
  ];
  // The snout sits in front of the head when the head points at the viewer, behind it when pointing away.
  if (headFacesViewer) headNodes.push(...earNodes, ...headCore, ...snoutNodes);
  else headNodes.push(...snoutNodes, ...earNodes, ...headCore);
  if (look.horns === 'nubs') {
    for (const side of [1, -1]) {
      const c = at(head.u - 0.02, side * 0.15, head.z + head.c);
      const d = ellipsePath(c.x, c.y, size * 0.04, size * 0.034);
      headNodes.push(fill(d, palette.horn), line(d, w * 0.8));
    }
  }
  // Face: content half-closed eyes, a cheek blush and nostrils, each only where it faces the viewer.
  const face: string[] = [];
  const blush: string[] = [];
  for (const side of [1, -1]) {
    const th = side * 0.85;
    const eye = surface(head, th, 0.35);
    if (faces(eye.n)) {
      const a = screen(surface(head, th - 0.18 * side, 0.36).p);
      const m = screen(surface(head, th, 0.28).p);
      const b = screen(surface(head, th + 0.18 * side, 0.36).p);
      face.push(smoothOpen([a, m, b]));
    }
    const cheek = surface(head, side * 1.0, 0.0);
    if (faces(cheek.n)) blush.push(patch(head, side * 1.0, 0.0, 0.18));
    const nos = surface(snout, side * 0.35, 0.35);
    if (faces(nos.n)) {
      const p = screen(nos.p);
      face.push(ellipsePath(p.x, p.y, size * 0.016, size * 0.013));
    }
  }
  if (blush.length) headNodes.push(fill(blush.join(''), palette.accents.rose.base, 0.45));
  if (face.length) headNodes.push(line(face.join(''), w * 1.05));
  parts.push({ depth: depthOf(head.u - 0.2, 0), nodes: headNodes });

  // Painter's order: parts further north (smaller plane y) first; the shadow and legs always first.
  parts.sort((a, b) => a.depth - b.depth);
  return { nodes: parts.flatMap((p) => p.nodes), box: boxOf(everything) };
}
