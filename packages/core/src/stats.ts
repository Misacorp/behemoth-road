/**
 * The season's tallies, for the recap when it ends: counters kept as events happen (never recomputed
 * from hidden facts), shared and per character. Plain numbers, public, and derived only from public
 * events, so showing them leaks nothing. Deterministic like the rest of the core.
 */

import type { GameEvent } from './features.ts';
import type { GameStateView } from './state.ts';

/** What one character did this season. */
export interface CharacterTally {
  /** Hexes they explored (entering or surveying a hex nobody had explored). */
  readonly explored: number;
  /** Strikes they made on threats. */
  readonly strikes: number;
  /** Units they gathered from resource nodes. */
  readonly gathered: number;
  /** Times they fed the creature. */
  readonly fed: number;
}

/** What the team did this season. */
export interface SharedTally {
  /** Threats cleared by a strike. */
  readonly threatsTurned: number;
  /** Sites opened with a find. */
  readonly finds: number;
  /** Unlocks the team finished. */
  readonly unlocks: number;
  /** Settlements that turned friendly. */
  readonly befriended: number;
  /** The highest peril reached. */
  readonly peakPeril: number;
}

export interface SeasonStats {
  readonly shared: SharedTally;
  /** By character id; a character who did nothing has no entry. */
  readonly byCharacter: Readonly<Record<string, CharacterTally>>;
}

export const EMPTY_CHARACTER_TALLY: CharacterTally = {
  explored: 0,
  strikes: 0,
  gathered: 0,
  fed: 0,
};

export const emptyStats = (): SeasonStats => ({
  shared: { threatsTurned: 0, finds: 0, unlocks: 0, befriended: 0, peakPeril: 0 },
  byCharacter: {},
});

/**
 * The state with its tallies updated for these events. `actorId` is who caused events that carry no
 * character of their own (an `explore` from a move or survey). Older games without `stats` start empty.
 */
export const recordEvents = <S extends GameStateView>(
  state: S,
  events: readonly GameEvent[],
  actorId?: string,
): S => {
  let shared = (state.stats as SeasonStats | undefined)?.shared ?? emptyStats().shared;
  const byCharacter: Record<string, CharacterTally> = { ...state.stats?.byCharacter };
  const bump = (id: string | undefined, key: keyof CharacterTally, by = 1): void => {
    if (id === undefined || by <= 0) return;
    const was = byCharacter[id] ?? EMPTY_CHARACTER_TALLY;
    byCharacter[id] = { ...was, [key]: was[key] + by };
  };
  for (const e of events) {
    switch (e.kind) {
      case 'explore':
        bump(actorId, 'explored');
        break;
      case 'threat-hit':
        bump(e.characterId, 'strikes');
        break;
      case 'threat-cleared':
        shared = { ...shared, threatsTurned: shared.threatsTurned + 1 };
        break;
      case 'gather':
        bump(e.characterId, 'gathered', e.amount);
        break;
      case 'fed':
        bump(e.characterId, 'fed');
        break;
      case 'find':
        shared = { ...shared, finds: shared.finds + 1 };
        break;
      case 'unlock-done':
        shared = { ...shared, unlocks: shared.unlocks + 1 };
        break;
      case 'befriended':
        shared = { ...shared, befriended: shared.befriended + 1 };
        break;
      case 'peril':
        shared = { ...shared, peakPeril: Math.max(shared.peakPeril, e.to) };
        break;
      default:
        break;
    }
  }
  return { ...state, stats: { shared, byCharacter } };
};
