/**
 * The destination's glow: a warm, welcoming light on every hex of the area the creature needs to reach, soft
 * gold-green rising from the ground. Drawn in the map's drawing coordinates (like `drawVeilLift`), over fog
 * too, because the destination is known from the start. `drawDestinationBadge` is the same light behind the
 * Greyfold's mark, for the route strip, so the two read as one thing. No text, no numbers.
 */
import type { Palette } from './palette.ts';
import { poly } from './geom.ts';
import { type Hex, hexCenter, hexCorners, type Projection } from './projection.ts';
import { el, type SvgNode } from './svg.ts';
import { drawRouteDestination } from './waymarks.ts';

/** How strong the ground light and the rising light are (0..1), in one place. */
export const DESTINATION_GLOW = {
  ground: 0.62,
  column: 0.5,
  motes: 0.75,
} as const;

/** The warm light's two colours: a pale gold and a spring green. */
function glowColours(pal: Palette): { gold: string; green: string } {
  return { gold: pal.accents.ochre.light, green: pal.accents.sage.base };
}

function glowDefs(pal: Palette, prefix: string): SvgNode {
  const { gold, green } = glowColours(pal);
  return el('defs', {}, [
    el('radialGradient', { id: `${prefix}-ground`, cx: '50%', cy: '50%', r: '55%' }, [
      el('stop', { offset: '0%', 'stop-color': gold, 'stop-opacity': 0.95 }),
      el('stop', { offset: '55%', 'stop-color': green, 'stop-opacity': 0.55 }),
      el('stop', { offset: '100%', 'stop-color': green, 'stop-opacity': 0 }),
    ]),
    el('linearGradient', { id: `${prefix}-column`, x1: '0', y1: '1', x2: '0', y2: '0' }, [
      el('stop', { offset: '0%', 'stop-color': gold, 'stop-opacity': 0.85 }),
      el('stop', { offset: '60%', 'stop-color': green, 'stop-opacity': 0.25 }),
      el('stop', { offset: '100%', 'stop-color': green, 'stop-opacity': 0 }),
    ]),
  ]);
}

/** One hex's light: the ground glow, a soft column rising from its middle, and a few motes drifting up. */
function glowHex(pal: Palette, p: Projection, hex: Hex, prefix: string): SvgNode {
  const c = hexCenter(p, hex.q, hex.r);
  const { gold } = glowColours(pal);
  const ground = hexCorners(p, c, 0.98);
  const rise = p.size * 1.25;
  const half = p.size * 0.42;
  const motes = [
    { dx: -0.22, dy: 0.5, r: 0.07 },
    { dx: 0.18, dy: 0.8, r: 0.055 },
    { dx: 0.02, dy: 1.05, r: 0.045 },
  ];
  return el(
    'g',
    {
      'data-destination': `${hex.q},${hex.r}`,
      'pointer-events': 'none',
    },
    [
      el('path', {
        d: poly(ground),
        fill: `url(#${prefix}-ground)`,
        opacity: DESTINATION_GLOW.ground,
        'data-glow': 'ground',
      }),
      el('path', {
        d: `M${(c.x - half).toFixed(2)} ${c.y.toFixed(2)}L${(c.x - half * 0.45).toFixed(2)} ${(c.y - rise).toFixed(2)}L${(c.x + half * 0.45).toFixed(2)} ${(c.y - rise).toFixed(2)}L${(c.x + half).toFixed(2)} ${c.y.toFixed(2)}Z`,
        fill: `url(#${prefix}-column)`,
        opacity: DESTINATION_GLOW.column,
        'data-glow': 'column',
      }),
      ...motes.map((m, i) =>
        el('circle', {
          cx: (c.x + m.dx * p.size).toFixed(2),
          cy: (c.y - m.dy * p.size).toFixed(2),
          r: (m.r * p.size).toFixed(2),
          fill: gold,
          opacity: DESTINATION_GLOW.motes,
          'data-glow': 'mote',
          'data-mote': i,
        }),
      ),
    ],
  );
}

/**
 * The glow over a destination area: one `<g data-destination-glow>` holding its gradients and a light on each
 * hex, in the drawing's coordinates. `prefix` keeps the gradient ids apart from other drawings on a page.
 */
export function drawDestinationGlow(
  palette: Palette,
  projection: Projection,
  hexes: readonly Hex[],
  prefix = 'dest',
): SvgNode {
  return el('g', { 'data-destination-glow': hexes.length, 'pointer-events': 'none' }, [
    glowDefs(palette, prefix),
    ...hexes.map((h) => glowHex(palette, projection, h, prefix)),
  ]);
}

/**
 * The route strip's destination mark: the Greyfold's valley with the same gold-green light behind it, a
 * `<svg>` of `size` px.
 */
export function drawDestinationBadge(palette: Palette, size = 24, prefix = 'dest-badge'): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 24;
  const { gold, green } = glowColours(palette);
  return el(
    'svg',
    { viewBox: '-16 -16 32 32', width: px, height: px, 'data-destination-badge': '' },
    [
      el('defs', {}, [
        el('radialGradient', { id: `${prefix}-halo`, cx: '50%', cy: '50%', r: '50%' }, [
          el('stop', { offset: '0%', 'stop-color': gold, 'stop-opacity': 0.95 }),
          el('stop', { offset: '60%', 'stop-color': green, 'stop-opacity': 0.5 }),
          el('stop', { offset: '100%', 'stop-color': green, 'stop-opacity': 0 }),
        ]),
      ]),
      el('circle', { cx: 0, cy: 0, r: 16, fill: `url(#${prefix}-halo)`, 'data-glow': 'halo' }),
      el(
        'svg',
        { x: -10, y: -10, width: 20, height: 20, viewBox: '-12 -12 24 24' },
        drawRouteDestination(palette, 24).children,
      ),
    ],
  );
}
