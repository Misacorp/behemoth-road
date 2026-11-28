/**
 * "Show the odds": the one place the web turns the core's `oddsOf` into what the `Odds` component draws.
 * Every action with a roll (a strike on a rockslide, a struggle, a parley, working a site) goes through
 * `oddsView`, so a mark, its bar and its numbers can never disagree with the rule. Pure, so it is tested.
 */
import type { OddsFailure } from '@behemoth-road/art';
import { type Action, type GameStateView, type Odds, oddsOf } from '@behemoth-road/core';

/** What the `Odds` component draws and its tip says. */
export interface OddsView {
  /** Chance of success, 0 to 1 (the bar's proportion). */
  readonly success: number;
  /** The art kit's badge for what failure means. */
  readonly art: OddsFailure;
  /** The core's failure kind, kept for the tests and the tip. */
  readonly kind: string;
  /** Whole percents; they always add up to 100. */
  readonly percent: { readonly success: number; readonly failure: number };
  /** The tip's numbers: "Success 80% · Pinned 20%". */
  readonly note: string;
}

/** The art badge for each failure kind (anything the core adds later draws the plain spark). */
const ART: Readonly<Record<string, OddsFailure>> = {
  buried: 'rocks',
  'still-pinned': 'rocks',
  angered: 'anger',
};

/** The word for each failure kind in the tip's numbers. */
const WORD: Readonly<Record<string, string>> = {
  buried: 'Pinned',
  'still-pinned': 'Pinned',
  angered: 'Angered',
  'site-failed': 'Nothing',
};

/**
 * The view of one roll's odds, or null when there is nothing to show: no roll, or no chance of failing
 * (a sure thing carries no mark).
 */
export function oddsView(odds: Odds | null): OddsView | null {
  if (!odds || !Number.isFinite(odds.success)) return null;
  const success = Math.max(0, Math.min(1, odds.success));
  if (success >= 1) return null;
  const pct = Math.round(success * 100);
  const word = WORD[odds.failureKind] ?? 'Failure';
  return {
    success,
    art: ART[odds.failureKind] ?? 'harm',
    kind: odds.failureKind,
    percent: { success: pct, failure: 100 - pct },
    note: `Success ${String(pct)}% · ${word} ${String(100 - pct)}%`,
  };
}

/** The odds of an action for a character, as the component draws them (null when none). */
export const oddsFor = (
  game: GameStateView,
  characterId: string,
  action: Action,
): OddsView | null => oddsView(oddsOf(game, characterId, action));
