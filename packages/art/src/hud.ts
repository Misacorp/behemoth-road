/**
 * The season on the HUD: the peril gauge (ten marks, the wounded threshold marked, filled to the peril), the
 * route strip (steps walked toward home, a home mark at its end) and the edge-darkening vignette over the map
 * as peril rises. Each is a self-contained `<svg>`; values come from the game state, never text.
 */
import { ellipsePath, poly, type Point } from './geom.ts';
import type { Palette } from './palette.ts';
import { el, type SvgNode } from './svg.ts';

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
const n1 = (v: number): string => (Math.round(v * 10) / 10).toString();

export interface PerilGaugeOptions {
  /** Marks on the gauge (default 10, `perilMax`). */
  readonly max?: number;
  /** Peril at which the creature comes home wounded (default 5, `perilWoundedAt`): marks from this one on sit in a rose band. */
  readonly woundedAt?: number;
}

/**
 * The peril gauge, `width` × 22 px: `max` slanted marks, the first `peril` filled coral (deeper from the
 * wounded threshold on), a rose band under the wounded marks with a notch at its start, and the last mark
 * double-ringed (lost). Each mark carries `data-peril-mark` with its number (1-based) for the jolt.
 */
export function drawPerilGauge(
  palette: Palette,
  width: number,
  peril: number,
  options: PerilGaugeOptions = {},
): SvgNode {
  const max = Math.round(clamp(options.max ?? 10, 1, 20));
  const woundedAt = Math.round(clamp(options.woundedAt ?? 5, 1, max));
  const filled = Math.round(clamp(peril, 0, max));
  const w = Number.isFinite(width) && width >= max * 8 ? width : Math.max(140, max * 14);
  const h = 22;
  const pad = 5;
  const step = (w - pad * 2) / max;
  const mw = Math.min(step * 0.62, 9);
  const top = 5;
  const bottom = 17;
  const slant = 2;
  const xAt = (i: number): number => pad + step * (i + 0.5);
  const mark = (i: number): string => {
    const x = xAt(i);
    return poly([
      { x: x - mw / 2 + slant, y: top },
      { x: x + mw / 2 + slant, y: top },
      { x: x + mw / 2 - slant, y: bottom },
      { x: x - mw / 2 - slant, y: bottom },
    ]);
  };
  const bandX = pad + step * (woundedAt - 1) - step * 0.08;
  const band = `M${n1(bandX)} 2.5H${n1(w - pad + 1)}V19.5H${n1(bandX)}z`;
  const notch = `M${n1(bandX)} 0.5V21.5`;
  const marks: SvgNode[] = [];
  for (let i = 0; i < max; i += 1) {
    const on = i < filled;
    const deep = i + 1 >= woundedAt;
    marks.push(
      el('path', {
        d: mark(i),
        fill: on
          ? deep
            ? palette.accents.coral.shade
            : palette.accents.coral.base
          : palette.paper,
        stroke: on ? palette.ink : palette.inkSoft,
        'stroke-width': on ? 1.3 : 1.1,
        'stroke-linejoin': 'round',
        'data-peril-mark': i + 1,
      }),
    );
  }
  const last = xAt(max - 1);
  return el('svg', { viewBox: `0 0 ${n1(w)} ${h}`, width: n1(w), height: h }, [
    el('path', { d: band, fill: palette.accents.rose.light, opacity: 0.75 }),
    el('path', {
      d: notch,
      fill: 'none',
      stroke: palette.accents.rose.shade,
      'stroke-width': 1.6,
      'stroke-linecap': 'round',
    }),
    ...marks,
    el('path', {
      d: ellipsePath(last + 0.2, 11, mw * 0.5 + 4.5, 9),
      fill: 'none',
      stroke: palette.accents.rose.shade,
      'stroke-width': 1,
      'stroke-dasharray': '1.6 1.8',
    }),
  ]);
}

/**
 * The route strip, `width` × 24 px: a thin line from start to home, inked and sage-washed as far as walked
 * and dotted beyond, a small tick every step when there are few enough to tell apart, a paw mark where the
 * creature is now, and a home mark at the end (a round den in a hill with a tree).
 */
