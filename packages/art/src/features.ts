/**
 * Features that sit on a tile once revealed: resource nodes, tomb sites and traps, drawn upright in side
 * view like the other props (shrunk in height for the high view), with a used-up look. Keyed by the `icon`
 * content gives each feature (`ore`, `stones`, `logs`, `berries`, `tomb`, `deep-tomb`, `snare`, `pitfall`, `fieldstones`,
 * `outcrop`, `deadfall`, `shrine`, `undertow`); an unknown
 * key draws a neutral cairn.
 */
import { boxOf, ellipsePath, mapper, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import { groundShadow, inkAttrs, type Drawn, type PropContext } from './props.ts';
import { el, type SvgNode } from './svg.ts';

/** `ready`: as found. `depleted`: a node out of charges. `spent`: a site worked to the end. */
export type FeatureState = 'ready' | 'depleted' | 'spent';

export interface FeatureArt {
  /** A look id (`FEATURE_DRAWERS`); unknown ids draw the neutral cairn. */
  readonly look: string;
  readonly state?: FeatureState;
  /**
   * The content says this feature is a trap: it gets the shared danger cue (a coral band, jagged teeth and a
   * warning pennant on its plinth; muted once `spent`). The look ids in `TRAP_LOOKS` count as traps too.
   */
  readonly trap?: boolean;
}

/** Looks that are traps, for callers that only know the look. */
export const TRAP_LOOKS: ReadonlySet<string> = new Set(['snare', 'pitfall', 'undertow']);

export const isTrap = (f: FeatureArt): boolean => f.trap === true || TRAP_LOOKS.has(f.look);

/** Half-width of a feature's plinth, in local units at the reference hex size. */
export const PLINTH_RX = 16;

/**
 * Looks with a cave door at their base: their plinth sits behind the door (its front edge level with the
 * door's foot) instead of lying in front of it like a door mat.
 */
const DOORED: ReadonlySet<string> = new Set(['tomb', 'deep-tomb']);

/** How far the plinth moves down the screen for a look, in local units (negative: back). */
export const featurePlinthDy = (look: string, rx: number): number =>
  DOORED.has(look) ? -0.36 * rx : 0;

export type FeatureDraw = (c: PropContext, state: FeatureState) => Drawn;

type Raw = readonly (readonly [number, number])[];

export function kit(c: PropContext) {
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  const pts = (raw: Raw): Point[] => raw.map(([x, y]) => T(x, y));
  const fill = (d: string, colour: string, opacity = 1): SvgNode =>
    el('path', opacity === 1 ? { d, fill: colour } : { d, fill: colour, opacity });
  const line = (d: string, scale = 1, colour = c.palette.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, c.ink * scale) });
  const blob = (cx: number, cy: number, rx: number, ry: number): Point[] =>
    pts(
      Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 8;
        const f = 1 + (i % 2 ? -0.06 : 0.05);
        return [cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f] as const;
      }),
    );
  return { T, pts, fill, line, blob };
}

