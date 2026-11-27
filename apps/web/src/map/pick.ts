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
  /** A lure animal or the cart, tapped on its drawing. */
  | { readonly kind: 'lure'; readonly id: string }
  | { readonly kind: 'cart'; readonly id: string }
  | { readonly kind: 'hex'; readonly hex: Hex };

/** Another character's figure (or a lure's, or the cart's): its id and where its feet are. */
export interface OtherFigure {
  readonly id: string;
  readonly feet: Point;
  /** What it is (default a character). */
  readonly kind?: 'character' | 'lure' | 'cart' | 'me';
}

/** Where a character's feet are on its hex: the art kit's own standee placement (`figureAnchor`). */
export function feetOf(p: Projection, h: Hex, slot = 0, context: FigureContext = {}): Point {
  return figureAnchor(p, h, slot, context);
}

const covers = (p: Projection, feet: Point, point: Point, wide = 0.3): boolean =>
  Math.abs(point.x - feet.x) <= wide * p.size &&
  point.y <= feet.y + 0.12 * p.size &&
  point.y >= feet.y - 0.85 * p.size;

/** How far either side of its feet each kind of figure takes a tap, in hex sizes. */
const HALF_WIDTH = { character: 0.3, lure: 0.4, cart: 0.5 } as const;

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
  // Every figure alike: of those covering the point, the one drawn in front takes it. Which of several
  // things on one hex is meant is not decided here: the picker (`pickEntries`) asks.
  const figures: OtherFigure[] = [
    ...(feet ? [{ id: '', feet, kind: 'me' as const }] : []),
    ...others,
  ];
  let best: OtherFigure | null = null;
  for (const o of figures) {
    const kind = o.kind ?? 'character';
    if (!covers(p, o.feet, point, kind === 'me' ? 0.3 : HALF_WIDTH[kind])) continue;
    if (best === null || o.feet.y > best.feet.y) best = o;
  }
  if (!best) return { kind: 'hex', hex: worldToHex(p, point) };
  const kind = best.kind ?? 'character';
  return kind === 'me' ? { kind: 'me' } : { kind, id: best.id };
}
