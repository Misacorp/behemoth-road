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

/**
 * The hex a tap means. A character stands upright above its hex, so a tap on its figure picks the hex it
 * stands on, not the hex behind its head. Otherwise the hex under the point.
 */
/** Where a character's feet are on its hex: the art kit's own standee placement (`figureAnchor`). */
export function feetOf(p: Projection, h: Hex, slot = 0, context: FigureContext = {}): Point {
  return figureAnchor(p, h, slot, context);
}

export function pickHex(p: Projection, point: Point, character: Hex | null): Hex {
  if (character) {
    const feet = feetOf(p, character);
    const inX = Math.abs(point.x - feet.x) <= 0.3 * p.size;
    const inY = point.y <= feet.y + 0.12 * p.size && point.y >= feet.y - 0.85 * p.size;
    if (inX && inY) return character;
  }
  return worldToHex(p, point);
}