/** Iron: a rocky outcrop with rust-red veins; depleted, chipped hollow and scattered chips. */
const ironDeposit: FeatureDraw = (c, state) => {
  const { pts, fill, line, blob } = kit(c);
  const pal = c.palette;
  const big = pts([
    [-16, 0],
    [-14, -9],
    [-6, -17],
    [3, -15],
    [9, -8],
    [10, 0],
  ]);
  const small = pts([
    [6, 0],
    [8, -6],
    [14, -9],
    [19, -5],
    [19, 0],
  ]);
  const nodes: SvgNode[] = [
    groundShadow(c, 20, 5, 2),
    fill(poly(big), pal.ramps.rock.base),
    fill(
      poly(
        pts([
          [-6, -17],
          [3, -15],
          [9, -8],
          [10, 0],
          [0, 0],
          [-2, -9],
        ]),
      ),
      pal.ramps.rock.shade,
      0.55,
    ),
    fill(poly(small), pal.ramps.rock.light),
  ];
  if (state === 'depleted') {
    const hollow = blob(-3, -8, 4.5, 3.6);
    nodes.push(
      fill(smoothClosed(hollow), pal.ramps.rock.shade),
      line(smoothClosed(hollow), 0.7, pal.inkSoft),
      fill(
        [blob(-20, -1, 1.6, 1.1), blob(13, 1.5, 1.4, 1), blob(-9, 2, 1.2, 0.9)]
          .map((b) => poly(b))
          .join(''),
        pal.ramps.rock.light,
      ),
    );
  } else {
    nodes.push(
      line(
        smoothOpen(
          pts([
            [-12, -6],
            [-7, -9],
            [-3, -7],
            [2, -11],
          ]),
        ) +
          smoothOpen(
            pts([
              [-8, -13],
              [-4, -14],
              [0, -12],
            ]),
          ) +
          smoothOpen(
            pts([
              [10, -4],
              [14, -6],
              [17, -4],
            ]),
          ),
        1.6,
        pal.accents.coral.shade,
      ),
      fill(
        [blob(-5, -9, 1.8, 1.4), blob(3, -11, 1.5, 1.2), blob(14, -5, 1.3, 1)]
          .map((b) => poly(b))
          .join(''),
        pal.accents.coral.base,
      ),
    );
  }
  nodes.push(line(poly(big) + poly(small)));
  return { nodes, box: boxOf([...big, ...small]) };
};

/** Sturdy river stones: smooth rounded stones with a sheen and ripples; depleted, empty hollows. */
const riverStones: FeatureDraw = (c, state) => {
  const { fill, line, blob, pts } = kit(c);
  const pal = c.palette;
  const stones: [number, number, number, number][] =
    state === 'depleted'
      ? [[9, -3, 5, 3.6]]
      : [
          [-9, -4, 7, 5],
          [3, -5.5, 6.5, 5.5],
          [12, -3, 5, 3.6],
          [-2, -1.5, 4.5, 3],
        ];
  const nodes: SvgNode[] = [groundShadow(c, 18, 4.5, 1)];
  nodes.push(
    line(
      smoothOpen(
        pts([
          [-19, 2],
          [-14, 0.5],
          [-9, 2],
        ]),
      ) +
        smoothOpen(
          pts([
            [12, 3],
            [16, 1.5],
            [20, 3],
          ]),
        ),
      0.8,
      pal.ramps.water.shade,
    ),
  );
  if (state === 'depleted') {
    const dents = [blob(-8, -0.5, 6, 2), blob(1, 0, 5, 1.8)];
    nodes.push(
      fill(dents.map((b) => smoothClosed(b)).join(''), pal.ramps.rock.shade, 0.35),
      el('path', {
        d: dents.map((b) => smoothClosed(b)).join(''),
        ...inkAttrs(pal.inkSoft, c.ink * 0.7),
        'stroke-dasharray': `${(1.5 * c.k).toFixed(1)} ${(2.5 * c.k).toFixed(1)}`,
      }),
    );
  }
  const all: Point[] = [];
  for (const [x, y, rx, ry] of stones) {
    const b = blob(x, y, rx, ry);
    all.push(...b);
    const sheen = blob(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.25);
    nodes.push(
      fill(smoothClosed(b), pal.ramps.stone.base),
      fill(smoothClosed(sheen), pal.ramps.stone.light, 0.9),
      line(smoothClosed(b)),
    );
  }
  return {
    nodes,
    box: boxOf([
      ...all,
      ...pts([
        [-19, 3],
        [20, 3],
      ]),
    ]),
  };
};

