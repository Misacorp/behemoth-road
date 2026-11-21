/** Drawing helpers shared by the feature drawers: a mapper from local units to screen, fills, ink lines, blobs. */
import { mapper, type Point } from './geom.ts';
import { inkAttrs, type PropContext } from './props.ts';
import { el, type SvgNode } from './svg.ts';

type Raw = readonly (readonly [number, number])[];

export function kit(c: PropContext) {
  const T = mapper(c.origin, c.k, 1, c.k * c.rise);
  const pts = (raw: Raw): Point[] => raw.map(([x, y]) => T(x, y));
  const fill = (d: string, colour: string, opacity = 1): SvgNode =>
    el('path', opacity === 1 ? { d, fill: colour } : { d, fill: colour, opacity });
  const line = (d: string, scale = 1, colour = c.palette.ink): SvgNode =>
    el('path', { d, ...inkAttrs(colour, c.ink * scale) });
  const blob = (cx: number, cy: number, rx: number, ry: number): Point[] =>
    pts(
      Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 8;
        const f = 1 + (i % 2 ? -0.06 : 0.05);
        return [cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f] as const;
      }),
    );
  return { T, pts, fill, line, blob };
}
