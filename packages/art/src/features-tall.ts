/**
 * Tall looks for the features that rise above their tile (round 3): a cave mouth in a cliff face, a carved
 * crag, ore spires, a rocky tor, tall trees, a toppled trunk with its root plate, a cairn, standing stones,
 * a spired shrine in the shallows and a bramble. Drawn at real height in local units (no vertical
 * stretch); `kit` and the used-up looks follow `features.ts`.
 */
import { boxOf, ellipsePath, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import { kit } from './feature-kit.ts';
import type { FeatureDraw } from './features.ts';
import { drawBrazier } from './fire-art.ts';
import { groundShadow } from './props.ts';
import { el, type SvgNode } from './svg.ts';

type Raw = readonly (readonly [number, number])[];

/** A rock spire of half-width `w` and height `h`, leaning by `lean`; its right face is shaded. */
const spire = (x: number, w: number, h: number, lean = 0): { body: Raw; face: Raw } => ({
  body: [
    [x - w, 0],
    [x - w * 0.85, -h * 0.55],
    [x + lean - w * 0.15, -h],
    [x + w * 0.7 + lean * 0.5, -h * 0.5],
    [x + w, 0],
  ],
  face: [
    [x + lean - w * 0.15, -h],
    [x + w * 0.7 + lean * 0.5, -h * 0.5],
    [x + w, 0],
    [x + lean * 0.2, 0],
    [x + lean * 0.3, -h * 0.5],
  ],
});

/** Iron: three jagged rock spires with rust-coral crystals; depleted, broken stumps, a hollow and chips. */
const ironDeposit: FeatureDraw = (c, state) => {
  const { pts, fill, line, blob } = kit(c);
  const pal = c.palette;
  const depleted = state === 'depleted';
  const spires = depleted
    ? [spire(-11, 7, 9), spire(2, 9, 13, 1), spire(14, 6, 7)]
    : [spire(-12, 7, 22, -2), spire(2, 9.5, 38, 2), spire(14, 6.5, 19, 1)];
  const nodes: SvgNode[] = [groundShadow(c, 22, 5, 2)];
  const all: Point[] = [];
  spires.forEach((s, i) => {
    const body = pts(s.body);
    all.push(...body);
    nodes.push(
      fill(poly(body), i === 2 ? pal.ramps.rock.light : pal.ramps.rock.base),
      fill(poly(pts(s.face)), pal.ramps.rock.shade, 0.55),
      line(poly(body)),
    );
  });
  if (depleted) {
    const hollow = blob(2, -7, 4, 3);
    nodes.push(
      fill(smoothClosed(hollow), pal.ramps.rock.shade),
      line(smoothClosed(hollow), 0.7, pal.inkSoft),
      fill(
        [blob(-20, -1, 1.6, 1.1), blob(21, 1.5, 1.4, 1), blob(-3, 2, 1.2, 0.9)]
          .map((b) => poly(b))
          .join(''),
        pal.ramps.rock.light,
      ),
    );
  } else {
    // Crystals set into the faces, and rust veins running down them.
    const gem = (x: number, y: number, w: number, h: number): Point[] =>
      pts([
        [x, y - h],
        [x + w, y],
        [x, y + h * 0.5],
        [x - w, y],
      ]);
    const gems = [
      gem(2, -27, 2.6, 5),
      gem(-12, -14, 2, 3.8),
      gem(14, -11, 1.8, 3.2),
      gem(5, -15, 1.6, 3),
    ];
    nodes.push(
      line(
        smoothOpen(
          pts([
            [0, -34],
            [-1, -26],
            [2, -18],
            [0, -9],
          ]),
        ) +
          smoothOpen(
            pts([
              [-13, -19],
              [-11, -12],
              [-13, -6],
            ]),
          ),
        1.4,
        pal.accents.coral.shade,
      ),
      fill(gems.map((g) => poly(g)).join(''), pal.accents.coral.base),
      line(gems.map((g) => poly(g)).join(''), 0.7, pal.accents.coral.shade),
    );
    all.push(...gems.flat());
  }
  return { nodes, box: boxOf(all) };
};

/** An ore outcrop: a tall rocky tor of stacked slabs with a rust bloom; depleted, grey with the top slab fallen. */
const oreOutcrop: FeatureDraw = (c, state) => {
  const { pts, fill, line, blob } = kit(c);
  const pal = c.palette;
  const depleted = state === 'depleted';
  const tiers: [number, number, number, number][] = depleted
    ? [
        [0, -4, 16, 5],
        [-1, -11, 12, 5],
      ]
    : [
        [0, -5, 17, 6],
        [-1, -15, 13, 6.5],
        [1, -25, 10, 6],
        [0, -34, 6, 4.5],
      ];
  const base = depleted ? pal.ramps.rock.light : pal.ramps.rock.base;
  const nodes: SvgNode[] = [groundShadow(c, 22, 5.5, 1)];
  const all: Point[] = [];
  tiers.forEach(([x, y, rx, ry], i) => {
    const b = blob(x, y, rx, ry * 1.5);
    all.push(...b);
    nodes.push(
      fill(smoothClosed(b), i % 2 ? pal.ramps.rock.light : base),
      fill(
        smoothClosed(blob(x + rx * 0.35, y + ry * 0.5, rx * 0.6, ry)),
        pal.ramps.rock.shade,
        0.45,
      ),
      line(smoothClosed(b)),
    );
  });
  if (depleted) {
    const fallen = blob(15, -3, 6, 3.4);
    all.push(...fallen);
    nodes.push(
      fill(smoothClosed(fallen), pal.ramps.rock.light),
      line(smoothClosed(fallen)),
      line(
        smoothOpen(
          pts([
            [-4, -15],
            [-1, -10],
            [-3, -5],
          ]),
        ),
        0.8,
        pal.inkSoft,
      ),
    );
  } else {
    const bloom = blob(-3, -17, 5, 3.4);
    nodes.push(
      fill(smoothClosed(bloom), pal.accents.coral.light, 0.9),
      line(
        smoothOpen(
          pts([
            [-9, -21],
            [-6, -15],
            [-8, -9],
          ]),
        ) +
          smoothOpen(
            pts([
              [5, -29],
              [7, -22],
              [4, -17],
            ]),
          ),
        1.4,
        pal.accents.coral.shade,
      ),
    );
  }
  return { nodes, box: boxOf(all) };
};

/** Tomb: a cave mouth in a tall mossy cliff face, a rolling stone before it; spent, the stone rolled aside. */
const tomb1: FeatureDraw = (c, state) => {
  const { pts, fill, line, blob } = kit(c);
  const pal = c.palette;
  const cliff = pts([
    [-24, 0],
    [-22, -14],
    [-17, -30],
    [-8, -38],
    [2, -34],
    [9, -41],
    [18, -30],
    [23, -14],
    [24, 0],
  ]);
  const face = pts([
    [9, -41],
    [18, -30],
    [23, -14],
    [24, 0],
    [9, 0],
    [8, -18],
    [5, -31],
  ]);
  const lit = pts([
    [-17, -30],
    [-8, -38],
    [-10, -26],
    [-19, -8],
    [-22, -14],
  ]);
  const moss = pts([
    [-17, -30],
    [-8, -38],
    [2, -34],
    [9, -41],
    [18, -30],
    [11, -34],
    [1, -30],
    [-8, -33],
  ]);
  const mouth = pts([
    [-8, 0],
    [-8, -12],
    [-5, -18],
    [0, -20],
    [5, -18],
    [8, -12],
    [8, 0],
  ]);
  const nodes: SvgNode[] = [
    groundShadow(c, 28, 6, 1),
    fill(poly(cliff), pal.ramps.rock.base),
    fill(poly(lit), pal.ramps.rock.light, 0.6),
    fill(poly(face), pal.ramps.rock.shade, 0.5),
    fill(poly(moss), pal.ramps.foliage.base, 0.85),
    line(poly(cliff)),
    line(
      smoothOpen(
        pts([
          [-14, -24],
          [-12, -17],
          [-15, -10],
        ]),
      ) +
        smoothOpen(
          pts([
            [14, -26],
            [16, -18],
            [13, -10],
          ]),
        ),
      0.8,
      pal.inkSoft,
    ),
    fill(smoothClosed(mouth), pal.inkSoft),
    line(smoothClosed(mouth)),
  ];
  const stoneAt = (x: number, y: number): SvgNode[] => {
    const s = blob(x, y, 7.5, 7.5);
    return [
      fill(smoothClosed(s), pal.ramps.stone.base),
      fill(smoothClosed(blob(x - 2, y - 2.5, 3, 2.2)), pal.ramps.stone.light, 0.9),
      line(smoothClosed(s)),
    ];
  };
  nodes.push(...(state === 'spent' ? stoneAt(17, -5) : stoneAt(0, -7)));
  return { nodes, box: boxOf(cliff) };
};

/** A deep tomb: a taller, darker crag with a carved lintel over a door shut by a spiral seal stone. */
const tomb2: FeatureDraw = (c, state) => {
  const { pts, fill, line, blob, T } = kit(c);
  const pal = c.palette;
  const crag = pts([
    [-27, 0],
    [-25, -16],
    [-19, -32],
    [-12, -38],
    [-6, -48],
    [3, -42],
    [10, -52],
    [20, -36],
    [26, -18],
    [27, 0],
  ]);
  const face = pts([
    [10, -52],
    [20, -36],
    [26, -18],
    [27, 0],
    [11, 0],
    [10, -22],
    [7, -40],
  ]);
  const jag = pts([
    [-6, -48],
    [-12, -38],
    [-19, -32],
    [-14, -22],
    [-9, -36],
  ]);
  const posts = [
    pts([
      [-11, 0],
      [-11, -23],
      [-8, -23],
      [-8, 0],
    ]),
    pts([
      [8, 0],
      [8, -23],
      [11, -23],
      [11, 0],
    ]),
  ];
  const lintel = pts([
    [-14, -23],
    [-14, -29],
    [14, -29],
    [14, -23],
  ]);
  const carving = pts([
    [-10, -26],
    [-7, -26],
    [-7, -24.5],
    [-3, -24.5],
    [-3, -27.5],
    [3, -27.5],
    [3, -24.5],
    [7, -24.5],
    [7, -26],
    [10, -26],
  ]);
  const door = pts([
    [-8, 0],
    [-8, -23],
    [8, -23],
    [8, 0],
  ]);
  const nodes: SvgNode[] = [
    groundShadow(c, 30, 7, 1),
    fill(poly(crag), pal.ramps.rock.shade),
    fill(poly(jag), pal.ramps.rock.base, 0.7),
    fill(poly(face), pal.ink, 0.22),
    line(poly(crag)),
    fill(poly(door), pal.inkSoft),
    fill(poly(posts[0]!) + poly(posts[1]!) + poly(lintel), pal.ramps.stone.light),
    line(poly(posts[0]!) + poly(posts[1]!) + poly(lintel)),
    line(poly(carving, false), 0.8, pal.inkSoft),
  ];
  const seal = (cx: number, cy: number): SvgNode[] => {
    const disc = blob(cx, cy, 8.4, 8.4);
    const spiral: Point[] = [];
    for (let i = 0; i <= 18; i += 1) {
      const a = i * 0.65;
      const r = 0.4 + i * 0.32;
      spiral.push(T(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    return [
      fill(smoothClosed(disc), pal.ramps.stone.base),
      line(smoothClosed(disc)),
      line(smoothOpen(spiral), 0.7, pal.inkSoft),
    ];
  };
  nodes.push(...(state === 'spent' ? seal(17, -7) : seal(0, -11)));
  return { nodes, box: boxOf(crag) };
};

/** A conifer at x, `h` tall: trunk and three stacked boughs, the right half shaded. */
function conifer(c: Parameters<FeatureDraw>[0], x: number, h: number, w: number): SvgNode[] {
  const { pts, fill, line } = kit(c);
  const pal = c.palette;
  const nodes: SvgNode[] = [
    fill(
      poly(
        pts([
          [x - 1.7, 0],
          [x - 1.4, -h * 0.3],
          [x + 1.4, -h * 0.3],
          [x + 1.7, 0],
        ]),
      ),
      pal.ramps.bark.base,
    ),
  ];
  for (let k = 0; k < 3; k += 1) {
    const by = -h * (0.2 + k * 0.24);
    const half = w * (1 - k * 0.27);
    const apex = by - h * 0.34;
    const bough = pts([
      [x - half, by],
      [x, apex],
      [x + half, by],
    ]);
    nodes.push(
      fill(poly(bough), k === 1 ? pal.ramps.foliage.light : pal.ramps.foliage.base),
      fill(
        poly(
          pts([
            [x, apex],
            [x + half, by],
            [x, by],
          ]),
        ),
        pal.ramps.foliage.shade,
        0.5,
      ),
      line(poly(bough)),
    );
  }
  return nodes;
}

/** A timber stand: three tall trees and a felled log; depleted, only stumps and chips. */
const timberStand: FeatureDraw = (c, state) => {
  const { pts, fill, line, blob } = kit(c);
  const pal = c.palette;
  const nodes: SvgNode[] = [groundShadow(c, 22, 5, 1)];
  const all: Point[] = pts([
    [-20, 3],
    [20, 3],
  ]);
  if (state === 'depleted') {
    for (const [x, w, h] of [
      [-10, 5, 7],
      [8, 4.5, 5.5],
    ] as const) {
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
    }
    nodes.push(
      fill(
        [blob(-1, 2, 1.6, 0.8), blob(15, 1.5, 1.4, 0.7)].map((b) => poly(b)).join(''),
        pal.ramps.sand.base,
      ),
    );
    return { nodes, box: boxOf(all) };
  }
  const trees: [number, number, number][] = [
    [-11, 36, 8.5],
    [3, 46, 10],
    [15, 33, 7.5],
  ];
  for (const [x, h, w] of trees) {
    nodes.push(...conifer(c, x, h, w));
    all.push(
      ...pts([
        [x, -h * 1.1],
        [x - w, 0],
        [x + w, 0],
      ]),
    );
  }
  // The felled log in front: a trunk side with its pale end and rings.
  const log = pts([
    [-14, -1],
    [-14, -7],
    [8, -6],
    [8, -1],
  ]);
  const end = blob(8, -3.5, 2.6, 3.6);
  nodes.push(
    fill(poly(log), pal.ramps.bark.base),
    line(poly(log)),
    fill(smoothClosed(end), pal.ramps.sand.light),
    line(smoothClosed(end), 0.8),
    line(smoothClosed(blob(8, -3.5, 1.1, 1.6)), 0.5, pal.ramps.bark.shade),
  );
  return { nodes, box: boxOf(all) };
};

/** Deadfall: a toppled big trunk with an upturned root plate; depleted, the plate and a short end. */
const deadfall: FeatureDraw = (c, state) => {
  const { pts, fill, line, blob } = kit(c);
  const pal = c.palette;
  const long = state !== 'depleted';
  const x1 = long ? 18 : 2;
  const trunk = pts([
    [-8, 0],
    [-8, -10],
    [x1, -9],
    [x1, 0],
  ]);
  const end = blob(x1, -4.5, 3, 4.6);
  const ph = long ? 17 : 10;
  const plate = blob(-11, -ph, long ? 9.5 : 6.5, ph);
  const nodes: SvgNode[] = [
    groundShadow(c, 24, 4.5, 1),
    fill(poly(trunk), pal.ramps.bark.base),
    line(poly(trunk)),
    line(
      smoothOpen(
        pts([
          [-4, -6],
          [4, -5],
          [x1 - 3, -6],
        ]),
      ),
      0.6,
      pal.ramps.bark.shade,
    ),
    fill(smoothClosed(end), pal.ramps.sand.light),
    line(smoothClosed(end), 0.8),
    fill(smoothClosed(plate), pal.ramps.bark.shade),
    fill(smoothClosed(blob(-10, -ph * 0.5, 6, ph * 0.5)), pal.ramps.earth.base, 0.8),
    line(smoothClosed(plate)),
    line(
      smoothOpen(
        pts([
          [-11, -ph * 1.9],
          [-14, -ph * 1.55],
          [-16, -ph * 1.3],
        ]),
      ) +
        smoothOpen(
          pts([
            [-9, -ph * 1.95],
            [-8, -ph * 1.6],
            [-5, -ph * 1.35],
          ]),
        ) +
        smoothOpen(
          pts([
            [-11, -ph],
            [-5, -ph * 0.7],
            [-3, -ph * 0.4],
          ]),
        ),
      1.1,
      pal.ramps.bark.shade,
    ),
  ];
  const all: Point[] = [...trunk, ...plate, ...pts([[-11, -ph * 1.95]])];
  if (long) {
    const stub = pts([
      [4, -9],
      [2, -17],
      [5, -17.5],
      [7, -9],
    ]);
    all.push(...stub);
    nodes.push(fill(poly(stub), pal.ramps.bark.base), line(poly(stub), 0.9));
  } else {
    nodes.push(
      fill(
        [blob(8, 1.5, 1.6, 0.7), blob(11, 0.8, 1.2, 0.6)].map((b) => poly(b)).join(''),
        pal.ramps.sand.base,
      ),
    );
  }
  return { nodes, box: boxOf(all) };
};

/** Sturdy river stones: a stacked cairn standing in the shallows; depleted, one stone and empty hollows. */
const riverStones: FeatureDraw = (c, state) => {
  const { fill, line, blob, pts } = kit(c);
  const pal = c.palette;
  const stones: [number, number, number, number][] =
    state === 'depleted'
      ? [[9, -3, 5, 3.6]]
      : [
          [-1, -5, 11, 5.4],
          [0, -13, 8.5, 4.8],
          [-1, -20, 6.2, 4],
          [0.5, -26, 4, 3.2],
          [-14, -2.5, 4.5, 3],
          [14, -2.5, 5, 3.2],
        ];
  const nodes: SvgNode[] = [groundShadow(c, 20, 4.5, 1)];
  nodes.push(
    line(
      smoothOpen(
        pts([
          [-22, 2],
          [-17, 0.5],
          [-12, 2],
        ]),
      ) +
        smoothOpen(
          pts([
            [12, 3],
            [17, 1.5],
            [22, 3],
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
        fill: 'none',
        stroke: pal.inkSoft,
        'stroke-width': c.ink * 0.7,
        'stroke-dasharray': `${(1.5 * c.k).toFixed(1)} ${(2.5 * c.k).toFixed(1)}`,
      }),
    );
  }
  const all: Point[] = pts([
    [-22, 3],
    [22, 3],
  ]);
  for (const [x, y, rx, ry] of stones) {
    const b = blob(x, y, rx, ry);
    all.push(...b);
    nodes.push(
      fill(smoothClosed(b), pal.ramps.stone.base),
      fill(
        smoothClosed(blob(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.25)),
        pal.ramps.stone.light,
        0.9,
      ),
      line(smoothClosed(b)),
    );
  }
  return { nodes, box: boxOf(all) };
};

/** Fieldstones: a dolmen of two uprights under a capstone and a standing stone; depleted, one left and a fallen slab. */
const fieldstones: FeatureDraw = (c, state) => {
  const { fill, line, blob, pts } = kit(c);
  const pal = c.palette;
  const menhir = (x: number, w: number, h: number): Point[] =>
    pts([
      [x - w, 0],
      [x - w * 0.9, -h * 0.8],
      [x - w * 0.3, -h],
      [x + w * 0.5, -h * 0.95],
      [x + w, -h * 0.7],
      [x + w, 0],
    ]);
  const nodes: SvgNode[] = [groundShadow(c, 20, 4.5, 1)];
  const all: Point[] = pts([
    [-20, 2],
    [20, 2],
  ]);
  const stone = (m: Point[], lit = false): SvgNode[] => [
    fill(poly(m), lit ? pal.ramps.sand.light : pal.ramps.stone.base),
    fill(poly([m[2]!, m[3]!, m[4]!, m[5]!, m[5]!, m[2]!]), pal.ramps.stone.shade, 0.4),
    line(poly(m)),
  ];
  const chisel = (x: number, y: number): SvgNode =>
    line(
      poly(
        pts([
          [x - 2, y],
          [x + 2, y - 0.8],
        ]),
        false,
      ) +
        poly(
          pts([
            [x - 1.5, y - 3],
            [x + 1.5, y - 3.6],
          ]),
          false,
        ),
      0.6,
      pal.inkSoft,
    );
  if (state === 'depleted') {
    const up = menhir(-6, 5, 22);
    const slab = pts([
      [4, 0.5],
      [5, -4],
      [19, -3.4],
      [19, 0.8],
    ]);
    all.push(...up, ...slab);
    nodes.push(
      ...stone(up),
      chisel(-6, -10),
      fill(poly(slab), pal.ramps.sand.light),
      line(poly(slab)),
    );
    return { nodes, box: boxOf(all) };
  }
  const left = menhir(-10, 5, 28);
  const right = menhir(8, 5, 26);
  const cap = pts([
    [-17, -26],
    [-15, -33],
    [15, -31],
    [16, -25],
    [0, -26.5],
  ]);
  const small = menhir(20, 3.6, 17);
  all.push(...left, ...right, ...cap, ...small);
  nodes.push(
    ...stone(left),
    ...stone(right),
    fill(poly(cap), pal.ramps.sand.light),
    line(poly(cap)),
    chisel(-10, -12),
    chisel(8, -10),
    ...stone(small),
    fill(smoothClosed(blob(-1, 1, 3, 0.9)), pal.ramps.foliage.base),
  );
  return { nodes, box: boxOf(all) };
};

/** A sunken shrine: a stone shrine with a tall spired roof half sunk in water; spent, the niche is empty and dark. */
const shrine: FeatureDraw = (c, state) => {
  const { fill, line, pts, blob } = kit(c);
  const pal = c.palette;
  const sq = c.squash / 0.6;
  const left = pts([
    [-10, 2],
    [-9.5, -22],
    [-5, -24],
    [-4.5, 2],
  ]);
  const right = pts([
    [10, 2],
    [9.5, -22],
    [5, -24],
    [4.5, 2],
  ]);
  const back = pts([
    [-5, 0],
    [-5, -24],
    [5, -24],
    [5, 0],
  ]);
  const roof = pts([
    [-15, -22],
    [0, -47],
    [15, -22],
    [9, -23.5],
    [-9, -23.5],
  ]);
  const roofShade = pts([
    [0, -47],
    [15, -22],
    [9, -23.5],
    [0, -23.5],
  ]);
  const niche = blob(0, -12, 3.4, 4.6);
  const pool = blob(0, -1, 18, 3.6 * sq);
  const nodes: SvgNode[] = [
    fill(smoothClosed(pool), pal.ramps.water.light, 0.8),
    fill(poly(back), pal.ramps.stone.shade),
    fill(poly(left), pal.ramps.stone.base),
    fill(poly(right), pal.ramps.stone.light),
    line(poly(left) + poly(right)),
    fill(smoothClosed(niche), state === 'spent' ? pal.inkSoft : pal.ramps.stone.shade),
    fill(poly(roof), pal.ramps.stone.light),
    fill(poly(roofShade), pal.ramps.stone.shade, 0.45),
    line(poly(roof)),
    // The finial on the tip.
    fill(
      ellipsePath(roof[1]!.x, roof[1]!.y - 2.2 * c.k, 1.6 * c.k, 1.6 * c.k),
      pal.accents.ochre.base,
    ),
    line(ellipsePath(roof[1]!.x, roof[1]!.y - 2.2 * c.k, 1.6 * c.k, 1.6 * c.k), 0.7),
  ];
  if (state !== 'spent') {
    const pearl = blob(0, -11.5, 2, 2);
    nodes.push(fill(smoothClosed(pearl), pal.paper), line(smoothClosed(pearl), 0.7));
  }
  // Half sunk: the water laps over the feet, with ripples.
  const lap = blob(0, 0.5, 15, 2.6 * sq);
  nodes.push(
    fill(smoothClosed(lap), pal.ramps.water.light, 0.78),
    line(smoothClosed(lap), 0.7, pal.ramps.water.shade),
  );
  if (state !== 'spent') {
    nodes.push(
      line(
        smoothOpen(
          pts([
            [-20, 3],
            [-16, 1.8],
            [-12, 3],
          ]),
        ) +
          smoothOpen(
            pts([
              [12, 3.5],
              [16, 2.3],
              [20, 3.5],
            ]),
          ),
        0.7,
        pal.ramps.water.shade,
      ),
    );
  }
  return { nodes, box: boxOf([...roof, ...pool, ...left, ...right]) };
};

/**
 * A water temple: two slim columns under a pediment with a round window, a dark doorway between them and a
 * pearl in it; no plinth, the water laps at its feet. Spent, the doorway is empty and the ripples still.
 */
const temple: FeatureDraw = (c, state) => {
  const { fill, line, pts, blob } = kit(c);
  const pal = c.palette;
  const sq = c.squash / 0.6;
  const column = (x: number) =>
    pts([
      [x - 3, 1],
      [x - 2.6, -23],
      [x + 2.6, -23],
      [x + 3, 1],
    ]);
  const left = column(-9);
  const right = column(9);
  const door = pts([
    [-5.5, 0],
    [-5.5, -17],
    [0, -21],
    [5.5, -17],
    [5.5, 0],
  ]);
  const beam = pts([
    [-15, -23],
    [-15, -27],
    [15, -27],
    [15, -23],
  ]);
  const pediment = pts([
    [-16, -27],
    [0, -41],
    [16, -27],
  ]);
  const pedimentShade = pts([
    [0, -41],
    [16, -27],
    [0, -27],
  ]);
  const nodes: SvgNode[] = [
    fill(smoothClosed(blob(0, -0.5, 17, 3.4 * sq)), pal.ramps.sea.light, 0.7),
    fill(poly(door), state === 'spent' ? pal.inkSoft : pal.ramps.stone.shade),
    fill(poly(left), pal.ramps.stone.base),
    fill(poly(right), pal.ramps.stone.light),
    fill(poly(beam), pal.ramps.stone.base),
    fill(poly(pediment), pal.ramps.stone.light),
    fill(poly(pedimentShade), pal.ramps.stone.shade, 0.45),
    line(poly(left) + poly(right) + poly(beam) + poly(pediment) + poly(door), 1),
    // The round window under the apex, in the sea's blue.
    fill(smoothClosed(blob(0, -31, 2.4, 2.4)), pal.ramps.sea.base),
    line(smoothClosed(blob(0, -31, 2.4, 2.4)), 0.7),
  ];
  if (state !== 'spent') {
    nodes.push(
      fill(smoothClosed(blob(0, -8, 2, 2)), pal.paper),
      line(smoothClosed(blob(0, -8, 2, 2)), 0.7),
    );
  }
  const lap = blob(0, 1, 14, 2.4 * sq);
  nodes.push(
    fill(smoothClosed(lap), pal.ramps.sea.light, 0.78),
    line(smoothClosed(lap), 0.7, pal.ramps.sea.shade),
  );
  if (state !== 'spent') {
    nodes.push(
      line(
        smoothOpen(
          pts([
            [-21, 3],
            [-17, 1.8],
            [-13, 3],
          ]),
        ) +
          smoothOpen(
            pts([
              [13, 3.5],
              [17, 2.3],
              [21, 3.5],
            ]),
          ),
        0.7,
        pal.ramps.sea.shade,
      ),
    );
  }
  return { nodes, box: boxOf([...pediment, ...left, ...right, ...lap]) };
};

/** Berry bushes: one tall bramble of arching canes, thick with leaves and berries; depleted, picked bare. */
const berryBushes: FeatureDraw = (c, state) => {
  const { fill, line, blob, pts } = kit(c);
  const pal = c.palette;
  const masses: [number, number, number, number][] = [
    [0, -20, 10, 18],
    [-9, -11, 8, 11],
    [9, -12, 8.5, 12],
    [-3, -30, 6, 8],
  ];
  const shapes = masses.map(([x, y, rx, ry]) => blob(x, y, rx, ry));
  const nodes: SvgNode[] = [groundShadow(c, 19, 4.5, 1)];
  const canes = line(
    smoothOpen(
      pts([
        [-4, 0],
        [-8, -14],
        [-6, -30],
        [-1, -38],
      ]),
    ) +
      smoothOpen(
        pts([
          [3, 0],
          [8, -16],
          [5, -32],
        ]),
      ) +
      smoothOpen(
        pts([
          [0, 0],
          [-1, -20],
          [3, -36],
        ]),
      ),
    1.3,
    pal.ramps.bark.shade,
  );
  if (state === 'depleted') {
    nodes.push(
      canes,
      ...shapes.map((b) => fill(smoothClosed(b), pal.ramps.foliage.shade, 0.3)),
      fill(
        [blob(-15, 1, 1.6, 0.8), blob(15, 0.8, 1.4, 0.7), blob(3, 1.5, 1.3, 0.7)]
          .map((b) => smoothClosed(b))
          .join(''),
        pal.ramps.foliage.shade,
        0.8,
      ),
    );
    return { nodes, box: boxOf([...shapes.flat()]) };
  }
  shapes.forEach((b, i) => {
    const [x, y, rx, ry] = masses[i]!;
    nodes.push(
      fill(smoothClosed(b), i === 3 ? pal.ramps.foliage.light : pal.ramps.foliage.base),
      fill(
        smoothClosed(blob(x + rx * 0.3, y + ry * 0.25, rx * 0.6, ry * 0.6)),
        pal.ramps.foliage.shade,
        0.45,
      ),
      line(smoothClosed(b)),
    );
  });
  nodes.push(canes);
  const clusters: [number, number][] = [
    [-9, -8],
    [-5, -18],
    [6, -14],
    [10, -7],
    [2, -26],
    [-4, -33],
    [0, -9],
  ];
  const berries = clusters.flatMap<[number, number]>(([x, y]) => [
    [x, y],
    [x + 2.5, y + 0.4],
    [x + 1.2, y - 2],
  ]);
  const dots = berries.map(([x, y]) => blob(x, y, 1.9, 1.8));
  nodes.push(
    fill(dots.map((d) => smoothClosed(d)).join(''), pal.accents.rose.base),
    line(dots.map((d) => smoothClosed(d)).join(''), 0.8, pal.accents.rose.shade),
    fill(
      berries.map(([x, y]) => smoothClosed(blob(x - 0.6, y - 0.6, 0.6, 0.5))).join(''),
      pal.paper,
      0.85,
    ),
  );
  return { nodes, box: boxOf([...shapes.flat()]) };
};

/** The brazier: the beacon cairn of `drawBrazier`, cold or lit (with the nights it has left). */
const brazier: FeatureDraw = (c, _state, art) =>
  drawBrazier(c.palette, {
    lit: art?.lit === true,
    ...(art?.nightsLeft === undefined ? {} : { nightsLeft: art.nightsLeft }),
    origin: c.origin,
    k: c.k,
    squash: c.squash,
    ink: c.ink,
    seed: c.rng.int(0, 1_000_000),
  });

export const TALL_DRAWERS: Readonly<Record<string, FeatureDraw>> = {
  ore: ironDeposit,
  stones: riverStones,
  logs: timberStand,
  tomb: tomb1,
  'deep-tomb': tomb2,
  berries: berryBushes,
  fieldstones,
  outcrop: oreOutcrop,
  deadfall,
  shrine,
  temple,
  brazier,
};