/** A timber stand: stacked logs beside a stump; depleted, only stumps and chips. */
const timberStand: FeatureDraw = (c, state) => {
  const { fill, line, blob, pts } = kit(c);
  const pal = c.palette;
  const nodes: SvgNode[] = [groundShadow(c, 20, 5, 1)];
  const all: Point[] = [];
  const stump = (x: number, w: number, h: number): void => {
    const body = pts([
      [x - w, 0],
      [x - w * 0.9, -h],
      [x + w * 0.9, -h],
      [x + w, 0],
    ]);
    const top = blob(x, -h, w * 0.9, w * 0.35);
    all.push(...body, ...top);
    nodes.push(
      fill(poly(body), pal.ramps.bark.base),
      line(poly(body)),
      fill(smoothClosed(top), pal.ramps.sand.light),
      line(smoothClosed(top), 0.8),
    );
  };
  if (state === 'depleted') {
    stump(-9, 5, 6);
    stump(7, 4.5, 5);
    nodes.push(
      fill(
        [blob(-1, 2, 1.6, 0.8), blob(14, 1.5, 1.4, 0.7)].map((b) => poly(b)).join(''),
        pal.ramps.sand.base,
      ),
    );
  } else {
    stump(-13, 4.5, 6);
    // Three logs, end-on, stacked two and one.
    for (const [x, y] of [
      [0, -4.5],
      [9, -4.5],
      [4.5, -12],
    ] as const) {
      const end = blob(x, y, 4.6, 4.4);
      const ring = blob(x, y, 2, 1.9);
      all.push(...end);
      nodes.push(
        fill(smoothClosed(end), pal.ramps.sand.light),
        line(smoothClosed(end)),
        line(smoothClosed(ring), 0.6, pal.ramps.bark.shade),
      );
    }
    nodes.push(
      line(
        poly(
          pts([
            [-3, 0.2],
            [13, 0.2],
          ]),
          false,
        ),
        0.9,
        pal.ramps.bark.shade,
      ),
    );
  }
  return { nodes, box: boxOf(all) };
};

/** A low stone tomb entrance in a grassy mound (tier 1); spent, its stones tumbled aside. */
const tomb1: FeatureDraw = (c, state) => {
  const { fill, line, pts } = kit(c);
  const pal = c.palette;
  const mound = pts([
    [-22, 0],
    [-16, -11],
    [0, -16],
    [16, -11],
    [22, 0],
  ]);
  const door = pts([
    [-5, 0],
    [-5, -9],
    [5, -9],
    [5, 0],
  ]);
  const lintel = pts([
    [-8, -9],
    [-7.5, -12.5],
    [7.5, -12.5],
    [8, -9],
  ]);
  const posts = pts([
    [-8, 0],
    [-8, -9],
    [-5, -9],
    [-5, 0],
  ]).concat(
    pts([
      [5, 0],
      [5, -9],
      [8, -9],
      [8, 0],
    ]),
  );
  const nodes: SvgNode[] = [
    groundShadow(c, 24, 6, 1),
    fill(smoothClosed(mound), pal.ramps.heath.base),
    fill(
      smoothClosed(
        pts([
          [0, -16],
          [16, -11],
          [22, 0],
          [8, 0],
          [6, -10],
        ]),
      ),
      pal.ramps.heath.shade,
      0.45,
    ),
    line(smoothClosed(mound)),
  ];
  if (state === 'spent') {
    nodes.push(
      fill(poly(door), pal.ramps.earth.shade, 0.6),
      fill(poly(posts.slice(0, 4)), pal.ramps.stone.light),
      line(poly(posts.slice(0, 4))),
    );
    const fallen = pts([
      [8, 0.5],
      [9, -3],
      [17, -2.5],
      [17, 1],
    ]);
    const lintelDown = pts([
      [-16, 1],
      [-15.5, -2],
      [-7, -2.4],
      [-6.5, 0.8],
    ]);
    nodes.push(
      fill(poly(fallen) + poly(lintelDown), pal.ramps.stone.light),
      line(poly(fallen) + poly(lintelDown)),
    );
  } else {
    nodes.push(
      fill(poly(door), pal.inkSoft),
      fill(poly(posts.slice(0, 4)) + poly(posts.slice(4)) + poly(lintel), pal.ramps.stone.light),
      line(poly(posts.slice(0, 4)) + poly(posts.slice(4)) + poly(lintel)),
    );
  }
  return { nodes, box: boxOf(mound) };
};

