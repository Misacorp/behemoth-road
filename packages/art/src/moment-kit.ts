/** Shared strokes for the moment marks (`marks.ts`, `season-moments.ts`), on the −24…24 grid. */
import { smoothClosed, type Point } from './geom.ts';
import type { AttrValue } from './svg.ts';

const P = (x: number, y: number): Point => ({ x, y });

export function stroke(
  colour: string,
  width: number,
  extra: Record<string, AttrValue> = {},
): Record<string, AttrValue> {
  return {
    fill: 'none',
    stroke: colour,
    'stroke-width': width,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    ...extra,
  };
}

/** A wobbly ring of radius r (a calm, repeatable wobble), as path data. */
export function wobblyRing(r: number, wobble: number, phase: number): string {
  const pts: Point[] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (Math.PI * 2 * i) / 12;
    const f = 1 + wobble * Math.sin(i * 2.3 + phase) * Math.cos(i * 0.7 + phase);
    pts.push(P(Math.cos(a) * r * f, Math.sin(a) * r * f));
  }
  return smoothClosed(pts);
}
