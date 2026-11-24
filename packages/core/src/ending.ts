/**
 * How a season ended, for the ending screen: a title from the creature's fate and the outcome, and the key
 * of a line of story. Public: a pure function of the player view, and `null` while the season goes on.
 *
 * - Titles follow fate: a creature that stays is "Arrived" (or "Arrived, wounded"), one that goes on is
 *   "Gone on" (or "Gone on, wounded"); a lost season is "Lost".
 * - The line of a safe or wounded ending is `${creatureId}.${outcome}`.
 * - The line of a lost season follows its largest source of peril (`stats.peril.added`; a tie goes to the
 *   source that added peril last): `ending.lost.hunger`, `ending.lost.pursuer` for a threat whose type
 *   has `ending: 'pursuer'`, and no line (`null`) for any other source.
 */

import { creatureType } from './care.ts';
import type { Fate } from './content/index.ts';
import type { GameStateView, SeasonOutcome } from './state.ts';
import { PERIL_HUNGER, threatOfSource } from './stats.ts';
import { threatType } from './threats.ts';

export const ENDING_TITLES: Readonly<Record<Fate, Readonly<Record<SeasonOutcome, string>>>> = {
  stays: { safe: 'Arrived', wounded: 'Arrived, wounded', lost: 'Lost' },
  'goes-on': { safe: 'Gone on', wounded: 'Gone on, wounded', lost: 'Lost' },
};

export interface Ending {
  readonly outcome: SeasonOutcome;
  readonly fate: Fate;
  /** The creature's kind (content id). */
  readonly creature: string;
  readonly title: string;
  /** The key of the line of story under the title, or null when there is none. */
  readonly line: string | null;
}

/** The source that added the most peril; a tie goes to the one that added last. Null when none did. */
export const largestPerilSource = (state: GameStateView): string | null => {
  let best: string | null = null;
  let most = 0;
  // `added` lists a source after every addition (see `recordEvents`), so a later key is a later strike.
  for (const [source, amount] of Object.entries(state.stats.peril.added)) {
    if (amount > 0 && amount >= most) {
      best = source;
      most = amount;
    }
  }
  return best;
};

const lostLine = (state: GameStateView): string | null => {
  const source = largestPerilSource(state);
  if (source === null) return null;
  if (source === PERIL_HUNGER) return 'ending.lost.hunger';
  const type = threatOfSource(source);
  if (type !== null && threatType(type).ending === 'pursuer') return 'ending.lost.pursuer';
  return null;
};

export const endingOf = (state: GameStateView): Ending | null => {
  if (state.season.status !== 'over') return null;
  const { outcome } = state.season;
  const creature = state.creature.kind;
  const { fate } = creatureType(creature);
  return {
    outcome,
    fate,
    creature,
    title: ENDING_TITLES[fate][outcome],
    line: outcome === 'lost' ? lostLine(state) : `${creature}.${outcome}`,
  };
};
