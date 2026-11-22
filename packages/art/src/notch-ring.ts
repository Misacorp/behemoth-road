/**
 * The notch ring around a role emblem on the HUD: one notch per action of work toward the next skill pick,
 * the earned ones inked in the role's tint, the rest faint. When the ring is full a pick is ready: the ring
 * closes and a warm glow rises behind the emblem (`data-glow="ready"`, for the web to pulse).
 */
import { ellipsePath } from './geom.ts';
import { drawIcon, type RoleId } from './icons.ts';
import { accentRamp, type Palette } from './palette.ts';
import { ROLE_TINT } from './role-tint.ts';
import { el, type SvgNode } from './svg.ts';

const clampInt = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo;

/** The warm glow behind a role emblem when a pick is ready, on the ring's 64-unit grid. */
export function pickGlowParts(palette: Palette): SvgNode[] {
  const glow = palette.accents.ochre;
  return [
    el('g', { 'data-glow': 'ready' }, [
      el('path', { d: ellipsePath(32, 32, 31.5, 31.5), fill: glow.light, opacity: 0.3 }),
      el('path', { d: ellipsePath(32, 32, 29.5, 29.5), fill: glow.light, opacity: 0.55 }),
    ]),
  ];
}

/** Just the pick-ready glow, as a self-contained `<svg>` of `size` px (to lay under an emblem of your own). */
export function drawPickGlow(palette: Palette, size: number): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 64;
  return el('svg', { viewBox: '0 0 64 64', width: px, height: px }, pickGlowParts(palette));
}

/**
 * A role emblem ringed by `perPick` notches, the first `notches` earned. The ring is `size` px square (the
 * emblem sits in its middle at 3/4 of that). With `notches >= perPick` the ring closes and glows.
 */
export function drawNotchRing(
  palette: Palette,
  role: RoleId,
  notches: number,
  perPick: number,
  size = 64,
): SvgNode {
  const px = Number.isFinite(size) && size > 0 ? size : 64;
  const per = clampInt(perPick, 1, 24);
  const earned = clampInt(notches, 0, per);
  const ready = earned >= per;
  const tint = accentRamp(palette, ROLE_TINT[role]);
  const r0 = 25.6;
  const r1 = 30.6;
  const gap = per > 1 ? Math.min(0.12, 0.5 / per) : 0;
  const ticks: SvgNode[] = [];
  for (let i = 0; i < per; i += 1) {
    // Notches run clockwise from the top; each a short thick radial bar (a long bar for few notches).
    const a = -Math.PI / 2 + ((i + 0.5) / per) * Math.PI * 2;
    const half = Math.PI / per - gap;
    const arc = (r: number, t: number): string =>
      `${(32 + Math.cos(t) * r).toFixed(2)} ${(32 + Math.sin(t) * r).toFixed(2)}`;
    const d = `M${arc(r0, a - half)}L${arc(r1, a - half)}L${arc(r1, a + half)}L${arc(r0, a + half)}Z`;
    const on = i < earned;
    ticks.push(
      el('path', {
        d,
        fill: on ? (ready ? palette.accents.ochre.base : tint.base) : palette.paper,
        stroke: on ? palette.ink : palette.inkSoft,
        'stroke-width': on ? 1.3 : 0.9,
        'stroke-linejoin': 'round',
        'data-notch': on ? 'earned' : 'empty',
      }),
    );
  }
  const emblem = drawIcon(`role:${role}`, palette, 48);
  return el(
    'svg',
    {
      viewBox: '0 0 64 64',
      width: px,
      height: px,
      'data-notches': earned,
      'data-per-pick': per,
      'data-ready': ready ? 'yes' : 'no',
    },
    [
      ...(ready ? pickGlowParts(palette) : []),
      ...ticks,
      el('g', { transform: 'translate(10 10) scale(0.75)' }, emblem.children),
    ],
  );
}