/** A larger sealed tomb (tier 2): a stepped barrow, its door closed by a round seal stone with a spiral. */
const tomb2: FeatureDraw = (c, state) => {
  const { fill, line, pts, blob, T } = kit(c);
  const pal = c.palette;
  const barrow = pts([
    [-26, 0],
    [-22, -10],
    [-12, -20],
    [0, -23],
    [12, -20],
    [22, -10],
    [26, 0],
  ]);
  const step = pts([
    [-20, 0],
    [-20, -5],
    [20, -5],
    [20, 0],
  ]);
  const frame = pts([
    [-9, -5],
    [-9, -17],
    [9, -17],
    [9, -5],
  ]);
  const opening = blob(0, -10.5, 6, 6);
  const nodes: SvgNode[] = [
    groundShadow(c, 28, 7, 1),
    fill(smoothClosed(barrow), pal.ramps.heath.base),
    fill(
      smoothClosed(
        pts([
          [0, -23],
          [12, -20],
          [22, -10],
          [26, 0],
          [10, 0],
          [8, -14],
        ]),
      ),
      pal.ramps.heath.shade,
      0.45,
    ),
    line(smoothClosed(barrow)),
    fill(poly(step), pal.ramps.stone.base),
    line(poly(step)),
    fill(poly(frame), pal.ramps.stone.light),
    line(poly(frame)),
  ];
  const seal = (cx: number): SvgNode[] => {
    const disc = blob(cx, -10.5, 6.6, 6.6);
    const spiral: Point[] = [];
    for (let i = 0; i <= 18; i += 1) {
      const a = i * 0.65;
      const r = 0.4 + i * 0.27;
      spiral.push(T(cx + Math.cos(a) * r, -10.5 + Math.sin(a) * r));
    }
    return [
      fill(smoothClosed(disc), pal.ramps.stone.base),
      line(smoothClosed(disc)),
      line(smoothOpen(spiral), 0.7, pal.inkSoft),
    ];
  };
  if (state === 'spent') {
    nodes.push(fill(smoothClosed(opening), pal.inkSoft), ...seal(14));
  } else {
    nodes.push(...seal(0));
  }
  return { nodes, box: boxOf([...barrow, T(21, -17)]) };
};

/** A revealed snare: a slack loop of cord on a bent stick, cut and harmless. */
const snare: FeatureDraw = (c) => {
  const { line, pts, blob, fill } = kit(c);
  const pal = c.palette;
  const stick = pts([
    [-6, 0],
    [-5, -10],
    [-1, -17],
    [4, -19],
  ]);
  const cord = pts([
    [4, -19],
    [5, -12],
    [6, -5],
  ]);
  const loop = blob(7, -1, 7, 2.6);
  const peg = pts([
    [13, 1],
    [14, -4],
  ]);
  return {
    nodes: [
      groundShadow(c, 12, 3, 2),
      line(smoothOpen(stick), 1.4, pal.ramps.bark.shade),
      line(smoothOpen(cord) + smoothClosed(loop), 0.8, pal.ramps.bark.base),
      line(poly(peg, false), 1.2, pal.ramps.bark.shade),
      // The cut: two short frayed ends where the cord was severed.
      line(
        poly(
          pts([
            [5.4, -9.5],
            [6.6, -8.6],
          ]),
          false,
        ) +
          poly(
            pts([
              [4.8, -8.8],
              [6, -7.9],
            ]),
            false,
          ),
        0.6,
        pal.inkSoft,
      ),
      fill(ellipsePath(...xy(pts([[4, -19]])[0]!), 1.2 * c.k, 1.2 * c.k), pal.ramps.bark.base),
    ],
    box: boxOf([...stick, ...loop, ...peg]),
  };
};

