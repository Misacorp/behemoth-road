/**
 * Waymarks: the standing stone set at a quarter, a half and three quarters of the route (taller than a
 * rider, leaning, a fresh pebble wedged under its foot), and the small Greyfold mark for the route strip's
 * end (a valley with a green rim). Both draw like the other upright things: back to front on the map.
 */
import { ellipsePath, poly, smoothClosed, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { inkAttrs, type Drawn } from './props.ts';
import { el, type SvgNode } from './svg.ts';
import { boxAround, planes, worldContext, type TraceOptions } from './traces.ts';

/** How tall the standing stone is in drawing units (a character is about 47 at the same scale). */
export const STANDING_STONE_HEIGHT = 58;

export interface StandingStoneOptions extends TraceOptions {
  /** Scratched marks on its face: 0 for a bare stone, 1 to 3 for a quarter, a half, three quarters. */
  readonly ticks?: number;
}

/** The stone's outline in local units: base at y 0, leaning toward +x by `lean` at the top. */
function outline(lean: number): { x: number; y: number }[] {
  const h = STANDING_STONE_HEIGHT;
  return [
    { x: -9, y: 0 },
    { x: -10.5, y: -h * 0.35 },
    { x: -8 + lean * 0.8, y: -h * 0.8 },
    { x: -3.5 + lean, y: -h },
    { x: 3 + lean, y: -h * 0.96 },
    { x: 9 + lean * 0.8, y: -h * 0.6 },
    { x: 10, y: -h * 0.2 },
    { x: 8.5, y: 0 },
  ];
}

export function drawStandingStone(palette: Palette, opts: StandingStoneOptions = {}): Drawn {
  const c = worldContext(palette, 'standing-stone', opts);
  const pal = palette;
  const { G, U } = planes(c);
  const lean = 6 + c.rng.range(-1, 1);
  const body = outline(lean).map((p) => U(p.x, p.y));
  const d = smoothClosed(body);
  const g = G(0, 0);
  const ticks = Math.max(0, Math.min(3, Math.round(opts.ticks ?? 0)));
  const at = (t: number, x: number): Point => U(x + lean * t, -STANDING_STONE_HEIGHT * t);
  const tickPaths = Array.from({ length: ticks }, (_, i) => {
    const t = 0.34 + i * 0.12;
    return poly([at(t, -3.2), at(t - 0.015, 3.6)], false);
  }).join('');
  const lit = smoothClosed(
    [
      { x: -9.4, y: -2 },
      { x: -10.2, y: -STANDING_STONE_HEIGHT * 0.35 },
      { x: -7.6 + lean * 0.8, y: -STANDING_STONE_HEIGHT * 0.78 },
      { x: -3.6 + lean, y: -STANDING_STONE_HEIGHT * 0.97 },
      { x: -2 + lean, y: -STANDING_STONE_HEIGHT * 0.6 },
      { x: -3, y: -STANDING_STONE_HEIGHT * 0.2 },
    ].map((p) => U(p.x, p.y)),
  );
  const pebble = G(9.5, 2.6);
  const nodes: SvgNode[] = [
    // A long soft shadow falls the way the stone leans, and a darker patch of ground holds the foot.
    el('path', {
      d: ellipsePath(g.x + (6 + lean) * c.k, g.y + 0.5 * c.k, 20 * c.k, 4.6 * c.k * c.squash),
      fill: pal.shadow,
      opacity: 0.2,
    }),
    el('path', {
      d: ellipsePath(g.x, g.y, 13 * c.k, 3.6 * c.k * c.squash),
      fill: pal.ramps.earth.shade,
      opacity: 0.3,
    }),
    el('path', { d, fill: pal.ramps.stone.base }),
    el('path', { d: lit, fill: pal.ramps.stone.light }),
    // Moss gathers on the shaded foot.
    el('path', {
      d: poly([U(-9.5, -1), U(-10.4, -9), U(-5, -6), U(2, -9), U(8.8, -2), U(8.5, 0), U(-9, 0)]),
      fill: pal.ramps.moss.base,
      opacity: 0.7,
    }),
    el('path', { d, ...inkAttrs(pal.ink, c.ink * 1.2) }),
    el('path', { d: tickPaths, ...inkAttrs(pal.ink, c.ink * 1.1) }),
    // The fresh pebble: pale and clean, wedged under the foot.
    el('path', {
      d: ellipsePath(pebble.x, pebble.y, 2.8 * c.k, 1.8 * c.k),
      fill: pal.paper,
      stroke: pal.ink,
      'stroke-width': c.ink * 0.8,
    }),
  ];
  return {
    nodes,
    box: { ...boxAround(c, 22, STANDING_STONE_HEIGHT + 1, 5), x1: c.origin.x + (22 + lean) * c.k },
  };
}

/**
 * The Greyfold mark for the route strip's end, a centred `<svg>` of `size` px (default 24): a valley between
 * two ochre hills, green inside, with a green rim line across the top.
 */
export function drawRouteDestination(palette: Palette, size = 24): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 24;
  const pal = palette;
  const line = (d: string, w = 1.5, colour = pal.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, w) });
  return el('svg', { viewBox: '-12 -12 24 24', width: px, height: px }, [
    el('path', {
      d: 'M-11 -6C-8 -6-5 -1-3 4Q0 7 3 4C5 -1 8 -6 11 -6V9H-11z',
      fill: pal.accents.sage.base,
    }),
    el('path', { d: 'M-11 -6C-8 -6-5 -1-3 4L-11 9z', fill: pal.ramps.upland.base }),
    el('path', { d: 'M11 -6C8 -6 5 -1 3 4L11 9z', fill: pal.ramps.upland.base }),
    el('path', { d: 'M-3.6 3.6Q0 7.6 3.6 3.6', ...inkAttrs(pal.accents.sage.shade, 1.4) }),
    line('M-11 -6C-8 -6-5 -1-3 4Q0 7 3 4C5 -1 8 -6 11 -6'),
    // The green rim: a bright lip of grass along both shoulders.
    line(
      'M-11.5 -7.2C-8.5 -7-6 -3.5-4.6 0.6M11.5 -7.2C8.5 -7 6 -3.5 4.6 0.6',
      1.7,
      pal.accents.sage.base,
    ),
    line('M-8 -9.6V-7.6M-5.4 -8.4V-6.6M5.4 -8.4V-6.6M8 -9.6V-7.6', 1, pal.accents.sage.shade),
  ]);
}
