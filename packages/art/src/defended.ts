/**
 * The telegraph that wardens are defending the creature today, readable at map scale by every player.
 * Each warden's own raised shield (`escort.ts`) is small; this one marks the creature's whole footprint.
 */
import { boxOf, ellipsePath, type Point } from './geom.ts';
import { shieldPath } from './escort.ts';
import type { Palette } from './palette.ts';
import { inkAttrs, type Drawn } from './props.ts';
import { el, type SvgNode } from './svg.ts';

/** The most shields the defended mark draws. */
export const DEFENDED_MAX = 6;

/**
 * A slate ring on the ground round the creature's footprint (`ground`, drawn under the creature) and, in
 * front of it, one big shield per defender (`banner`, drawn over it; `count` is capped at `DEFENDED_MAX`).
 * Parts carry `data-mark="defended"` and `data-count`. `origin` is the creature's centre on screen, `size`
 * the hex size and `squash` the plane's squash. With no defenders both are empty.
 */
export function drawDefended(
  palette: Palette,
  origin: Point,
  size: number,
  squash: number,
  ink: number,
  count: number,
): { readonly ground: Drawn; readonly banner: Drawn } {
  const n = Number.isFinite(count) ? Math.min(DEFENDED_MAX, Math.max(0, Math.floor(count))) : 0;
  if (n === 0) {
    const none = { nodes: [], box: boxOf([origin]) };
    return { ground: none, banner: none };
  }
  const rx = 1.9 * size;
  const ry = rx * squash * 0.92;
  const ring = ellipsePath(origin.x, origin.y, rx, ry);
  const ground: Drawn = {
    nodes: [
      el('g', { 'data-mark': 'defended', 'data-count': n }, [
        el('path', {
          d: ring,
          fill: 'none',
          stroke: palette.accents.slate.light,
          'stroke-width': size * 0.5,
          opacity: 0.4,
        }),
        el('path', {
          d: ring,
          fill: 'none',
          stroke: palette.accents.slate.shade,
          'stroke-width': Math.max(ink * 2, size * 0.045),
          'stroke-dasharray': `${(size * 0.2).toFixed(1)} ${(size * 0.12).toFixed(1)}`,
          'stroke-linecap': 'round',
          opacity: 0.9,
        }),
      ]),
    ],
    box: boxOf([
      { x: origin.x - rx - size * 0.25, y: origin.y - ry - size * 0.25 },
      { x: origin.x + rx + size * 0.25, y: origin.y + ry + size * 0.25 },
    ]),
  };
  // One shield per defender, in a row on the ring's front edge, each on a paper disc so it reads on any ground.
  const w = size * 0.46;
  const h = size * 0.56;
  const gap = w * 1.12;
  const y = origin.y + ry + size * 0.08;
  const shields: SvgNode[] = [];
  const pts: Point[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = origin.x + (i - (n - 1) / 2) * gap;
    pts.push({ x: x - w * 0.7, y: y - h * 0.7 }, { x: x + w * 0.7, y: y + h * 0.7 });
    shields.push(
      el('path', {
        d: ellipsePath(x, y, w * 0.72, w * 0.72),
        fill: palette.paper,
        stroke: palette.accents.slate.shade,
        'stroke-width': ink * 1.4,
      }),
      el('path', {
        d: shieldPath(x, y + 0.02 * h, w, h),
        fill: palette.accents.slate.base,
        stroke: palette.ink,
        'stroke-width': ink * 1.1,
        'stroke-linejoin': 'round',
      }),
      el('path', {
        d: `M${x.toFixed(1)} ${(y - h * 0.38).toFixed(1)}V${(y + h * 0.4).toFixed(1)}`,
        ...inkAttrs(palette.accents.slate.light, ink * 1.5),
      }),
    );
  }
  return {
    ground,
    banner: {
      nodes: [el('g', { 'data-mark': 'defended', 'data-count': n }, shields)],
      box: boxOf(pts),
    },
  };
}
