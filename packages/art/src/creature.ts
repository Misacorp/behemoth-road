/**
 * The creature, drawn upright in side view from named parts chosen by a data object. Hand-tuned hero art:
 * coordinates are written by hand in local units (ground at y 0, facing right, about 150 units long).
 */
import { ART_TUNING } from './config.ts';
import { boxOf, ellipsePath, mapper, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { inkAttrs, type Drawn } from './props.ts';
import { el, type SvgNode } from './svg.ts';

export interface CreatureLook {
  readonly id: string;
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

export type CreatureFacing = 'left' | 'right' | 'away';

/**
 * Which way to draw the creature for a heading (an axial step): side view by the heading's east or west part.
 * Straight north uses `north`: the side view facing right, or the view from behind.
 */
export function facingFor(
  heading: { q: number; r: number },
  north: 'side' | 'away',
): CreatureFacing {
  if (heading.q > 0) return 'right';
  if (heading.q < 0) return 'left';
  return heading.r < 0 && north === 'away' ? 'away' : 'right';
}

export interface CreatureArt {
  /** Centre hex of its seven-hex footprint. */
  readonly q: number;
  readonly r: number;
  /** Side view to the left or right, or a three-quarter view from behind, walking up the screen. */
  readonly facing: CreatureFacing;
  readonly look: CreatureLook;
}

type Raw = readonly (readonly [number, number])[];

/** Local units span this many units from tail to snout. */
const LENGTH_UNITS = 150;

export function drawCreature(
  palette: Palette,
  look: CreatureLook,
  origin: Point,
  size: number,
  squash: number,
  ink: number,
  facing: CreatureFacing,
): Drawn {
  if (facing === 'away') return drawCreatureAway(palette, look, origin, size, squash, ink);
  const k = (size * ART_TUNING.creatureLength) / LENGTH_UNITS;
  const T = mapper(origin, k, facing === 'left' ? -1 : 1);
  const stretch = look.body === 'long' ? 1.15 : 1;
  const lift = look.legs === 'tall' ? 10 : -9;
  // Body-space points: stretched along x, lifted by the legs.
  const B = (x: number, y: number): Point => T(x * stretch, y - lift);
  const pts = (raw: Raw, map = B): Point[] => raw.map(([x, y]) => map(x, y));
  const hide = palette.ramps.hide;
  const w = ink * 1.1;
  const inkLine = (d: string, width = w, colour = palette.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, width) });
  const fill = (d: string, colour: string, opacity = 1): SvgNode =>
    el('path', opacity === 1 ? { d, fill: colour } : { d, fill: colour, opacity });
  const nodes: SvgNode[] = [];
  const everything: Point[] = [];

  // Shadow.
  nodes.push(
    fill(
      ellipsePath(origin.x, origin.y, 62 * k * stretch, 10 * k * (squash / 0.6)),
      palette.shadow,
      0.18,
    ),
  );

  // Legs: the far pair first, in shade.
  const legLen = 36 + lift;
  const leg = (x: number): Raw => [
    [x - 9.5, -legLen],
    [x + 9.5, -legLen],
    [x + 8.4, -9],
    [x + 9.2, -2],
    [x + 5, 0.4],
    [x - 5, 0.4],
    [x - 9.2, -2],
    [x - 8.4, -9],
  ];
  const legPts = (x: number): Point[] => pts(leg(x * stretch), T);
  for (const x of [-27, 27]) {
    const p = legPts(x);
    everything.push(...p);
    nodes.push(fill(smoothClosed(p), hide.shade), inkLine(smoothClosed(p)));
  }

  // Tail, behind the body.
  if (look.tail === 'tuft') {
    const tail = pts([
      [-46, -52],
      [-56, -49],
      [-63, -41],
      [-65, -33],
      [-61, -33],
      [-58, -40],
      [-50, -45],
    ]);
    const tip = B(-63.5, -30.5);
    everything.push(...tail, tip);
    nodes.push(fill(smoothClosed(tail), hide.base), inkLine(smoothClosed(tail)));
    const tuft = pts([
      [-63.5, -36],
      [-59, -31],
      [-61, -25],
      [-66, -24],
      [-68.5, -29],
    ]);
    nodes.push(fill(smoothClosed(tuft), palette.marking), inkLine(smoothClosed(tuft)));
  } else {
    const tail = pts([
      [-46, -50],
      [-56, -46],
      [-58, -42],
      [-48, -42],
    ]);
    everything.push(...tail);
    nodes.push(fill(smoothClosed(tail), hide.base), inkLine(smoothClosed(tail)));
  }

  // Body.
  const bodyRaw: Raw = [
    [-50, -46],
    [-44, -66],
    [-24, -80],
    [2, -83],
    [26, -77],
    [42, -62],
    [46, -45],
    [36, -31],
    [10, -26],
    [-20, -27],
    [-42, -32],
  ];
  const body = pts(bodyRaw);
  everything.push(...body);
  nodes.push(fill(smoothClosed(pts(bodyRaw.map(([x, y]) => [x + 0.8, y + 0.6]))), hide.base));
  nodes.push(
    fill(
      smoothClosed(
        pts([
          [-40, -35],
          [-20, -29.5],
          [10, -28.5],
          [34, -33.5],
          [30, -39],
          [6, -35],
          [-20, -36],
          [-38, -40],
        ]),
      ),
      palette.belly,
      0.85,
    ),
  );
  nodes.push(
    fill(
      smoothClosed(
        pts([
          [-38, -61],
          [-22, -75],
          [0, -78.5],
          [-4, -71],
          [-22, -65],
          [-34, -55],
        ]),
      ),
      hide.light,
      0.75,
    ),
  );
  nodes.push(
    fill(
      smoothClosed(
        pts([
          [-49, -45],
          [-45, -35],
          [-32, -30],
          [-38, -37],
          [-45, -47],
        ]),
      ),
      hide.shade,
      0.5,
    ),
  );

  // Markings.
  if (look.markings === 'spots') {
    const spots: [number, number, number, number][] = [
      [-30, -67, 5, 3.4],
      [-14, -74, 6, 3.8],
      [4, -75.5, 5.4, 3.6],
      [20, -70, 4.4, 3.1],
      [-22, -57, 3, 2.1],
      [8, -64, 3.4, 2.4],
      [-4, -66, 2.4, 1.7],
    ];
    const d = spots
      .map(([x, y, rx, ry]) => {
        const c = B(x, y);
        return ellipsePath(c.x, c.y, rx * k * stretch, ry * k);
      })
      .join('');
    nodes.push(fill(d, palette.marking, 0.7));
  } else if (look.markings === 'stripes') {
    const d = [-30, -16, -2, 12, 26]
      .map((x) =>
        smoothClosed(
          pts([
            [x - 3, -78 + Math.abs(x) * 0.08],
            [x + 3, -78 + Math.abs(x) * 0.08],
            [x + 5, -60],
            [x + 1, -58],
          ]),
        ),
      )
      .join('');
    nodes.push(fill(d, palette.marking, 0.6));
  }
  nodes.push(inkLine(smoothClosed(body)));

  // Near legs over the body.
  for (const x of [-36, 16]) {
    const p = legPts(x);
    everything.push(...p);
    const toes = [x - 3.2, x + 0.6, x + 4.2]
      .map((tx) => poly([T(tx * stretch, 0), T(tx * stretch, -2.6)], false))
      .join('');
    const open = smoothOpen([p[1]!, ...p.slice(2), p[0]!]);
    nodes.push(
      fill(smoothClosed(p), hide.base),
      inkLine(open),
      inkLine(toes, w * 0.7, palette.inkSoft),
    );
  }

  // Back garden: a sapling and tufts growing on its back.
  if (look.back === 'garden') {
    const trunk = pts([
      [-6.6, -82.5],
      [-6, -92],
      [-4.6, -92],
      [-4, -82.5],
    ]);
    const lobes: Raw[] = [
      [
        [-16, -95],
        [-13, -101],
        [-7, -101],
        [-6, -95],
        [-11, -92],
      ],
      [
        [-6, -96],
        [-3, -102],
        [3, -101],
        [5, -95],
        [-1, -92],
      ],
      [
        [-12, -101],
        [-8, -108],
        [-1, -108],
        [1, -101],
        [-6, -98],
      ],
    ];
    const crowns = lobes.map((l) => pts(l));
    everything.push(...crowns.flat());
    nodes.push(fill(poly(trunk), palette.ramps.bark.base), inkLine(poly(trunk), w * 0.7));
    for (const crown of crowns) {
      nodes.push(
        fill(smoothClosed(crown), palette.ramps.foliage.base),
        inkLine(smoothClosed(crown), w * 0.8),
      );
    }
    nodes.push(
      fill(
        smoothClosed(
          pts([
            [-9, -104],
            [-6, -106],
            [-3, -105],
            [-5, -102],
          ]),
        ),
        palette.ramps.foliage.light,
        0.85,
      ),
    );
    const blades: string[] = [];
    for (const [bx, by] of [
      [-26, -78.5],
      [14, -80],
      [28, -74],
    ] as const) {
      for (let i = -1; i <= 1; i += 1) {
        blades.push(
          smoothOpen([B(bx + i * 1.6, by), B(bx + i * 2.4, by - 4), B(bx + i * 3.6, by - 7)]),
        );
      }
    }
    nodes.push(inkLine(blades.join(''), w * 0.65, palette.inkSoft));
    const f1 = B(-20, -80);
    const f2 = B(20, -78.5);
    nodes.push(
      fill(ellipsePath(f1.x, f1.y, 1.8 * k, 1.8 * k), palette.accents.rose.base),
      fill(ellipsePath(f2.x, f2.y, 1.6 * k, 1.6 * k), palette.accents.ochre.base),
    );
  }

  // Neck: fill over the body's outline at the join, ink only on the top and bottom.
  const neck = pts([
    [28, -74],
    [46, -73],
    [58, -67],
    [56, -52],
    [46, -45],
    [34, -48],
  ]);
  everything.push(...neck);
  nodes.push(fill(smoothClosed(neck), hide.base));
  nodes.push(
    inkLine(
      smoothOpen(
        pts([
          [34, -75.5],
          [46, -73],
          [55, -69],
        ]),
      ) +
        smoothOpen(
          pts([
            [56, -53],
            [52, -48.5],
            [48, -46.5],
          ]),
        ),
    ),
  );

  // Far ear, behind the head.
  if (look.ears === 'leaf') {
    const farEar = pts([
      [59, -72.5],
      [53, -78],
      [45.5, -81],
      [50, -75],
      [55.5, -70.5],
    ]);
    nodes.push(fill(smoothClosed(farEar), hide.shade), inkLine(smoothClosed(farEar)));
    everything.push(...farEar);
  }

  // Head.
  const headRaw: Raw = [
    [50, -64],
    [54, -72],
    [64, -76],
    [75, -72],
    [83, -64],
    [86, -57],
    [82, -51],
    [72, -48.5],
    [60, -50],
    [52, -55],
  ];
  const head = pts(headRaw);
  everything.push(...head);
  nodes.push(fill(smoothClosed(head), hide.base));
  nodes.push(
    fill(
      smoothClosed(
        pts([
          [74, -60],
          [82, -61],
          [85.5, -56],
          [81, -51.5],
          [73, -51],
          [71, -55],
        ]),
      ),
      palette.belly,
      0.85,
    ),
  );
  nodes.push(
    fill(
      smoothClosed(
        pts([
          [56, -69],
          [63, -73.5],
          [70, -72],
          [64, -69],
        ]),
      ),
      hide.light,
      0.7,
    ),
  );
  nodes.push(inkLine(smoothClosed(head)));

  // Horns: two small rounded nubs.
  if (look.horns === 'nubs') {
    for (const [hx, hy] of [
      [69.5, -74.8],
      [75.5, -71.8],
    ] as const) {
      const nub = pts([
        [hx - 1.9, hy + 0.8],
        [hx - 1.4, hy - 2.6],
        [hx + 0.4, hy - 3.8],
        [hx + 1.8, hy - 2.5],
        [hx + 1.9, hy + 0.6],
      ]);
      everything.push(...nub);
      nodes.push(fill(smoothClosed(nub), palette.horn), inkLine(smoothClosed(nub), w * 0.8));
    }
  }

  // Near ear, drooping back over the neck.
  if (look.ears === 'leaf') {
    const ear = pts([
      [58, -71],
      [50, -76],
      [41, -78],
      [46, -72],
      [54, -67.5],
    ]);
    const inner = pts([
      [55, -70.5],
      [49, -74.5],
      [45, -75.5],
      [49, -72],
    ]);
    everything.push(...ear);
    nodes.push(
      fill(smoothClosed(ear), hide.base),
      fill(smoothClosed(inner), palette.accents.rose.light, 0.8),
      inkLine(smoothClosed(ear)),
    );
  } else {
    const c = B(56, -73);
    nodes.push(
      fill(ellipsePath(c.x, c.y, 5 * k, 5 * k), hide.base),
      inkLine(ellipsePath(c.x, c.y, 5 * k, 5 * k)),
    );
  }

  // Face: a content, half-closed eye, a cheek, a nostril and a small smile.
  nodes.push(
    inkLine(
      smoothOpen(
        pts([
          [63.5, -63.5],
          [67.2, -60.8],
          [71, -63.5],
        ]),
      ),
      w * 1.05,
    ),
  );
  nodes.push(
    inkLine(
      poly(
        pts([
          [63, -66.5],
          [61.8, -67.8],
        ]),
        false,
      ) +
        poly(
          pts([
            [66.5, -67.4],
            [66.3, -69],
          ]),
          false,
        ),
      w * 0.6,
      palette.inkSoft,
    ),
  );
  const cheek = B(68.5, -56);
  nodes.push(
    fill(ellipsePath(cheek.x, cheek.y, 3.6 * k, 2.2 * k), palette.accents.rose.base, 0.45),
  );
  const nostril = B(82.6, -58.2);
  nodes.push(fill(ellipsePath(nostril.x, nostril.y, 0.9 * k, 0.7 * k), palette.ink));
  nodes.push(
    inkLine(
      smoothOpen(
        pts([
          [76, -53],
          [79, -52],
          [81.6, -53.6],
        ]),
      ),
      w * 0.8,
    ),
  );

  return { nodes, box: boxOf(everything) };
}

