/**
 * Depth rules for what stands on a hex. One rule: every entity (a character, a threat, the capybara, the cart)
 * draws in front of the features, props and traces of its own hex, however far back its feet are; depth across
 * hexes stays the painter's order (back to front by feet), so a figure on a hex behind still sits behind a tall
 * tree on a hex in front.
 */
import type { Point } from './geom.ts';
import { hexCenter, type Hex, type Projection } from './projection.ts';

/** What stands on a hex and must draw in front of that hex's own features (the creature keeps its own layers). */
export type EntityKind = 'character' | 'threat' | 'lure' | 'cart';

/**
 * How far to the front of a hex's middle (in hex sizes on the ground plane) entities sort at least: just past the
 * furthest a prop spot reaches (0.5 across, 0.85 deep).
 */
export const ENTITY_FRONT = 0.43;

/**
 * The y an entity with feet at `feet` sorts at on `hex`: its own feet, but never behind the front of the hex's
 * props. A tiny share of its own offset keeps entities on one hex in their natural order.
 */
export function entityDepth(p: Projection, hex: Hex, feet: Point): number {
  const c = hexCenter(p, hex.q, hex.r);
  const front = c.y + ENTITY_FRONT * p.size * p.squash;
  return Math.max(feet.y, front) + (feet.y - c.y) * 1e-3;
}
