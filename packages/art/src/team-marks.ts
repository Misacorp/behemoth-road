/**
 * Marks for what the team carries and builds: a character's pack (a satchel drawn from how full it is), the
 * team stores, the seal of a finished unlock and the ink bar of an unlock's work. Each is a self-contained
 * `<svg>`; values come from the game state, never text.
 */
import { ellipsePath } from './geom.ts';
import { ink, solid } from './icon-motifs.ts';
import type { Palette } from './palette.ts';
import { el, type SvgNode } from './svg.ts';

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

/**
 * A satchel showing how full a pack is: a wash rising inside it and a row of `capacity` pips on the flap,
 * one filled per unit carried.
 */
export function drawPackIcon(palette: Palette, px: number, units: number, capacity = 6): SvgNode {
  const size = Number.isFinite(px) && px > 0 ? px : 48;
  const cap = Math.max(1, Math.round(clamp(capacity, 1, 12)));
  const n = Math.round(clamp(units, 0, cap));
  // The bag's visible belly runs from under the flap (y 25) to its bottom (y 41).
  const top = 25;
  const bottom = 41;
  const level = bottom - ((bottom - top) * n) / cap;
  const body = 'M9 19c0-2 1-3 3-3h24c2 0 3 1 3 3v14c0 5-4 8-8 8H17c-4 0-8-3-8-8z';
  const flap = 'M8.5 16c0-3 2-5 5-5h21c3 0 5 2 5 5v3c-3 5-9 7.5-15.5 7.5S11.5 24 8.5 19z';
  const pips: SvgNode[] = [];
  const span = 20;
  for (let i = 0; i < cap; i += 1) {
    const x = 24 - span / 2 + (cap === 1 ? span / 2 : (span * i) / (cap - 1));
    pips.push(
      el('path', {
        d: ellipsePath(x, 16.5, 1.6, 1.6),
        fill: i < n ? palette.accents.ochre.base : palette.paper,
        stroke: palette.ink,
        'stroke-width': 1,
      }),
    );
  }
  return el('svg', { viewBox: '0 0 48 48', width: size, height: size }, [
    ink(palette, 'M12 12C12 2 36 2 36 12', 2.2, palette.ramps.bark.shade),
    solid(palette, body, palette.ramps.bark.light),
    ...(n > 0
      ? [
          el('path', {
            d: `M9.9 ${level.toFixed(1)}H38.1V33c0 4.4-3.5 7.1-7.1 7.1H17c-3.6 0-7.1-2.7-7.1-7.1z`,
            fill: palette.accents.ochre.light,
          }),
        ]
      : []),
    ink(palette, body),
    solid(palette, flap, palette.ramps.bark.base),
    ...pips,
    solid(palette, 'M22 22.5h4v5h-4z', palette.accents.ochre.base, 1.2),
  ]);
}

/** The team stores: two crates and a basket, as an icon. */
export function drawStoresIcon(palette: Palette, px: number): SvgNode {
  const size = Number.isFinite(px) && px > 0 ? px : 48;
  return el('svg', { viewBox: '0 0 48 48', width: size, height: size }, [
    solid(palette, 'M7 24h15v15H7z', palette.ramps.bark.light),
    ink(palette, 'M7 24l15 15M22 24L7 39', 1.2, palette.ramps.bark.shade),
    solid(palette, 'M12 10h14v14H12z', palette.ramps.bark.base),
    ink(palette, 'M12 17h14M19 10v14', 1.2, palette.ramps.bark.shade),
    solid(palette, 'M25 27h16l-2 12H27z', palette.ramps.sand.base),
    ink(palette, 'M26 31h14M26.6 35h12.8', 1.1, palette.ramps.sand.shade),
    ink(palette, 'M28 27c0-5 10-5 10 0', 1.8, palette.ramps.bark.shade),
  ]);
}

/** The wax seal of a finished unlock, on its own. */
export function drawUnlockSeal(palette: Palette, px: number): SvgNode {
  const size = Number.isFinite(px) && px > 0 ? px : 24;
  return el(
    'svg',
    { viewBox: '-12 -12 24 24', width: size, height: size },
    sealParts(palette, 0, 0, 1),
  );
}

/** A wax seal centred at (x, y), scaled by s: a scalloped rim, a pressed ring and a knot mark. */
export function sealParts(palette: Palette, x: number, y: number, s: number): SvgNode[] {
  const rim: string[] = [];
  const n = 12;
  for (let i = 0; i <= n; i += 1) {
    const a = (Math.PI * 2 * i) / n;
    const r = (i % 2 ? 9 : 10.5) * s;
    rim.push(
      `${i === 0 ? 'M' : 'L'}${(x + Math.cos(a) * r).toFixed(2)} ${(y + Math.sin(a) * r).toFixed(2)}`,
    );
  }
  return [
    el('path', {
      d: `${rim.join('')}Z`,
      fill: palette.accents.rose.base,
      stroke: palette.accents.rose.shade,
      'stroke-width': 1 * s,
      'stroke-linejoin': 'round',
    }),
    el('path', {
      d: ellipsePath(x, y, 6.2 * s, 6.2 * s),
      fill: 'none',
      stroke: palette.accents.rose.shade,
      'stroke-width': 1.1 * s,
    }),
    el('path', {
      d: `M${(x - 3 * s).toFixed(2)} ${(y + 0.3 * s).toFixed(2)}l${(2.2 * s).toFixed(2)} ${(2.4 * s).toFixed(2)}l${(4 * s).toFixed(2)} ${(-5 * s).toFixed(2)}`,
      fill: 'none',
      stroke: palette.paper,
      'stroke-width': 1.8 * s,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  ];
}

/**
 * An unlock's work as an ink bar: an outline filled to `fraction` with a wash, and, with `steps`, a tick
 * between each unit of work. `width` × 14 px.
 */
export function drawWorkBar(palette: Palette, width: number, fraction: number, steps = 0): SvgNode {
  const w = Number.isFinite(width) && width > 24 ? width : 120;
  const f = clamp(fraction, 0, 1);
  const h = 14;
  const x0 = 2;
  const inner = w - 4;
  const ticks: string[] = [];
  const n = Math.round(clamp(steps, 0, 40));
  for (let i = 1; i < n; i += 1) {
    const x = x0 + (inner * i) / n;
    ticks.push(`M${x.toFixed(1)} 4V10`);
  }
  const outline = `M${x0 + 3} 2H${x0 + inner - 3}c2 0 3 1.5 3 5s-1 5-3 5H${x0 + 3}c-2 0-3-1.5-3-5s1-5 3-5z`;
  return el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h }, [
    el('path', { d: outline, fill: palette.paper }),
    ...(f > 0
      ? [
          el('path', {
            d: `M${x0 + 1} 3.2H${(x0 + 1 + (inner - 2) * f).toFixed(1)}V10.8H${x0 + 1}z`,
            fill: palette.accents.sage.base,
          }),
        ]
      : []),
    ...(ticks.length
      ? [
          el('path', {
            d: ticks.join(''),
            fill: 'none',
            stroke: palette.inkSoft,
            'stroke-width': 0.9,
            'stroke-linecap': 'round',
          }),
        ]
      : []),
    el('path', {
      d: outline,
      fill: 'none',
      stroke: palette.ink,
      'stroke-width': 1.4,
      'stroke-linejoin': 'round',
    }),
  ]);
}
