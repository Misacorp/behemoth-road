/**
 * What the player has been shown once, and what they may be shown next. The record is the server's (per
 * Discord user, so it follows the account across devices); the client reads it from the view and adds to
 * it with `POST /api/me/seen`. These are the pure rules over it.
 *
 * A new player (no character yet) sees the intro cards, then the practice map, then the real game. A
 * player who already has a character (everyone who played before this existed) never gets the intro or the
 * practice unasked; both stay open to them from the day readout.
 */
import type { SeenId } from '@behemoth-road/core';
import type { PlayerView } from '../api/schema.ts';

export const hasSeen = (seen: ReadonlySet<string>, id: SeenId): boolean => seen.has(id);

/** Where a first open starts. */
export type Stage = 'intro' | 'practice' | 'game';

/**
 * The stage a player opens in: the intro for a new player who has not seen it, the practice for one who
 * has seen the intro but not finished or skipped the practice, else the game.
 */
export function openingStage(view: PlayerView, seen: ReadonlySet<string>): Stage {
  if (view.you.characterId !== null) return 'game';
  if (!hasSeen(seen, 'intro')) return 'intro';
  if (!hasSeen(seen, 'practice')) return 'practice';
  return 'game';
}

/** The ids to record when the intro is done or skipped. */
export const AFTER_INTRO: readonly SeenId[] = ['intro'];
/** The ids to record when the practice is finished or skipped (leaving it counts either way). */
export const AFTER_PRACTICE: readonly SeenId[] = ['intro', 'practice'];

/** A new set with ids added (the record only ever grows). */
export const withSeen = (seen: ReadonlySet<string>, ids: readonly string[]): Set<string> =>
  new Set([...seen, ...ids]);
