/**
 * Hazard terrains' extras: a small icon for each hazard (glass waste, a poisoned lake, a scree field) and the
 * scree field's ground look. The tiles themselves are in the terrain system (`terrain.ts`: `glass-waste` and
 * `poisoned-lake`, with their `shards` and `murk` ground marks and `shards` and `deadreed` props).
 */
import { ellipsePath, poly, smoothClosed, smoothOpen, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { hexCenter, hexCorners, hexKey, onPlane, type Hex, type Projection } from './projection.ts';
import { inkAttrs } from './props.ts';
import { rngFor } from './rng.ts';
import { el, type SvgNode } from './svg.ts';

export const HAZARD_ICON_KEYS = ['glass-waste', 'poisoned-lake', 'scree-field'] as const;
export type HazardIconKey = (typeof HAZARD_ICON_KEYS)[number];

const P = (x: number, y: number): Point => ({ x, y });

const ink = (pal: Palette, d: string, width: number, colour?: string): SvgNode =>
  el('path', { d, ...inkAttrs(colour ?? pal.ink, width) });
const solid = (pal: Palette, d: string, fill: string, width = 2): SvgNode =>
  el('path', { d, fill, stroke: pal.ink, 'stroke-width': width, 'stroke-linejoin': 'round' });

const glint = (pal: Palette, x: number, y: number, r: number): SvgNode =>
  el('path', {
    d: `M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z`,
    fill: pal.paper,
  });

const MOTIFS: Readonly<Record<HazardIconKey, (pal: Palette) => SvgNode[]>> = {
  // Dark glass spikes on pale ground, glinting.
  'glass-waste': (pal) => [
    el('path', { d: 'M8 37h32', ...inkAttrs(pal.ramps.glass.shade, 3.4) }),
    solid(pal, 'M12 37l3-9 3 9z', pal.ramps.crag.shade, 1.6),
    solid(pal, 'M29 37l2-11 4 11z', pal.ramps.crag.shade, 1.6),
    solid(pal, 'M17 37l3-23 3.4 4 3.8-8 2.6 27z', pal.ramps.crag.shade),
    el('path', { d: 'M22 37l1.4-19 3.4-6 2.6 25z', fill: pal.ink, opacity: 0.55 }),
    ink(pal, 'M19.6 33l1.6-13', 1.4, pal.paper),
    glint(pal, 27, 15, 3.2),
    glint(pal, 14, 30, 1.8),
  ],
  // A pool gone sickly, bubbles on it, a dead reed hooked over.
  'poisoned-lake': (pal) => [
    solid(pal, ellipsePath(24, 33, 15, 6.2), pal.ramps.toxic.base),
    ink(
      pal,
      smoothOpen([P(15, 33), P(19, 31.2), P(23, 33), P(27, 31.4)]),
      1.4,
      pal.accents.plum.shade,
    ),
    ink(pal, 'M31 31C31 22 32 16 30 11C30 10 33 8 35 10', 2, pal.ramps.bark.shade),
    ...[
      [18, 28, 2.6],
      [24.5, 24.5, 2],
      [22, 17, 1.5],
    ].map(([x, y, r]) => solid(pal, ellipsePath(x!, y!, r!, r!), pal.accents.plum.light, 1.4)),
  ],
  // A slope of loose stones, one tumbling with a short scatter of motion ticks.
  'scree-field': (pal) => [
    ink(pal, 'M8 37h32', 1.6, pal.inkSoft),
    solid(pal, 'M10 36l1.5-5 5-1.5 3.5 3.5-1 3.5z', pal.ramps.rock.base, 1.6),
    solid(pal, 'M20 36l1.5-4 5-1 3 3.5-1.5 2.5z', pal.ramps.rock.light, 1.6),
    solid(pal, 'M31 36l1-4 4.5-1.5 3 3-1 2.5z', pal.ramps.rock.base, 1.6),
    solid(pal, 'M16 29l1-4.5 4.5-1.5 3 3-1 3z', pal.ramps.rock.light, 1.6),
    solid(pal, 'M25 24l2-5.5 5.5-1.5 3 4-1.5 4.5z', pal.ramps.rock.base, 1.8),
    ink(pal, 'M31 12l-3 4M35 14l-2 3.5M27 11.5l-2 3', 1.3, pal.inkSoft),
  ],
};

/** A hazard terrain's small icon on a rounded square tile (like a material), `size` px (default 48). */
export function drawHazardIcon(key: string, palette: Palette, size = 48): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 48;
  const known = Object.hasOwn(MOTIFS, key);
  return el(
    'svg',
    { viewBox: '0 0 48 48', width: px, height: px, 'data-icon': known ? key : 'unknown' },
    [
      el('path', {
        d: 'M12 5h24a7 7 0 0 1 7 7v24a7 7 0 0 1-7 7H12a7 7 0 0 1-7-7V12a7 7 0 0 1 7-7z',
        fill: palette.paper,
        stroke: palette.ink,
        'stroke-width': 2.2,
      }),
      ...(known ? MOTIFS[key as HazardIconKey](palette) : []),
    ],
  );
}