/** A revealed pitfall: a dark pit edged with broken sticks and leaves, a marker stick beside it. */
const pitfall: FeatureDraw = (c) => {
  const { fill, line, pts, blob } = kit(c);
  const pal = c.palette;
  const sq = c.squash / 0.6;
  const rim = pts(
    Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 10;
      const f = 1 + (i % 2 ? -0.08 : 0.06);
      return [Math.cos(a) * 13 * f, -2 + Math.sin(a) * 4.5 * f * sq] as const;
    }),
  );
  const pit = pts(
    Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 10;
      return [Math.cos(a) * 10, -2 + Math.sin(a) * 3.2 * sq] as const;
    }),
  );
  const sticks = [
    pts([
      [-12, -3],
      [-4, -1],
    ]),
    pts([
      [5, -4],
      [13, -1.5],
    ]),
    pts([
      [-3, 1],
      [4, 0.5],
    ]),
  ];
  const marker = pts([
    [15, 1],
    [16, -12],
  ]);
  const flag = pts([
    [16, -12],
    [21, -10.5],
    [16, -9],
  ]);
  return {
    nodes: [
      fill(smoothClosed(rim), pal.ramps.earth.base),
      line(smoothClosed(rim), 0.8, pal.inkSoft),
      fill(smoothClosed(pit), pal.inkSoft),
      line(sticks.map((s) => poly(s, false)).join(''), 1.1, pal.ramps.bark.shade),
      fill(
        [blob(-8, -4.5, 1.8, 0.9), blob(9, 0.5, 1.6, 0.8)].map((b) => smoothClosed(b)).join(''),
        pal.ramps.foliage.base,
      ),
      line(poly(marker, false), 1.2, pal.ramps.bark.shade),
      fill(poly(flag), pal.accents.coral.base),
      line(poly(flag), 0.7),
    ],
    box: boxOf([...rim, ...marker, ...flag]),
  };
};

/** Berry bushes: three round leafy bushes dotted with berries; depleted, the same bushes picked bare. */
const berryBushes: FeatureDraw = (c, state) => {
  const { fill, line, blob, T } = kit(c);
  const pal = c.palette;
  // Low, wide, round shrubs hugging the ground: wider than tall, so they never read as trees.
  const bushes: [number, number, number, number][] = [
    [-9, -4.5, 9, 4.8],
    [8, -5, 9.5, 5.2],
    [-0.5, -2.8, 8.5, 4],
  ];
  const shapes = bushes.map(([x, y, rx, ry]) => blob(x, y, rx, ry));
  const nodes: SvgNode[] = [groundShadow(c, 17, 4.5, 1)];
  shapes.forEach((b, i) => {
    const [x, y, rx, ry] = bushes[i]!;
    nodes.push(
      fill(smoothClosed(b), i === 2 ? pal.ramps.foliage.light : pal.ramps.foliage.base),
      fill(
        smoothClosed(blob(x + rx * 0.25, y + ry * 0.3, rx * 0.6, ry * 0.5)),
        pal.ramps.foliage.shade,
        0.45,
      ),
      line(smoothClosed(b)),
    );
  });
  if (state === 'depleted') {
    // Picked bare: a few stalks, and leaves fallen at the foot.
    nodes.push(
      line(
        poly([T(-9, -7), T(-11, -9.5)], false) +
          poly([T(7, -8), T(9, -10.5)], false) +
          poly([T(0, -5), T(-1, -7.5)], false),
        0.8,
        pal.ramps.bark.shade,
      ),
      fill(
        [blob(-15, 1, 1.6, 0.8), blob(14, 0.8, 1.4, 0.7), blob(3, 1.5, 1.3, 0.7)]
          .map((b) => smoothClosed(b))
          .join(''),
        pal.ramps.foliage.shade,
        0.8,
      ),
    );
  } else {
    // Clusters of three berries, large enough to read at map scale.
    const clusters: [number, number][] = [
      [-12, -6],
      [-6, -7.5],
      [5, -8],
      [11, -6],
      [-2, -3.5],
      [3, -2.5],
    ];
    const berries = clusters.flatMap<[number, number]>(([x, y]) => [
      [x, y],
      [x + 2.5, y + 0.4],
      [x + 1.2, y - 2],
    ]);
    const dots = berries.map(([x, y]) => blob(x, y, 1.9, 1.8));
    const shine = berries.map(([x, y]) => blob(x - 0.6, y - 0.6, 0.6, 0.5));
    nodes.push(
      fill(dots.map((d) => smoothClosed(d)).join(''), pal.accents.rose.base),
      line(dots.map((d) => smoothClosed(d)).join(''), 0.8, pal.accents.rose.shade),
      fill(shine.map((d) => smoothClosed(d)).join(''), pal.paper, 0.85),
    );
  }
  return { nodes, box: boxOf(shapes.flat()) };
};

