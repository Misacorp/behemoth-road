/**
 * The motifs inside trait and quirk icons, on the 48-unit grid (centre 24, 24; within a radius of about
 * 13), keyed by the `icon` names content uses. Ink lines on small washes, like the role emblems.
 */
import { ellipsePath, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { el, type SvgNode } from './svg.ts';

export type IconMotif = (palette: Palette) => SvgNode[];

const P = (x: number, y: number): Point => ({ x, y });
const INK = 2.1;

export function ink(palette: Palette, d: string, width = INK, colour?: string): SvgNode {
  return el('path', {
    d,
    fill: 'none',
    stroke: colour ?? palette.ink,
    'stroke-width': width,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
}

export function solid(palette: Palette, d: string, fill: string, width = INK): SvgNode {
  return el('path', {
    d,
    fill,
    stroke: palette.ink,
    'stroke-width': width,
    'stroke-linejoin': 'round',
  });
}

/** A leaf from (x, y) pointing at angle `a`, `l` long, as path data. */
export function leafPath(x: number, y: number, a: number, l: number): string {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = (u: number, v: number): Point => P(x + u * c - v * s, y + u * s + v * c);
  return smoothClosed([t(0, 0), t(l * 0.45, -l * 0.26), t(l, 0), t(l * 0.45, l * 0.26)]);
}

/** A sprig of three herb leaves on a curving stem. */
export const sprig: IconMotif = (pal) => [
  ink(pal, smoothOpen([P(17, 36), P(22, 28), P(24, 21), P(25, 12)])),
  solid(pal, leafPath(22.6, 27.5, -2.55, 11.5), pal.ramps.foliage.base, 1.8),
  solid(pal, leafPath(24, 21, -0.5, 11.5), pal.ramps.foliage.base, 1.8),
  solid(pal, leafPath(25, 13.5, -1.6, 9), pal.ramps.foliage.light, 1.8),
];

/** A rolled scroll with a hanging seal. */
export const scroll: IconMotif = (pal) => [
  solid(pal, 'M14 17h20v13H14z', pal.paper),
  solid(pal, ellipsePath(14, 23.5, 2.6, 6.5), pal.ramps.stone.light, 1.8),
  solid(pal, ellipsePath(34, 23.5, 2.6, 6.5), pal.ramps.stone.light, 1.8),
  ink(pal, 'M18.5 21.5h11M18.5 25.5h8', 1.4, pal.inkSoft),
  ink(pal, 'M27 30l-1 6M29 30l2 5.5', 1.6, pal.accents.rose.shade),
  solid(pal, ellipsePath(28, 30.5, 2.8, 2.8), pal.accents.rose.base, 1.6),
];

/** Material motifs by content icon key: what the team gathers. */
export const MATERIAL_MOTIFS: Readonly<Record<string, IconMotif>> = {
  iron: (pal) => [
    solid(pal, 'M12 31l4-10h16l4 10z', pal.ramps.rock.base),
    solid(pal, 'M16 21l2-4h12l2 4z', pal.ramps.rock.light, 1.8),
    ink(pal, 'M18 27h6M27 25.5h4', 1.3, pal.accents.coral.shade),
  ],
  stone: (pal) => [
    solid(pal, 'M11 32c0-4 4-7 9-7s9 3 9 6-4 4-9 4-9-1-9-3z', pal.ramps.stone.base),
    solid(pal, 'M21 24c0-4 4-7 8-7s8 3 8 6-3 5-8 5-8-1-8-4z', pal.ramps.stone.light),
    ink(pal, 'M24 20.5c1.5-1 3.5-1.3 5-1', 1.3, pal.paper),
  ],
  timber: (pal) => [
    solid(pal, 'M12 30l20-11 4 6-20 11z', pal.ramps.bark.base),
    solid(pal, ellipsePath(14, 33, 3.6, 3.6), pal.ramps.sand.light, 1.8),
    ink(pal, ellipsePath(14, 33, 1.5, 1.5), 1, pal.ramps.bark.shade),
    ink(pal, 'M22 26l3 1.5M27 23l3 1.5', 1.2, pal.ramps.bark.shade),
    solid(pal, leafPath(30, 19, -1.2, 7), pal.ramps.foliage.base, 1.5),
  ],
  // Old coin: a short stack of worn coins and one standing, a faint crest on its face.
  coin: (pal) => [
    solid(pal, ellipsePath(18, 33, 8, 3), pal.accents.ochre.base, 1.8),
    solid(
      pal,
      'M10 30v3c0 1.7 3.6 3 8 3s8-1.3 8-3v-3c0 1.7-3.6 3-8 3s-8-1.3-8-3z',
      pal.accents.ochre.shade,
      1.6,
    ),
    solid(pal, ellipsePath(18, 28.5, 8, 3), pal.accents.ochre.light, 1.8),
    solid(pal, ellipsePath(31, 22, 6.5, 8.5), pal.accents.ochre.base),
    ink(pal, ellipsePath(31, 22, 4.2, 5.8), 1.1, pal.accents.ochre.shade),
    ink(pal, 'M29 21.5l2-2.5 2 2.5M31 19v6', 1.2, pal.accents.ochre.shade),
  ],
  // Forage: a sprig of berries with a leaf, the food the creature is fed.
  forage: (pal) => [
    ink(pal, smoothOpen([P(30, 11), P(27, 16), P(24, 21)]), 1.6, pal.ramps.bark.shade),
    ink(pal, 'M27 16l-7 3M27.5 15l3 6', 1.4, pal.ramps.bark.shade),
    solid(pal, leafPath(30, 12, -0.3, 9), pal.ramps.foliage.base, 1.6),
    ...[
      [22, 24, 4.4],
      [28.5, 25, 4],
      [18, 21, 3.4],
      [25, 30.5, 4.2],
      [31.5, 21.5, 3.2],
      [19, 29, 3.6],
    ].map(([x, y, r]) => solid(pal, ellipsePath(x!, y!, r!, r!), pal.accents.rose.base, 1.6)),
    el('path', {
      d: [
        [21, 23],
        [27.5, 24],
        [24, 29.5],
        [18, 28],
      ]
        .map(([x, y]) => ellipsePath(x!, y!, 1, 0.9))
        .join(''),
      fill: pal.paper,
      opacity: 0.85,
    }),
  ],
  alloy: (pal) => [
    solid(pal, 'M12 30l5-11h14l5 11-12 5z', pal.accents.teal.light),
    solid(pal, 'M17 19l7 5 7-5M24 24v11', pal.accents.teal.base, 1.6),
    ink(
      pal,
      smoothOpen([
        P(21.5, 29),
        P(22.5, 27.5),
        P(24, 28),
        P(23.5, 30),
        P(21.5, 30.5),
        P(20, 28.5),
        P(21.5, 26),
      ]),
      1.1,
      pal.accents.teal.shade,
    ),
    ink(pal, 'M35 12v4M33 14h4M11 15v3M9.5 16.5h3', 1.3, pal.hint),
  ],
};

/** Action motifs by key: what a character does, on a round tile with a dashed inner ring. */
export const ACTION_MOTIFS: Readonly<Record<string, IconMotif>> = {
  // Light a fire: crossed sticks, a flame and a spark.
  'light-fire': (pal) => [
    ink(pal, 'M13 36l20-7M15 29l20 7', 3.6, pal.ramps.bark.shade),
    ink(pal, 'M13 36l20-7M15 29l20 7', 1.4, pal.ramps.bark.light),
    solid(
      pal,
      'M24 31c-5 0-8-3-8-7 0-4 3-6 4-10 1 3 3 4 3 4 0-4 2-7 5-9 0 4 4 6 4 11 0 6-3 11-8 11z',
      pal.accents.coral.base,
      1.8,
    ),
    el('path', {
      d: 'M24 30c-2.5 0-4-1.6-4-4 0-2.4 2-3.6 2.4-6 1.4 1.4 1.6 2.4 1.6 2.4.4-1.6 1.4-3 2.6-3.6.4 2.4 1.6 3.6 1.6 6 0 3-2 5.2-4.2 5.2z',
      fill: pal.accents.ochre.light,
    }),
    solid(pal, ellipsePath(35, 13, 1.4, 1.4), pal.accents.ochre.base, 1.2),
  ],
  // Feed: a wooden bowl heaped with berries, offered up (two lift lines).
  feed: (pal) => [
    ...[
      [19.5, 24, 3.4],
      [24.5, 22, 3.6],
      [29, 24.5, 3.2],
      [22, 26.5, 3],
      [27, 26.8, 3],
    ].map(([x, y, r]) => solid(pal, ellipsePath(x!, y!, r!, r!), pal.accents.rose.base, 1.5)),
    solid(pal, leafPath(25, 19, -0.9, 7), pal.ramps.foliage.base, 1.4),
    solid(pal, 'M11 27h26c0 6-6 10-13 10s-13-4-13-10z', pal.ramps.bark.base),
    ink(pal, 'M14.5 31c3 2 6 2.6 9.5 2.6', 1.2, pal.ramps.bark.light),
    ink(pal, 'M12 14.5l2.5 3M36 14.5l-2.5 3', 1.6, pal.inkSoft),
  ],
  // Linger: the creature lying down, legs tucked, head resting on the ground; eyes closed.
  linger: (pal) => [
    ink(pal, 'M9 35.5h30', 1.4, pal.inkSoft),
    solid(pal, 'M10 35c0-8 6-14 14-14 6 0 9 4 10 8l2 1c2 1 3 3 3 5z', pal.ramps.hide.base),
    solid(pal, 'M14 27c2-4 6-6 10-6 4 0 6 2 7 4-4-1-11-1-17 2z', pal.ramps.moss.base, 1.4),
    solid(pal, ellipsePath(17, 34.6, 3.4, 1.6), pal.ramps.hide.shade, 1.3),
    ink(pal, 'M32.5 30.5c.8.8 1.8.8 2.6 0', 1.3),
    solid(pal, 'M31 25.5l1.5-3.5 1.5 3.5z', pal.ramps.hide.shade, 1.2),
  ],
};

/** Item motifs by content icon key: what the team crafts. */
export const ITEM_MOTIFS: Readonly<Record<string, IconMotif>> = {
  hook: (pal) => [
    // Three prongs curling up from the foot of the shaft: left, right, and one towards the viewer.
    ink(pal, 'M24 12v20M24 32c-6 0-10-4-10-9M24 32c6 0 10-4 10-9', 4.2),
    ink(pal, 'M24 12v20M24 32c-6 0-10-4-10-9M24 32c6 0 10-4 10-9', 1.8, pal.ramps.stone.light),
    ink(pal, 'M14 23l-2.2 2.4M34 23l2.2 2.4', 2.6),
    solid(pal, ellipsePath(24, 32.5, 2.6, 2.6), pal.ramps.stone.base, 1.6),
    ink(pal, ellipsePath(24, 10, 2.4, 2.4), 1.8),
    ink(
      pal,
      smoothOpen([P(26, 10), P(32, 9), P(36, 13), P(33, 17), P(29, 15)]),
      1.4,
      pal.ramps.bark.base,
    ),
  ],
  lantern: (pal) => [
    el('path', { d: ellipsePath(24, 26, 9, 9), fill: pal.accents.ochre.light, opacity: 0.6 }),
    ink(pal, 'M20 13c0-4 8-4 8 0', 1.6),
    solid(pal, 'M18 16h12v3H18z', pal.ramps.bark.base, 1.6),
    solid(pal, 'M19 19h10l-1 12h-8z', pal.accents.ochre.base, 1.8),
    ink(pal, 'M24 19v12M20.5 25h7', 1.1, pal.ramps.bark.shade),
    solid(pal, 'M18 31h12v3H18z', pal.ramps.bark.base, 1.6),
  ],
  spikes: (pal) => [
    solid(pal, 'M12 22h24l-2 5H14z', pal.ramps.stone.light),
    ink(pal, 'M15 27l1 7M20 27l.5 7M25 27v7M30 27l-.5 7M34 27l-1 7', 2, pal.ramps.stone.shade),
    ink(pal, 'M16 22c0-6 16-6 16 0', 1.8, pal.ramps.bark.base),
  ],
};

/** Trait and quirk motifs by content icon key. */
export const MOTIFS: Readonly<Record<string, IconMotif>> = {
  // Traits.
  boot: (pal) => [
    solid(pal, 'M18 12.5h8.5v14.5l7.5 3.2c2.2 1 2 5.3-1 5.3H17.5z', pal.ramps.bark.base),
    ink(pal, 'M17.5 32.5h16.5M18.5 17h7.5', 1.4, pal.inkSoft),
  ],
  sun: (pal) => {
    const rays: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI / 4) * i;
      rays.push(
        poly(
          [
            P(24 + Math.cos(a) * 8, 24 + Math.sin(a) * 8),
            P(24 + Math.cos(a) * 12.5, 24 + Math.sin(a) * 12.5),
          ],
          false,
        ),
      );
    }
    return [
      ink(pal, rays.join(''), 2),
      solid(pal, ellipsePath(24, 24, 5.5, 5.5), pal.accents.ochre.base),
    ];
  },
  wave: (pal) => [
    solid(pal, 'M11 27c3-5 6-5 9 0s6 5 9 0 6-5 8-1v7H11z', pal.ramps.water.base, 1.8),
    ink(pal, 'M12 19c3-4 6-4 8 0s6 4 8 0 5-4 8 0', 1.8, pal.ramps.water.shade),
  ],
  leaf: (pal) => [
    solid(pal, leafPath(13, 34, -0.8, 27), pal.ramps.foliage.base),
    ink(
      pal,
      'M13.5 33.5L31 15.5M20 27l-1-5M24 23l-.5-5.5M20 27l5 .5M24 23l5.5 .5',
      1.3,
      pal.ramps.foliage.shade,
    ),
  ],
  eye: (pal) => [
    solid(pal, 'M10 24c7-9 21-9 28 0-7 9-21 9-28 0z', pal.paper),
    solid(pal, ellipsePath(24, 24, 5, 5), pal.ramps.water.base, 1.6),
    el('path', { d: ellipsePath(24, 24, 2.1, 2.1), fill: pal.ink }),
  ],
  moon: (pal) => [
    solid(pal, 'M26 11A13 13 0 1 0 26 37A15 15 0 0 1 26 11Z', pal.accents.ochre.light),
    ink(pal, 'M33 16v4M31 18h4M35 27v3M33.5 28.5h3', 1.4, pal.inkSoft),
  ],
  pack: (pal) => [
    solid(pal, 'M16 18c0-4 16-4 16 0v15c0 2-1 3-3 3H19c-2 0-3-1-3-3z', pal.ramps.bark.base),
    solid(pal, 'M16.5 18.5c2 4 13 4 15 0v4c-2 3-13 3-15 0z', pal.ramps.bark.shade, 1.6),
    ink(pal, 'M20 14.5c0-3 8-3 8 0', 1.8),
    solid(pal, ellipsePath(24, 23.5, 1.6, 1.6), pal.accents.ochre.base, 1.2),
  ],
  hand: (pal) => [
    solid(
      pal,
      'M17 36c-3-4-5-8-5-11 0-2 2.5-2.5 3.5-.5l2 3V14c0-1.6 2.6-1.6 2.6 0v8V11.5c0-1.6 2.7-1.6 2.7 0V22V12.5c0-1.6 2.7-1.6 2.7 0V23V15c0-1.6 2.6-1.6 2.6 0v13c0 4-1.5 6-3 8z',
      pal.skins[0] ?? pal.skin,
      1.8,
    ),
  ],
  sprig,
  scroll,
  quill: (pal) => [
    solid(pal, 'M34 11c-8 1-15 9-17 18l2 2c9-2 16-9 17-17z', pal.paper, 1.8),
    ink(pal, 'M35 12L15 34M27 18l-2-4M23 23l-3-3M27 18l4 1M23 23l4 1', 1.4, pal.inkSoft),
    ink(pal, 'M15 34l-2 3', 2.2),
  ],
  paw: (pal) => [
    solid(pal, 'M24 23c-5 0-9 5-9 9 0 3 3 4 9 3 6 1 9 0 9-3 0-4-4-9-9-9z', pal.ramps.hide.base),
    ...[
      [15.5, 20, 2.6],
      [20.5, 15, 2.8],
      [27.5, 15, 2.8],
      [32.5, 20, 2.6],
    ].map(([x, y, r]) => solid(pal, ellipsePath(x!, y!, r!, r! * 1.15), pal.ramps.hide.base, 1.6)),
  ],
  // Quirks.
  feet: (pal) => [
    solid(pal, 'M15 30c-2-5-1-12 3-12s5 7 3 12c-1 3-5 3-6 0z', pal.ramps.bark.base, 1.6),
    solid(pal, 'M27 22c-2-5-1-11 3-11s5 6 3 11c-1 3-5 3-6 0z', pal.ramps.bark.base, 1.6),
    solid(pal, ellipsePath(18, 35, 2.6, 2), pal.ramps.bark.base, 1.4),
    solid(pal, ellipsePath(30, 27, 2.6, 2), pal.ramps.bark.base, 1.4),
  ],
  feather: (pal) => [
    solid(pal, 'M30 10c-10 3-15 12-14 22l3 3c8-3 13-12 11-25z', pal.accents.plum.light, 1.8),
    ink(
      pal,
      'M30 10C24 19 20 27 16 38M27 15l-3 1M25 20l-3.5 1M23 25l-4 1.5',
      1.4,
      pal.accents.plum.shade,
    ),
  ],
  owl: (pal) => [
    solid(
      pal,
      'M15 18c0-6 4-8 4-8l3 4h4l3-4s4 2 4 8v9c0 6-4 10-9 10s-9-4-9-10z',
      pal.ramps.bark.base,
    ),
    solid(pal, ellipsePath(20, 21, 3.4, 3.4), pal.paper, 1.6),
    solid(pal, ellipsePath(28, 21, 3.4, 3.4), pal.paper, 1.6),
    el('path', { d: ellipsePath(20, 21, 1.4, 1.4) + ellipsePath(28, 21, 1.4, 1.4), fill: pal.ink }),
    solid(pal, 'M24 24l-1.6 2.6h3.2z', pal.accents.ochre.base, 1.2),
    ink(pal, 'M19 30l2 2M24 31v2M29 30l-2 2', 1.3, pal.inkSoft),
  ],
  boulder: (pal) => [
    solid(pal, 'M12 30c0-7 5-14 13-14s11 6 11 12-4 8-12 8-12-1-12-6z', pal.ramps.rock.light),
    solid(pal, 'M24 36c6 0 12-1 12-8 0-2 0-3-1-5-2 6-6 9-11 13z', pal.ramps.rock.shade, 0),
    ink(pal, 'M12 30c0-7 5-14 13-14s11 6 11 12-4 8-12 8-12-1-12-6z'),
    ink(pal, 'M22 18l2 5-3 4', 1.3, pal.inkSoft),
  ],
  key: (pal) => [
    solid(
      pal,
      ellipsePath(17, 24, 5.5, 5.5) + ellipsePath(17, 24, 2.2, 2.2),
      pal.accents.ochre.base,
    ),
    solid(pal, 'M22.4 22.5H37v3h-2v4h-3v-4h-2v3h-3v-3h-4.6z', pal.accents.ochre.base, 1.8),
  ],
  charm: (pal) => [
    ink(pal, 'M15 11c2 6 5 9 9 10 4-1 7-4 9-10', 1.5, pal.inkSoft),
    solid(pal, ellipsePath(24, 29, 7, 7), pal.accents.teal.base),
    solid(
      pal,
      poly(
        Array.from({ length: 10 }, (_, i) => {
          const a = -Math.PI / 2 + (Math.PI / 5) * i;
          const r = i % 2 ? 1.6 : 4;
          return P(24 + Math.cos(a) * r, 29 + Math.sin(a) * r);
        }),
      ),
      pal.accents.teal.light,
      1.2,
    ),
  ],
  jar: (pal) => [
    solid(
      pal,
      'M17 18h14c2 4 3 8 3 11 0 5-4 8-10 8s-10-3-10-8c0-3 1-7 3-11z',
      pal.ramps.stone.base,
    ),
    solid(pal, 'M16 13.5h16v4.5H16z', pal.ramps.bark.base, 1.8),
    ink(pal, 'M17 25c4 2 10 2 14 0', 1.3, pal.inkSoft),
  ],
  horn: (pal) => [
    solid(pal, 'M12 30c6 1 13-2 18-10l5-5 2 3-3 5c-3 9-12 13-21 12z', pal.ramps.stone.light),
    ink(pal, 'M23 26l3 4M28 21.5l3 3.5', 1.6, pal.ramps.bark.shade),
    solid(pal, ellipsePath(36, 16.5, 1.8, 2.6), pal.ramps.bark.base, 1.4),
  ],
  drop: (pal) => [
    solid(pal, 'M24 10c5 8 9 13 9 18a9 9 0 0 1-18 0c0-5 4-10 9-18z', pal.ramps.water.base),
    ink(pal, 'M20 28c0 2 1.5 4 3.5 4.5', 1.6, pal.ramps.water.light),
  ],
  cloud: (pal) => [
    solid(
      pal,
      'M15 32c-3 0-5-2-5-5s2-5 5-5c0-4 3-7 7-7 3 0 5 2 6 4 1-1 2-1 3-1 3 0 5 2 5 5 3 0 4 2 4 4s-2 5-5 5z',
      pal.accents.sky.light,
    ),
    ink(pal, 'M17 36.5h5M26 36.5h3', 1.4, pal.inkSoft),
  ],
  spoon: (pal) => [
    solid(
      pal,
      'M29 12c4-2 8 2 6 6-1 3-4 4-6 3L17 35c-1 1-3 0-2-2l12-12c-1-2-1-6 2-9z',
      pal.ramps.stone.light,
    ),
  ],
  cane: (pal) => [
    ink(pal, 'M20 38V18c0-6 9-6 9-1v2', 3.2, pal.ramps.bark.shade),
    ink(pal, 'M20 38V18c0-6 9-6 9-1v2', 1.2, pal.ramps.bark.light),
  ],
};