export function drawRouteStrip(
  palette: Palette,
  width: number,
  walked: number,
  total: number,
): SvgNode {
  const w = Number.isFinite(width) && width >= 80 ? width : 200;
  const h = 24;
  const steps = Math.round(clamp(total, 1, 999));
  const done = clamp(walked, 0, steps);
  const x0 = 6;
  const x1 = w - 26;
  const y = 14;
  const at = x0 + ((x1 - x0) * done) / steps;
  const ticks: string[] = [];
  // A tick per step when steps are far enough apart to tell, else one every five.
  const every = (x1 - x0) / steps >= 6 ? 1 : 5;
  if (((x1 - x0) * every) / steps >= 6) {
    for (let i = every; i < steps; i += every) {
      const x = x0 + ((x1 - x0) * i) / steps;
      ticks.push(`M${n1(x)} ${y - 2}V${y + 2}`);
    }
  }
  const pawAt: Point = { x: at, y: y };
  const paw =
    ellipsePath(pawAt.x, pawAt.y + 1.5, 3.8, 3.1) +
    [
      [-3.4, -2.6],
      [0, -4.1],
      [3.4, -2.6],
    ]
      .map(([dx, dy]) => ellipsePath(pawAt.x + dx!, pawAt.y + dy!, 1.4, 1.4))
      .join('');
  const hx = w - 13;
  return el('svg', { viewBox: `0 0 ${n1(w)} ${h}`, width: n1(w), height: h }, [
    el('path', {
      d: `M${n1(at)} ${y}H${n1(x1)}`,
      fill: 'none',
      stroke: palette.inkSoft,
      'stroke-width': 1.4,
      'stroke-dasharray': '0.1 3.4',
      'stroke-linecap': 'round',
    }),
    ...(done > 0
      ? [
          el('path', {
            d: `M${x0} ${y}H${n1(at)}`,
            fill: 'none',
            stroke: palette.accents.sage.light,
            'stroke-width': 5,
            'stroke-linecap': 'round',
          }),
          el('path', {
            d: `M${x0} ${y}H${n1(at)}`,
            fill: 'none',
            stroke: palette.ink,
            'stroke-width': 1.4,
            'stroke-linecap': 'round',
          }),
        ]
      : []),
    ...(ticks.length
      ? [
          el('path', {
            d: ticks.join(''),
            fill: 'none',
            stroke: palette.inkSoft,
            'stroke-width': 0.8,
            'stroke-linecap': 'round',
          }),
        ]
      : []),
    el('path', {
      d: ellipsePath(x0, y, 2, 2),
      fill: palette.ink,
    }),
    // Home: a grassy hill with a round den door and a small tree, on a soft ochre glow.
    el('path', { d: ellipsePath(hx, y + 2, 12, 6), fill: palette.accents.ochre.light }),
    el('path', {
      d: `M${n1(hx - 11)} ${y + 6}C${n1(hx - 9)} ${y - 6} ${n1(hx + 9)} ${y - 6} ${n1(hx + 11)} ${y + 6}Z`,
      fill: palette.ramps.grass.base,
      stroke: palette.ink,
      'stroke-width': 1.2,
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: `M${n1(hx - 3.5)} ${y + 6}V${y + 2.5}A3.5 3.5 0 0 1 ${n1(hx + 3.5)} ${y + 2.5}V${y + 6}Z`,
      fill: palette.ink,
      opacity: 0.8,
    }),
    el('path', {
      d: `M${n1(hx + 6)} ${y - 1.5}V${y - 8}`,
      fill: 'none',
      stroke: palette.ramps.bark.shade,
      'stroke-width': 1.3,
      'stroke-linecap': 'round',
    }),
    el('path', {
      d: ellipsePath(hx + 6, y - 10, 3.4, 3.8),
      fill: palette.ramps.foliage.base,
      stroke: palette.ink,
      'stroke-width': 1,
    }),
    el('path', {
      d: paw,
      fill: palette.accents.ochre.shade,
      stroke: palette.paper,
      'stroke-width': 0.6,
      'data-route': 'here',
    }),
  ]);
}

/**
 * The map's edges darkening with peril: a full-screen `<svg>` (100 % × 100 %, stretched to its box) holding a
 * radial wash from clear in the middle to the palette's shadow at the edges. `level` 0..1 (peril over its
 * maximum) sets how dark; at 0 the wash is clear. `idPrefix` keeps its gradient id apart from the scene's.
 */
export function drawPerilVignette(palette: Palette, level: number, idPrefix = 'br'): SvgNode {
  if (!/^[\w-]+$/.test(idPrefix)) throw new Error(`Bad idPrefix: ${idPrefix}`);
  const l = clamp(level, 0, 1);
  const id = `${idPrefix}-peril`;
  return el(
    'svg',
    {
      viewBox: '0 0 100 100',
      width: '100%',
      height: '100%',
      preserveAspectRatio: 'none',
      'data-peril': n1(l),
    },
    [
      el('defs', {}, [
        el('radialGradient', { id, cx: '50%', cy: '50%', r: '71%' }, [
          el('stop', {
            offset: `${Math.round(70 - l * 18)}%`,
            'stop-color': palette.shadow,
            'stop-opacity': 0,
          }),
          el('stop', {
            offset: '100%',
            'stop-color': palette.shadow,
            'stop-opacity': n1(0.08 + l * 0.5),
          }),
        ]),
      ]),
      el('rect', {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        fill: `url(#${id})`,
        opacity: l > 0 ? 1 : 0,
      }),
    ],
  );
}