/**
 * Fieldstones: squared, warm-toned blocks with chisel marks, one stacked on two (cut stone, never a grey
 * boulder like the rock props), a tuft beside them; depleted, one block left and dents.
 */
const fieldstones: FeatureDraw = (c, state) => {
  const { fill, line, blob, pts } = kit(c);
  const pal = c.palette;
  const nodes: SvgNode[] = [groundShadow(c, 16, 4, 1)];
  const all: Point[] = [
    ...pts([
      [-16, 2],
      [16, 2],
    ]),
  ];
  // Blocks as [left, base, width, height], drawn back to front.
  const stones: [number, number, number, number][] =
    state === 'depleted'
      ? [[7, 0, 8, 4.5]]
      : [
          [-13, 0, 11, 5.5],
          [-1, 0, 10, 5],
          [-8, -5.5, 10, 5],
        ];
  if (state === 'depleted') {
    const dents = [blob(-8, 0, 6, 1.8), blob(3, 0, 5.5, 1.8)];
    nodes.push(
      fill(dents.map((b) => smoothClosed(b)).join(''), pal.ramps.earth.shade, 0.35),
      el('path', {
        d: dents.map((b) => smoothClosed(b)).join(''),
        ...inkAttrs(pal.inkSoft, c.ink * 0.7),
        'stroke-dasharray': `${(1.5 * c.k).toFixed(1)} ${(2.5 * c.k).toFixed(1)}`,
      }),
    );
  }
  for (const [x, y, w, h] of stones) {
    const face = pts([
      [x, y],
      [x, y - h],
      [x + w, y - h],
      [x + w, y],
    ]);
    const top = pts([
      [x, y - h],
      [x + 1.6, y - h - 1.8],
      [x + w + 1.6, y - h - 1.8],
      [x + w, y - h],
    ]);
    const side = pts([
      [x + w, y],
      [x + w, y - h],
      [x + w + 1.6, y - h - 1.8],
      [x + w + 1.6, y - 1.8],
    ]);
    // Chisel marks: short parallel strokes across the face.
    const chisel = [0.3, 0.55, 0.8]
      .map((t) =>
        poly(
          pts([
            [x + w * t - 0.8, y - h * 0.3],
            [x + w * t + 0.8, y - h * 0.75],
          ]),
          false,
        ),
      )
      .join('');
    all.push(...face, ...top, ...side);
    nodes.push(
      fill(poly(face), pal.ramps.sand.base),
      fill(poly(top), pal.ramps.sand.light),
      fill(poly(side), pal.ramps.sand.shade),
      line(chisel, 0.7, pal.accents.ochre.shade),
      line(poly(face) + poly(top) + poly(side)),
    );
  }
  // A tuft of grass between the stones, so they sit in a field.
  nodes.push(
    line(
      poly(
        pts([
          [-2, 0],
          [-3.5, -5],
        ]),
        false,
      ) +
        poly(
          pts([
            [-1, 0],
            [-0.5, -6],
          ]),
          false,
        ) +
        poly(
          pts([
            [0, 0],
            [2, -4.5],
          ]),
          false,
        ),
      0.8,
      pal.ramps.foliage.shade,
    ),
  );
  return { nodes, box: boxOf(all) };
};

