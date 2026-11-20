/**
 * A lit fire on a hex: a ring of stones, crossed sticks, a two-tone flame with a warm glow on the ground,
 * and a wisp of smoke curling up. Drawn upright in side view like the props. Its parts carry
 * `data-fire="glow" | "flame" | "smoke"` so the map can make the flame flicker and the smoke drift.
 */
import { boxOf, ellipsePath, mapper, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import { inkAttrs, type PropDraw } from './props.ts';
import { el } from './svg.ts';

export const drawFire: PropDraw = (c) => {
  const pal = c.palette;
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  const sq = c.squash / 0.6;
  const pts = (raw: readonly (readonly [number, number])[]): Point[] =>
    raw.map(([x, y]) => T(x, y));
  const line = (d: string, scale = 1, colour = pal.ink) => ({
    d,
    ...inkAttrs(colour, c.ink * scale),
  });
  // A small sway so neighbouring fires do not match.
  const sway = c.rng.range(-1.2, 1.2);

  const glow = el('path', {
    d: ellipsePath(c.origin.x, c.origin.y, 13 * c.k, 5.5 * c.k * sq),
    fill: pal.accents.ochre.light,
    opacity: 0.55,
    'data-fire': 'glow',
  });
  // Ring stones: the back half first, then the sticks and flame, then the front half.
  const stones = Array.from({ length: 7 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 7 + 0.3;
    const x = Math.cos(a) * 8.5;
    const y = Math.sin(a) * 3.2 * sq;
    const r = i % 2 ? 2.1 : 2.6;
    return { y, d: ellipsePath(T(x, y).x, T(x, y).y - r * 0.5 * c.k, r * c.k, r * 0.72 * c.k) };
  });
  const back = stones.filter((s) => s.y < 0).map((s) => s.d);
  const front = stones.filter((s) => s.y >= 0).map((s) => s.d);
  const stoneNodes = (ds: string[]) =>
    ds.length
      ? [
          el('path', { d: ds.join(''), fill: pal.ramps.stone.light }),
          el('path', line(ds.join(''), 0.8)),
        ]
      : [];
  const sticks = [
    pts([
      [-7, -0.5],
      [6, -3.5],
    ]),
    pts([
      [-6, -3.2],
      [7, -0.2],
    ]),
  ];
  const flame = pts([
    [0, 0],
    [-5.5, -3],
    [-5, -9],
    [-1.5 + sway * 0.4, -13],
    [0.5 + sway, -19],
    [3 + sway * 0.6, -12],
    [5.5, -8],
    [5, -2.5],
  ]);
  const core = pts([
    [0, -1],
    [-2.6, -3.5],
    [-1.8, -8],
    [0.4 + sway * 0.5, -12.5],
    [2.2, -7.5],
    [2.6, -3],
  ]);
  const smoke = pts([
    [0.5 + sway, -21],
    [-2.5, -26],
    [1.5, -31],
    [-1, -36],
    [2.5, -40],
  ]);
  const spark = T(6 + sway, -16);
  const puffAt = [T(-1.5, -37), T(3, -43)];
  const puffs = puffAt
    .map((p, i) => ellipsePath(p.x, p.y, (2.6 + i) * c.k, (1.9 + i * 0.7) * c.k))
    .join('');
  return {
    nodes: [
      glow,
      ...stoneNodes(back),
      el('path', line(sticks.map((s) => poly(s, false)).join(''), 2.4, pal.ramps.bark.shade)),
      el('path', line(sticks.map((s) => poly(s, false)).join(''), 1, pal.ramps.bark.light)),
      el('path', { d: smoothClosed(flame), fill: pal.accents.coral.base, 'data-fire': 'flame' }),
      el('path', { d: smoothClosed(core), fill: pal.accents.ochre.light, 'data-fire': 'flame' }),
      el('path', {
        ...line(smoothClosed(flame), 0.9, pal.accents.coral.shade),
        'data-fire': 'flame',
      }),
      el('path', {
        d: ellipsePath(spark.x, spark.y, 0.9 * c.k, 0.9 * c.k),
        fill: pal.accents.ochre.base,
        'data-fire': 'flame',
      }),
      el('path', {
        ...line(smoothOpen(smoke), 2.4, pal.ramps.rock.light),
        opacity: 0.9,
        'data-fire': 'smoke',
      }),
      el('path', {
        ...line(smoothOpen(smoke), 1.5, pal.inkSoft),
        opacity: 0.8,
        'data-fire': 'smoke',
      }),
      el('path', {
        d: puffs,
        fill: pal.ramps.rock.light,
        stroke: pal.inkSoft,
        'stroke-width': c.ink * 0.8,
        opacity: 0.8,
        'data-fire': 'smoke',
      }),
      ...stoneNodes(front),
    ],
    box: boxOf([...flame, ...smoke, T(-13, 4), T(13, 4), T(7, -46)]),
  };
};