/**
 * The creature from behind and a little to the right, walking up the screen: its rump and hind legs in front,
 * the back and its garden on top, the head small beyond. Same parts and colours as the side view.
 */
function drawCreatureAway(
  palette: Palette,
  look: CreatureLook,
  origin: Point,
  size: number,
  squash: number,
  ink: number,
): Drawn {
  const k = (size * ART_TUNING.creatureLength) / LENGTH_UNITS;
  const widen = look.body === 'long' ? 1.05 : 1;
  const lift = look.legs === 'tall' ? 10 : -7;
  const T = mapper(origin, k);
  const B = (x: number, y: number): Point => T(x * widen, y - lift);
  const pts = (raw: Raw, map = B): Point[] => raw.map(([x, y]) => map(x, y));
  // Head parts are drawn around (34, -94); this places them behind the back, a little right of centre.
  const H = (x: number, y: number): Point => B(18 + (x - 34) * 1.15, -95 + (y + 94) * 1.15);
  const hide = palette.ramps.hide;
  const w = ink * 1.1;
  const inkLine = (d: string, width = w, colour = palette.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, width) });
  const fill = (d: string, colour: string, opacity = 1): SvgNode =>
    el('path', opacity === 1 ? { d, fill: colour } : { d, fill: colour, opacity });
  const nodes: SvgNode[] = [];
  const everything: Point[] = [];
  const sq = squash / 0.6;

  nodes.push(
    fill(
      ellipsePath(origin.x + 4 * k, origin.y - 8 * k * sq, 48 * k, 16 * k * sq),
      palette.shadow,
      0.18,
    ),
  );

  // Front legs, further up the ground and mostly hidden.
  for (const x of [-16, 26]) {
    const footY = -16 * sq;
    const leg = pts(
      [
        [x - 8, -50],
        [x + 8, -50],
        [x + 7.5, footY - 4],
        [x + 4.5, footY + 0.4],
        [x - 4.5, footY + 0.4],
        [x - 7.5, footY - 4],
      ],
      T,
    );
    everything.push(...leg);
    nodes.push(fill(smoothClosed(leg), hide.shade), inkLine(smoothClosed(leg)));
  }

  // Head beyond the body, turned a little to the right: the back of the head, ears, nubs and a snout tip.
  const headRaw: Raw = [
    [20, -96],
    [26, -103],
    [36, -104],
    [44, -99],
    [48, -92],
    [44, -86],
    [32, -84],
    [22, -88],
  ];
  if (look.ears === 'leaf') {
    for (const ear of [
      [
        [24, -98],
        [15, -101],
        [8, -99],
        [14, -95],
        [22, -94],
      ],
      [
        [42, -98],
        [51, -103],
        [58, -102],
        [53, -97],
        [45, -94],
      ],
    ] as Raw[]) {
      const e = pts(ear, H);
      everything.push(...e);
      nodes.push(fill(smoothClosed(e), hide.base), inkLine(smoothClosed(e)));
    }
  }
  const head = pts(headRaw, H);
  everything.push(...head);
  const snout = pts(
    [
      [44, -94],
      [48.5, -93],
      [49, -89],
      [45, -87.5],
    ],
    H,
  );
  nodes.push(fill(smoothClosed(snout), palette.belly), inkLine(smoothClosed(snout), w * 0.9));
  nodes.push(fill(smoothClosed(head), hide.base));
  nodes.push(
    fill(
      smoothClosed(
        pts(
          [
            [26, -99],
            [33, -102],
            [38, -100],
            [31, -97],
          ],
          H,
        ),
      ),
      hide.light,
      0.7,
    ),
  );
  nodes.push(inkLine(smoothClosed(head)));
  if (look.horns === 'nubs') {
    for (const [hx, hy] of [
      [29, -103],
      [38, -103],
    ] as const) {
      const nub = pts(
        [
          [hx - 1.9, hy + 0.8],
          [hx - 1.4, hy - 2.6],
          [hx + 0.4, hy - 3.8],
          [hx + 1.8, hy - 2.5],
          [hx + 1.9, hy + 0.6],
        ],
        H,
      );
      everything.push(...nub);
      nodes.push(fill(smoothClosed(nub), palette.horn), inkLine(smoothClosed(nub), w * 0.8));
    }
  }

  // Body: a round back seen from behind, wider at the rump.
  const bodyRaw: Raw = [
    [-44, -38],
    [-46, -60],
    [-34, -80],
    [-10, -91],
    [16, -92],
    [38, -84],
    [50, -66],
    [48, -42],
    [34, -24],
    [6, -18],
    [-24, -22],
  ];
  const body = pts(bodyRaw);
  everything.push(...body);
  nodes.push(fill(smoothClosed(body), hide.base));
  nodes.push(
    fill(
      smoothClosed(
        pts([
          [-36, -66],
          [-24, -82],
          [-4, -88],
          [-8, -80],
          [-24, -72],
          [-32, -58],
        ]),
      ),
      hide.light,
      0.75,
    ),
  );
  nodes.push(
    fill(
      smoothClosed(
        pts([
          [-42, -38],
          [-26, -24],
          [4, -20],
          [32, -26],
          [44, -40],
          [30, -32],
          [2, -28],
          [-24, -31],
        ]),
      ),
      hide.shade,
      0.5,
    ),
  );
  if (look.markings === 'spots') {
    const spots: [number, number, number, number][] = [
      [-22, -72, 5.6, 3.2],
      [-2, -80, 6.4, 3.4],
      [20, -80, 5.4, 3],
      [34, -68, 4.2, 3],
      [-30, -56, 3.4, 2.4],
      [8, -66, 3.6, 2.2],
    ];
    nodes.push(
      fill(
        spots
          .map(([x, y, rx, ry]) => {
            const c = B(x, y);
            return ellipsePath(c.x, c.y, rx * k, ry * k);
          })
          .join(''),
        palette.marking,
        0.7,
      ),
    );
  } else if (look.markings === 'stripes') {
    const d = [-24, -6, 12, 30]
      .map((x) =>
        smoothClosed(
          pts([
            [x - 3, -88 + Math.abs(x - 4) * 0.2],
            [x + 3, -88 + Math.abs(x - 4) * 0.2],
            [x + 6, -64],
            [x + 2, -62],
          ]),
        ),
      )
      .join('');
    nodes.push(fill(d, palette.marking, 0.6));
  }
  nodes.push(inkLine(smoothClosed(body)));

  if (look.back === 'garden') {
    const trunk = pts([
      [-13.6, -86],
      [-13, -96],
      [-11.6, -96],
      [-11, -86],
    ]);
    const lobes = (
      [
        [
          [-22, -98],
          [-19, -104],
          [-13, -104],
          [-12, -98],
          [-17, -95],
        ],
        [
          [-13, -99],
          [-10, -105],
          [-4, -104],
          [-2, -98],
          [-8, -95],
        ],
        [
          [-18, -104],
          [-14, -111],
          [-7, -111],
          [-5, -104],
          [-12, -101],
        ],
      ] as Raw[]
    ).map((l) => pts(l));
    everything.push(...lobes.flat());
    nodes.push(fill(poly(trunk), palette.ramps.bark.base), inkLine(poly(trunk), w * 0.7));
    for (const crown of lobes) {
      nodes.push(
        fill(smoothClosed(crown), palette.ramps.foliage.base),
        inkLine(smoothClosed(crown), w * 0.8),
      );
    }
    const blades: string[] = [];
    for (const [bx, by] of [
      [-22, -84],
      [24, -88],
    ] as const) {
      for (let i = -1; i <= 1; i += 1) {
        blades.push(
          smoothOpen([B(bx + i * 1.6, by), B(bx + i * 2.4, by - 4), B(bx + i * 3.6, by - 7)]),
        );
      }
    }
    nodes.push(inkLine(blades.join(''), w * 0.65, palette.inkSoft));
    const f1 = B(-14, -86);
    const f2 = B(32, -84);
    nodes.push(
      fill(ellipsePath(f1.x, f1.y, 1.8 * k, 1.8 * k), palette.accents.rose.base),
      fill(ellipsePath(f2.x, f2.y, 1.6 * k, 1.6 * k), palette.accents.ochre.base),
    );
  }

  // Hind legs in front: heavy, with the soles' pads just showing.
  const legLen = 36 + lift;
  for (const x of [-22, 22]) {
    const leg = pts(
      [
        [x - 12.5, -legLen],
        [x + 12.5, -legLen],
        [x + 11, -8],
        [x + 11.5, -2],
        [x + 6.5, 0.4],
        [x - 6.5, 0.4],
        [x - 11.5, -2],
        [x - 11, -8],
      ],
      T,
    );
    everything.push(...leg);
    const open = smoothOpen([leg[1]!, ...leg.slice(2), leg[0]!]);
    const pad = T(x, -2.4);
    nodes.push(
      fill(smoothClosed(leg), hide.base),
      fill(ellipsePath(pad.x, pad.y, 6 * k, 2 * k), palette.belly, 0.9),
      inkLine(open),
    );
  }

  // Tail hanging down the middle of the rump.
  if (look.tail === 'tuft') {
    const tail = pts([
      [-3, -52],
      [2, -52],
      [3, -40],
      [1, -32],
      [-2, -32],
      [-3, -42],
    ]);
    const tuft = pts([
      [-4.5, -34],
      [3.5, -34],
      [5, -27],
      [0, -23],
      [-5, -27],
    ]);
    everything.push(...tail, ...tuft);
    nodes.push(
      fill(smoothClosed(tail), hide.base),
      inkLine(smoothClosed(tail)),
      fill(smoothClosed(tuft), palette.marking),
      inkLine(smoothClosed(tuft)),
    );
  } else {
    const tail = pts([
      [-3, -52],
      [3, -52],
      [2, -44],
      [-2, -44],
    ]);
    everything.push(...tail);
    nodes.push(fill(smoothClosed(tail), hide.base), inkLine(smoothClosed(tail)));
  }

  return { nodes, box: boxOf(everything) };
}