/** An ore outcrop: a low knuckle of rock with a rust bloom and streaks; depleted, cracked open and grey. */
const oreOutcrop: FeatureDraw = (c, state) => {
  const { pts, fill, line, blob } = kit(c);
  const pal = c.palette;
  const rock = pts([
    [-12, 0],
    [-10, -6],
    [-3, -10],
    [5, -9],
    [11, -4],
    [12, 0],
  ]);
  const nodes: SvgNode[] = [
    groundShadow(c, 15, 4, 1),
    fill(poly(rock), state === 'depleted' ? pal.ramps.rock.light : pal.ramps.rock.base),
    fill(
      poly(
        pts([
          [-3, -10],
          [5, -9],
          [11, -4],
          [12, 0],
          [3, 0],
          [1, -6],
        ]),
      ),
      pal.ramps.rock.shade,
      0.5,
    ),
  ];
  if (state !== 'depleted') {
    // A rust bloom over the lower face, so it never reads as a grey rock prop.
    nodes.push(
      fill(
        poly(
          pts([
            [-12, 0],
            [-10.5, -4.5],
            [-4, -6.5],
            [3, -5],
            [9, -2.5],
            [12, 0],
          ]),
        ),
        pal.accents.coral.light,
        0.9,
      ),
    );
  }
  if (state === 'depleted') {
    nodes.push(
      line(
        poly(
          pts([
            [-2, -10],
            [0, -5],
            [-2, -2],
            [0, 0],
          ]),
          false,
        ),
        1,
      ),
      fill(
        [blob(15, 1, 1.5, 0.8), blob(-15, 1.2, 1.3, 0.7)].map((b) => poly(b)).join(''),
        pal.ramps.rock.shade,
      ),
    );
  } else {
    // Rust streaks down the face and two bright flecks.
    nodes.push(
      line(
        smoothOpen(
          pts([
            [-7, -6],
            [-5, -3.5],
            [-6, -1],
          ]),
        ) +
          smoothOpen(
            pts([
              [4, -7],
              [6, -4],
              [5, -1.5],
            ]),
          ),
        1.3,
        pal.accents.coral.shade,
      ),
      fill(
        [blob(-4, -7.5, 1.4, 1.1), blob(7.5, -5.5, 1.2, 1)].map((b) => poly(b)).join(''),
        pal.accents.coral.base,
      ),
    );
  }
  nodes.push(line(poly(rock)));
  return { nodes, box: boxOf(rock) };
};

/** Deadfall: a fallen trunk with a snapped stub of branch; depleted, a short end and sawdust. */
const deadfall: FeatureDraw = (c, state) => {
  const { pts, fill, line, blob } = kit(c);
  const pal = c.palette;
  const long = state !== 'depleted';
  const x1 = long ? 13 : 1;
  const trunk = pts([
    [-15, 0],
    [-15, -6.5],
    [x1, -5.5],
    [x1, 0],
  ]);
  const end = blob(x1, -2.75, 2.2, 2.9);
  const nodes: SvgNode[] = [
    groundShadow(c, 17, 4, 1),
    fill(poly(trunk), pal.ramps.bark.base),
    line(poly(trunk)),
    line(
      smoothOpen(
        pts([
          [-12, -3.5],
          [-5, -3],
          [2, -3.6],
        ]),
      ),
      0.6,
      pal.ramps.bark.shade,
    ),
    fill(smoothClosed(end), pal.ramps.sand.light),
    line(smoothClosed(end), 0.8),
    fill(smoothClosed(blob(-15, -3.25, 2, 3.2)), pal.ramps.bark.shade),
  ];
  const all: Point[] = [...trunk, ...end];
  if (long) {
    const stub = pts([
      [-5, -6],
      [-7, -12],
      [-5, -12.5],
      [-3, -6],
    ]);
    all.push(...stub);
    nodes.push(fill(poly(stub), pal.ramps.bark.base), line(poly(stub), 0.9));
  } else {
    nodes.push(
      fill(
        [blob(6, 1.5, 1.6, 0.7), blob(9, 0.8, 1.2, 0.6)].map((b) => poly(b)).join(''),
        pal.ramps.sand.base,
      ),
    );
  }
  return { nodes, box: boxOf(all) };
};

/**
 * A sunken shrine: a small stone arch standing in the shallows with a niche (and a pale pearl in it),
 * ripples about its feet; spent, the niche is empty and dark and the ripples gone still.
 */
