/**
 * The tow line, from the core's checks: a rider throws it from the target's character card, and the target
 * grabs it from their own here card. Nothing here knows a rule; the cost, the reach and every refusal are the
 * core's, and the reason a button is greyed is the refusal's tip.
 */
import { checkAction, type GameStateView } from '@behemoth-road/core';
import type { TipId } from '../text/tips.ts';
import { whyTip } from './why.ts';

export interface TowOption {
  readonly cost: number;
  readonly enabled: boolean;
  readonly why?: TipId;
}

/** Refusals that mean the line is not a thing for this pair at all (no button, so nothing is hinted). */
const NOT_OFFERED: ReadonlySet<string> = new Set([
  'needs-unlock',
  'not-riding',
  'on-creature',
  'invalid-action',
  'unknown-character',
  'character-lost',
  'season-over',
  'waiting',
]);

/**
 * Throwing the line to `targetId`, for their character card: offered to a rider once the team has the line
 * (faded when it cannot be done now, with the core's reason), never otherwise.
 */
export function throwOption(
  game: GameStateView,
  characterId: string,
  targetId: string,
): TowOption | null {
  const check = checkAction(game, characterId, { kind: 'throw-line', to: targetId });
  if (check.ok) return { cost: check.cost, enabled: true };
  if (NOT_OFFERED.has(check.reason) || check.cost === undefined) return null;
  return { cost: check.cost, enabled: false, why: whyTip(check.reason) };
}

/** The line thrown to you, for your own here card: offered while it lasts (faded without the actions). */
export function grabOption(game: GameStateView, characterId: string): TowOption | null {
  if (!game.creature.tows.some((t) => t.to === characterId)) return null;
  const check = checkAction(game, characterId, { kind: 'grab-line' });
  if (check.ok) return { cost: check.cost, enabled: true };
  if (check.cost === undefined || check.reason === 'on-creature') return null;
  return { cost: check.cost, enabled: false, why: whyTip(check.reason) };
}
