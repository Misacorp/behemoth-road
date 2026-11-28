/**
 * Action icons for the lure animal, the hand cart and the pinned: `lead`, `hitch`, `board-cart`, `load`,
 * `unload` and `struggle`, on the 48-unit grid like the other action motifs (`ACTION_MOTIFS` spreads them
 * in). Self-contained: this file imports nothing from `icon-motifs.ts`, which imports it.
 */
import { ellipsePath } from './geom.ts';
import type { Palette } from './palette.ts';
import { el, type SvgNode } from './svg.ts';

type Motif = (palette: Palette) => SvgNode[];

const ink = (pal: Palette, d: string, width = 2.1, colour?: string): SvgNode =>
  el('path', {
    d,
    fill: 'none',
    stroke: colour ?? pal.ink,
    'stroke-width': width,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });

const solid = (pal: Palette, d: string, fill: string, width = 2.1): SvgNode =>
  el('path', { d, fill, stroke: pal.ink, 'stroke-width': width, 'stroke-linejoin': 'round' });

/** A small cart on the ground line: a plank bed, one wheel, a shaft out in front (x 8 to 40, y 22 to 40). */
const miniCart = (pal: Palette, shaftUp = false): SvgNode[] => [
  solid(pal, 'M9 27h23l-1.6 8H10.6z', pal.ramps.bark.base, 1.8),
  ink(pal, 'M10 31h21', 1.1, pal.ramps.bark.shade),
  ink(pal, shaftUp ? 'M31 29l9-6' : 'M31 31l9 5', 2.6, pal.ink),
  ink(pal, shaftUp ? 'M31 29l9-6' : 'M31 31l9 5', 1.2, pal.ramps.bark.light),
  solid(pal, ellipsePath(21, 36, 5.2, 5.2), pal.ramps.sand.light, 1.8),
  ink(pal, 'M21 31v10M16 36h10', 1, pal.ramps.bark.shade),
  solid(pal, ellipsePath(21, 36, 1.4, 1.4), pal.ramps.bark.base, 1),
];

const crate = (pal: Palette, x: number, y: number, s: number): SvgNode[] => [
  solid(pal, `M${x} ${y}h${s}v${s}h${-s}z`, pal.ramps.bark.light, 1.8),
  ink(pal, `M${x} ${y}l${s} ${s}M${x + s} ${y}l${-s} ${s}`, 1.1, pal.ramps.bark.shade),
];

export const ACTION_MOTIFS_R13: Readonly<Record<string, Motif>> = {
  // Lead: an open hand holding a short leash that ends in a loop.
  lead: (pal) => [
    ink(pal, 'M11 38h26', 1.4, pal.inkSoft),
    ink(pal, 'M26 27C21 28 17 31 15.5 35', 3, pal.ramps.bark.shade),
    ink(pal, 'M26 27C21 28 17 31 15.5 35', 1.2, pal.ramps.bark.light),
    solid(pal, ellipsePath(14, 36, 3.6, 2.6), pal.ramps.sand.light, 1.6),
    solid(
      pal,
      'M25 24c0-3 3-5 6-4l6 2c3 1 3 5 1 7l-3 5c-1 2-4 3-6 2l-5-2c-2-1-3-3-2-5z',
      pal.skin,
      1.8,
    ),
    ink(pal, 'M31 21l-1.5-5.5M34.6 22.4l.2-6M37.6 24.6l1.8-4.6', 2.6, pal.ink),
    ink(pal, 'M31 21l-1.5-5.5M34.6 22.4l.2-6M37.6 24.6l1.8-4.6', 1.2, pal.skin),
    ink(pal, 'M28 28.5c1.6.8 3.4.8 5-.2', 1.2, pal.ramps.hide.shade),
  ],
  // Hitch: a fist round the cart's shaft ends, the cart behind, pull chevrons ahead.
  hitch: (pal) => [
    ink(pal, 'M7 40h20', 1.4, pal.inkSoft),
    ...miniCart(pal, true),
    solid(pal, ellipsePath(40, 22, 4.2, 3.4), pal.skin, 1.7),
    ink(pal, 'M38 21.5h4M38.4 23.6h3.6', 1, pal.ramps.hide.shade),
    ink(pal, 'M32 12l4 3.6-4 3.6M38.5 12l4 3.6-4 3.6', 1.8, pal.accents.sage.shade),
  ],
  // Board cart: a traveller dropping into the bed, an arrow down.
  'board-cart': (pal) => [
    solid(pal, ellipsePath(20, 16, 3.8, 3.8), pal.skin, 1.7),
    solid(pal, 'M14.4 33l1.6-12c1-2 7-2 8 0l1.6 12z', pal.accents.sage.base, 1.7),
    ...miniCart(pal),
    solid(pal, 'M9 27h23v2.6H9z', pal.ramps.bark.base, 1.6),
    ink(pal, 'M35 8v9M31.4 13.6L35 17.4l3.6-3.8', 2, pal.accents.sage.shade),
  ],
  // Load: a crate lowered into the cart, an arrow down.
  load: (pal) => [
    ...miniCart(pal),
    ...crate(pal, 14, 17, 9),
    ink(pal, 'M33 6v10M29.4 12.6L33 16.4l3.6-3.8', 2, pal.accents.sage.shade),
  ],
  // Unload: a crate lifted out of the cart, an arrow up and away.
  unload: (pal) => [
    ...miniCart(pal),
    ...crate(pal, 26, 8, 9),
    ink(pal, 'M16 20l8-7M20.8 12.8L24 13l-.4 3.8', 2, pal.accents.coral.shade),
  ],
  // Struggle: a pinned arm shoving up at the stone over it, effort ticks above.
  struggle: (pal) => [
    ink(pal, 'M8 38h32', 1.4, pal.inkSoft),
    solid(pal, 'M22 32l2-9 6-6 8 1 3 8-3 6z', pal.ramps.rock.light, 1.9),
    ink(pal, 'M30 17l3 5-2 5', 1.2, pal.ramps.rock.shade),
    ink(pal, 'M9 37l12-6', 5.4, pal.ink),
    ink(pal, 'M9 37l12-6', 3.4, pal.accents.sage.base),
    solid(pal, ellipsePath(23.4, 29.6, 3.4, 2.8), pal.skin, 1.6),
    ink(pal, 'M12 12l-1.6-3.4M17 9.6l.4-3.8M22 10.2l2.4-3', 1.6, pal.inkSoft),
  ],
};
