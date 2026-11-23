/**
 * The season recap as the ending screen shows it, from the player view's public tallies (core
 * `SeasonStats`): a few shared stats, and a few per player with a highlight on whoever led each. Numbers
 * and names only; the icons and their tips carry the meaning. Names are Discord names (text only).
 */
import { type CharacterTally, type SharedTally } from '@behemoth-road/core';
import type { PlayerView } from '../api/schema.ts';
import type { TipId } from '../text/tips.ts';
import { type PerilBreakdown, perilBreakdown } from './perilBreakdown.ts';

export type SharedStatId = 'turned' | 'finds' | 'unlocks' | 'friends';
export type PlayerStatId = 'explored' | 'strikes' | 'gathered';

/** An art-kit icon id and its tip, per stat. */
export const STAT_ICONS: Readonly<Record<SharedStatId | PlayerStatId, string>> = {
  turned: 'strike',
  finds: 'key',
  unlocks: 'hook',
  friends: 'parley',
  explored: 'eye',
  strikes: 'strike',
  gathered: 'hand',
};

export const STAT_TIPS: Readonly<Record<SharedStatId | PlayerStatId, TipId>> = {
  turned: 'stat:turned',
  finds: 'stat:finds',
  unlocks: 'stat:unlocks',
  friends: 'stat:friends',
  explored: 'stat:explored',
  strikes: 'stat:strikes',
  gathered: 'stat:gathered',
};

const SHARED: readonly [SharedStatId, keyof SharedTally][] = [
  ['turned', 'threatsTurned'],
  ['finds', 'finds'],
  ['unlocks', 'unlocks'],
  ['friends', 'befriended'],
];

const PLAYER: readonly PlayerStatId[] = ['explored', 'strikes', 'gathered'];

export interface RecapStat<Id extends string> {
  readonly id: Id;
  readonly value: number;
}

export interface RecapPlayer {
  readonly characterId: string;
  /** The player's Discord name (the character's own name when the owner is unknown). Text only. */
  readonly name: string;
  readonly role: string;
  readonly accent: string;
  /** Each stat, with `top` set on the ones this player led (a value above 0, ties all led). */
  readonly stats: readonly (RecapStat<PlayerStatId> & { readonly top: boolean })[];
}

export interface Recap {
  readonly shared: readonly RecapStat<SharedStatId>[];
  /** The highest peril reached, for the gauge. */
  readonly peakPeril: number;
  /** Where peril came from, for the breakdown under it. */
  readonly perilSources: PerilBreakdown;
  readonly players: readonly RecapPlayer[];
}

const ZERO: CharacterTally = { explored: 0, strikes: 0, gathered: 0, fed: 0 };

/** The recap of a view: every character who played, in join order. */
export function recapOf(
  view: PlayerView,
  who: ReadonlyMap<string, { name: string; player: string | null; accent: string }>,
): Recap {
  const { stats, characters } = view.game;
  const tally = (id: string): CharacterTally => stats.byCharacter[id] ?? ZERO;
  const best = Object.fromEntries(
    PLAYER.map((id) => [id, Math.max(0, ...characters.map((c) => tally(c.id)[id]))]),
  ) as Record<PlayerStatId, number>;
  return {
    shared: SHARED.map(([id, key]) => ({ id, value: stats.shared[key] })),
    peakPeril: stats.shared.peakPeril,
    perilSources: perilBreakdown(stats.peril),
    players: characters.map((c) => {
      const t = tally(c.id);
      const w = who.get(c.id);
      return {
        characterId: c.id,
        name: w?.player ?? w?.name ?? c.name,
        role: c.role,
        accent: w?.accent ?? '',
        stats: PLAYER.map((id) => ({ id, value: t[id], top: t[id] > 0 && t[id] === best[id] })),
      };
    }),
  };
}
