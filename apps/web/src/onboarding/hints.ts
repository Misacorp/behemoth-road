/**
 * First-encounter hints: the first time a player sees a fog edge, a trap, a threat, a settlement, or hunger
 * raising peril in the real game, one small passing hint says so, once, ever (the server keeps the record).
 * Each says only that the thing is there, never what it does: hint, don't explain. These are the pure rules
 * for which hint is due; `Hint.tsx` shows it.
 */
import { FEATURE_TYPES, type SeenId } from '@behemoth-road/core';
import type { PlayerView } from '../api/schema.ts';

export type HintId = Extract<SeenId, `hint:${string}`>;

/** Hints in the order they are shown when several are due at once. */
export const HINT_ORDER: readonly HintId[] = [
  'hint:fog',
  'hint:threat',
  'hint:trap',
  'hint:settlement',
  'hint:hunger',
];

const TRAPS = new Set(FEATURE_TYPES.filter((f) => f.kind === 'trap').map((f) => f.id));

/** What the view shows right now that a hint is about (hunger is an event, so the caller says so). */
export function sightings(view: PlayerView, hungry: boolean): ReadonlySet<HintId> {
  const out = new Set<HintId>();
  const me = view.game.characters.find((c) => c.id === view.you.characterId);
  // Only in the real game with a character: the practice and the join drawer have their own words.
  if (me?.status !== 'active') return out;
  // The map always has an edge of unseen ground: the first sight of it.
  out.add('hint:fog');
  if (view.game.threats.length > 0) out.add('hint:threat');
  if (Object.values(view.game.features).some((f) => f.revealed && TRAPS.has(f.type))) {
    out.add('hint:trap');
  }
  if (view.game.settlements.length > 0) out.add('hint:settlement');
  if (hungry) out.add('hint:hunger');
  return out;
}

/** The hint due now: the first in order that is in sight and not yet seen; null when none. */
export function dueHint(
  view: PlayerView,
  seen: ReadonlySet<string>,
  hungry: boolean,
): HintId | null {
  const sight = sightings(view, hungry);
  return HINT_ORDER.find((id) => sight.has(id) && !seen.has(id)) ?? null;
}

/** The one short line of each hint (the storyboard's copy). */
export const HINT_LINES: Readonly<Record<HintId, string>> = {
  'hint:fog': 'Not seen yet.',
  'hint:trap': 'Danger underfoot.',
  'hint:threat': 'It moves at dusk.',
  'hint:settlement': 'Folk live here. Mind them.',
  'hint:hunger': 'Hungry. Peril rises.',
};

/** How long a hint stays, in ms. */
export const HINT_MS = 4200;
