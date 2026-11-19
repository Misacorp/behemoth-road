/**
 * Screen-to-hex picking: the inverse of the art kit's `hexCenter`. Taps find their hex by maths, not by
 * per-tile elements. Kept in one small module so the art kit's own `screenToHex` can replace it.
 */
import type { Hex, Projection } from '@behemoth-road/art';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Rounds fractional axial coordinates to the hex that contains them (cube rounding). */
export function roundHex(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // Never return -0: keys and equality checks stay simple.
  return { q: rq + 0, r: rr + 0 };
}

/** The hex whose top face contains a world point (the plane the art kit's `hexCenter` maps onto). */
export function worldToHex(p: Projection, point: Point): Hex {
  const q = point.x / (p.size * 1.5);
  const r = point.y / (p.size * Math.sqrt(3) * p.squash) - q / 2;
  return roundHex(q, r);
}

/**
 * The hex a tap means. A character stands upright above its hex, so a tap on its figure picks the hex it
 * stands on, not the hex behind its head. Otherwise the hex under the point.
 */
export function pickHex(p: Projection, point: Point, character: Hex | null): Hex {
  if (character) {
    const c = {
      x: p.size * 1.5 * character.q,
      y: p.size * Math.sqrt(3) * (character.r + character.q / 2) * p.squash,
    };
    const feet = { x: c.x - 0.05 * p.size, y: c.y + 0.3 * p.size * p.squash };
    const inX = Math.abs(point.x - feet.x) <= 0.3 * p.size;
    const inY = point.y <= feet.y + 0.12 * p.size && point.y >= feet.y - 0.85 * p.size;
    if (inX && inY) return character;
  }
  return worldToHex(p, point);
}
