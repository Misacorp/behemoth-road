/**
 * Tap picking. The map draws the scene's children straight into its world group (no viewBox), so world
 * px are the art kit's drawing coordinates and its `screenToHex` applies directly.
 */
import {
  figureAnchor,
  screenToHex,
  type FigureContext,
  type Hex,
  type Projection,
} from '@behemoth-road/art';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The hex whose top face contains a world point. */
export const worldToHex = (p: Projection, point: Point): Hex => screenToHex(p, point.x, point.y);

/** What a tap means: your own figure (wherever it stands, on a hex or on the creature's back), or a hex. */
export type Target = { readonly kind: 'me' } | { readonly kind: 'hex'; readonly hex: Hex };

/** Where a character's feet are on its hex: the art kit's own standee placement (`figureAnchor`). */
export function feetOf(p: Projection, h: Hex, slot = 0, context: FigureContext = {}): Point {
  return figureAnchor(p, h, slot, context);
}

/**
 * A character stands upright, so its figure covers the hex behind it: a tap on the figure (feet at
 * `feet`) means the character. Anything else means the hex under the point.
 */
export function pickTarget(p: Projection, point: Point, feet: Point | null): Target {
  if (feet) {
    const inX = Math.abs(point.x - feet.x) <= 0.3 * p.size;
    const inY = point.y <= feet.y + 0.12 * p.size && point.y >= feet.y - 0.85 * p.size;
    if (inX && inY) return { kind: 'me' };
  }
  return { kind: 'hex', hex: worldToHex(p, point) };
}
