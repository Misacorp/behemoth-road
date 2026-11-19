/**
 * Where a character can be put without spending actions: at the start of a
 * game, and when the creature steps onto the hex a character stands on.
 */

import { entryInto } from './actions.ts';
import { directionOffset, type Hex, hexRing } from './hex.ts';
import type { GameState } from './state.ts';
import { isReachable } from './window.ts';

/** A hex a character could stand on: in reach, passable, and not under the creature. */
export const isFreeHex = (state: GameState, h: Hex): boolean =>
  isReachable(state, h) && entryInto(state, h) !== null;

/**
 * How far a hex lies ahead of the creature along its heading, as a whole number
 * (four times the dot product on a flat-top layout, so no floating point).
 * 0 is beside, negative is behind, positive is ahead.
 */
const forwardness = (state: GameState, h: Hex): number => {
  const { centre, heading } = state.creature;
  const d = directionOffset(heading);
  const q = h.q - centre.q;
  const r = h.r - centre.r;
  return 3 * q * d.q + (2 * r + q) * (2 * d.r + d.q);
};

/** Lower is better: beside the creature first, then behind it, ahead of it last. */
const preference = (state: GameState, h: Hex): number => {
  const f = forwardness(state, h);
  return f <= 0 ? -f : 1_000_000 + f;
};

/**
 * The nearest free hex to `from`, searching ring by ring. Within a ring the hexes
 * beside the creature come first, then those behind it, then ahead; remaining ties
 * follow the ring's fixed order. Returns null only if no free hex is in reach at all.
 */
export const nearestFreeHex = (state: GameState, from: Hex): Hex | null => {
  const { creatureRadius, windowRadius, graceDays } = state.config;
  // Nothing beyond this distance can be in reach (the window plus its trailing grace).
  const maxRadius = 2 * (windowRadius + graceDays) + creatureRadius + 1;
  for (let radius = 1; radius <= maxRadius; radius++) {
    const free = hexRing(from, radius).filter((h) => isFreeHex(state, h));
    if (free.length === 0) continue;
    return free.reduce((best, h) => (preference(state, h) < preference(state, best) ? h : best));
  }
  return null;
};