/**
 * A scree field's ground look: loose stones scattered flat over each of `hexes` (the cluster of rockslide
 * threats), a few small and a few larger, with a short run of tumble ticks. On the ground plane (drawing
 * coordinates), under the props; seeded by hex, so the same hex always draws the same stones.
 */
export function drawScreeField(
  p: Projection,
  hexes: readonly Hex[],
  palette: Palette,
  seed: string | number = 0,
): SvgNode {
  const unique = new Map<string, Hex>();
  for (const h of hexes)
    if (Number.isFinite(h.q) && Number.isFinite(h.r)) unique.set(hexKey(h.q, h.r), h);
  const stones: SvgNode[] = [];
  const dark: string[] = [];
  const light: string[] = [];
  const outline: string[] = [];
  const ticks: string[] = [];
  for (const h of [...unique.values()].sort((a, b) => a.q - b.q || a.r - b.r)) {
    const rng = rngFor('scree', seed, h.q, h.r);
    const c = hexCenter(p, h.q, h.r);
    const corners = hexCorners(p, c, 0.86);
    // A faint dusty wash so the stones sit on something.
    stones.push(
      el('path', { d: smoothClosed(corners), fill: palette.ramps.rock.shade, opacity: 0.12 }),
    );
    for (let i = 0, n = rng.int(7, 11); i < n; i += 1) {
      const o = onPlane(p, c, rng.range(-0.6, 0.55), rng.range(-0.55, 0.55));
      const r = rng.range(1.6, i % 4 === 0 ? 4.2 : 2.8) * p.k;
      const a = rng.range(0, 1.2);
      const shape = [0, 1, 2, 3, 4].map((j) => {
        const t = a + (Math.PI * 2 * j) / 5;
        const f = j % 2 ? 0.8 : 1.05;
        return P(o.x + Math.cos(t) * r * f, o.y + Math.sin(t) * r * f * p.squash);
      });
      (i % 3 === 0 ? light : dark).push(poly(shape));
      outline.push(poly(shape));
    }
    const t0 = onPlane(p, c, rng.range(-0.3, 0.2), rng.range(-0.4, -0.1));
    ticks.push(
      poly([t0, P(t0.x + 4 * p.k, t0.y + 2 * p.k * p.squash)], false),
      poly(
        [
          P(t0.x + 3 * p.k, t0.y - 2 * p.k * p.squash),
          P(t0.x + 6.5 * p.k, t0.y + 0.4 * p.k * p.squash),
        ],
        false,
      ),
    );
  }
  return el('g', { 'data-scree': unique.size }, [
    ...stones,
    el('path', { d: dark.join(''), fill: palette.ramps.rock.base }),
    el('path', { d: light.join(''), fill: palette.ramps.rock.light }),
    el('path', { d: outline.join(''), ...inkAttrs(palette.inkSoft, Math.max(0.8, 0.9 * p.k)) }),
    el('path', {
      d: ticks.join(''),
      ...inkAttrs(palette.inkSoft, Math.max(0.8, 0.9 * p.k)),
      opacity: 0.6,
    }),
  ]);
}
