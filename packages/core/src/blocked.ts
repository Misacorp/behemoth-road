/**
 * Hexes a subject will not enter, for a "can't go here" overlay. Reads the public view only, and reads
 * tags, never ids. Each entry's `reason` is a tag-like word so later blockers (water for a ground
 * threat, a cart's terrain, a hazard) can reuse the same overlay.
 */

import { FEARS_FIRE_TAG, firesBurning } from './fire.ts';
import { type Hex, hexesInRange, hexKey } from './hex.ts';
import type { GameStateView } from './state.ts';

/** Why a hex is closed to a subject. Today only `fire`. */
export type BlockReason = 'fire';

export interface BlockedHex {
  readonly hex: Hex;
  readonly reason: BlockReason;
}

/** Whatever has tags and moves: a threat type from content fits. */
export interface BlockSubject {
  readonly tags: readonly string[];
}

/**
 * The hexes the subject will not enter now. A `fears-fire` subject keeps out of the ring of every
 * burning fire (reason `fire`). Each hex is listed once per reason, in a stable order.
 */
export const blockedFor = (state: GameStateView, subject: BlockSubject): BlockedHex[] => {
  const out: BlockedHex[] = [];
  if (subject.tags.includes(FEARS_FIRE_TAG)) {
    const seen = new Set<string>();
    for (const fire of firesBurning(state)) {
      for (const h of hexesInRange(fire.hex, state.config.fireFearRadius)) {
        const key = hexKey(h);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ hex: h, reason: 'fire' });
      }
    }
  }
  return out;
};