const shrine: FeatureDraw = (c, state) => {
  const { fill, line, pts, blob } = kit(c);
  const pal = c.palette;
  const sq = c.squash / 0.6;
  const water = blob(0, -1, 17, 3.4 * sq);
  const left = pts([
    [-11, 0],
    [-10.5, -14],
    [-6, -17],
    [-4.5, -14],
    [-5, 0],
  ]);
  const right = pts([
    [11, 0],
    [10.5, -14],
    [6, -17],
    [4.5, -14],
    [5, 0],
  ]);
  const lintel = pts([
    [-12.5, -14],
    [-8, -20],
    [8, -20],
    [12.5, -14],
    [8, -15.5],
    [-8, -15.5],
  ]);
  const niche = blob(0, -8, 3.4, 4);
  const nodes: SvgNode[] = [
    fill(smoothClosed(water), pal.ramps.water.light, 0.8),
    line(smoothClosed(water), 0.6, pal.ramps.water.shade),
    fill(poly(left), pal.ramps.stone.base),
    fill(poly(right), pal.ramps.stone.light),
    line(poly(left) + poly(right)),
    fill(poly(lintel), pal.ramps.stone.light),
    line(poly(lintel)),
    fill(smoothClosed(niche), state === 'spent' ? pal.inkSoft : pal.ramps.stone.shade),
  ];
  if (state !== 'spent') {
    const pearl = blob(0, -7.5, 2, 2);
    nodes.push(
      fill(smoothClosed(pearl), pal.paper),
      line(smoothClosed(pearl), 0.7),
      line(
        smoothOpen(
          pts([
            [-14, 1.5],
            [-10, 2.6],
            [-6, 1.8],
          ]),
        ) +
          smoothOpen(
            pts([
              [7, 2],
              [11, 2.8],
              [15, 1.8],
            ]),
          ),
        0.7,
        pal.ramps.water.shade,
      ),
    );
  }
  return { nodes, box: boxOf([...water, ...lintel]) };
};

/** A revealed undertow: a ring of swirling ripples in the water with a snapped branch caught in it. */
const undertow: FeatureDraw = (c) => {
  const { fill, line, pts } = kit(c);
  const pal = c.palette;
  const sq = c.squash / 0.6;
  const ring = (rx: number, ry: number): Point[] =>
    pts(
      Array.from({ length: 12 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 12;
        return [Math.cos(a) * rx, -2 + Math.sin(a) * ry * sq] as const;
      }),
    );
  const outer = ring(14, 4.6);
  const mid = ring(9, 3);
  const eye = ring(4, 1.4);
  const branch = pts([
    [-9, -4],
    [-2, -1.5],
    [3, -3],
  ]);
  const twig = pts([
    [-4, -2.5],
    [-5, -7],
  ]);
  return {
    nodes: [
      fill(smoothClosed(outer), pal.ramps.water.light, 0.85),
      line(smoothClosed(outer), 0.7, pal.ramps.water.shade),
      line(smoothClosed(mid), 0.7, pal.ramps.water.shade),
      fill(smoothClosed(eye), pal.ramps.water.shade),
      line(smoothOpen(branch), 1.4, pal.ramps.bark.shade),
      line(poly(twig, false), 1.1, pal.ramps.bark.shade),
    ],
    box: boxOf([...outer, ...twig]),
  };
};

/** The neutral mark for a feature look the kit does not know: a small cairn. */
const cairn: FeatureDraw = (c) => {
  const { fill, line, blob } = kit(c);
  const pal = c.palette;
  const stones = [blob(0, -2.5, 6, 2.6), blob(0.5, -6.8, 4.4, 2.1), blob(-0.3, -10.3, 2.8, 1.7)];
  return {
    nodes: [
      groundShadow(c, 8, 2.4, 1),
      ...stones.flatMap((s) => [
        fill(smoothClosed(s), pal.ramps.stone.light),
        line(smoothClosed(s), 0.9),
      ]),
    ],
    box: boxOf(stones.flat()),
  };
};

function xy(p: Point): [number, number] {
  return [p.x, p.y];
}

/** Feature drawers by look id. */
export const FEATURE_DRAWERS: Readonly<Record<string, FeatureDraw>> = {
  ore: ironDeposit,
  stones: riverStones,
  logs: timberStand,
  tomb: tomb1,
  'deep-tomb': tomb2,
  snare,
  pitfall,
  berries: berryBushes,
  fieldstones,
  outcrop: oreOutcrop,
  deadfall,
  shrine,
  undertow,
};

export function featureDrawer(look: string): FeatureDraw {
  return Object.hasOwn(FEATURE_DRAWERS, look) ? FEATURE_DRAWERS[look]! : cairn;
}
