/** Where an upright figure (a character standee) stands on its hex: one source for the art and for tap picking. */
import type { Point } from './geom.ts';
import { hexCenter, onPlane, type Hex, type Projection } from './projection.ts';

export interface FigureContext {
  /** The hex holds a site (a ruin), so figures stand to its front left. */
  readonly site?: boolean;
  /** The hex holds a tall feature, so figures stand to its front left, clear of its base. */
  readonly tall?: boolean;
}

/**
 * The feet of the `slot`-th figure on a hex (0 for the first). Figures stand a little in front of the
 * middle, or to the front left of a site; each further figure on the same hex stands a step to the right.
 */
export function figureAnchor(
  p: Projection,
  hex: Hex,
  slot = 0,
  context: FigureContext = {},
): Point {
  const s = Number.isFinite(slot) && slot > 0 ? Math.floor(slot) : 0;
  const tall = context.tall && !context.site;
  const dx = (context.site ? -0.5 : tall ? -0.36 : -0.05) + s * 0.32;
  return onPlane(p, hexCenter(p, hex.q, hex.r), dx, (tall ? 0.36 : 0.3) - s * 0.06);
}
