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
export type Target =
  | { readonly kind: 'me' }
  /** Another player's character, tapped on its figure. */
  | { readonly kind: 'character'; readonly id: string }
  | { readonly kind: 'hex'; readonly hex: Hex };

/** Another character's figure: its id and where its feet are. */
export interface OtherFigure {
  readonly id: string;
  readonly feet: Point;
}

/** Where a character's feet are on its hex: the art kit's own standee placement (`figureAnchor`). */
export function feetOf(p: Projection, h: Hex, slot = 0, context: FigureContext = {}): Point {
  return figureAnchor(p, h, slot, context);
}

const covers = (p: Projection, feet: Point, point: Point): boolean =>
  Math.abs(point.x - feet.x) <= 0.3 * p.size &&
  point.y <= feet.y + 0.12 * p.size &&
  point.y >= feet.y - 0.85 * p.size;

/**
 * A character stands upright, so its figure covers the hex behind it: a tap on a figure means that
 * character (you, or another player's). Figures overlap, so of the figures covering the point the one drawn
 * in front (feet lowest on screen) takes the tap. Anything else means the hex under the point.
 */
export function pickTarget(
  p: Projection,
  point: Point,
  feet: Point | null,
  others: readonly OtherFigure[] = [],
): Target {
  let best: { target: Target; y: number } | null = null;
  if (feet && covers(p, feet, point)) best = { target: { kind: 'me' }, y: feet.y };
  for (const o of others) {
    if (covers(p, o.feet, point) && (best === null || o.feet.y > best.y)) {
      best = { target: { kind: 'character', id: o.id }, y: o.feet.y };
    }
  }
  return best?.target ?? { kind: 'hex', hex: worldToHex(p, point) };
}
