/**
 * The Move action on a tile's card: what it costs you to stand there, and whether you can do it now. The
 * core is the judge (`planPath`: terrain, unlocks, the creature's crossing, the raft, a cart's extra cost);
 * this only reads its answer. A tile that costs more than a day's actions is "too far": the button is greyed
 * and draws the day's pips and a plus. A tile you cannot stand on at all (no way there) offers no Move.
 */
import {
  findCharacter,
  type GameStateView,
  type Place,
  placeEquals,
  planPath,
} from '@behemoth-road/core';
import { moveRefusalTip } from './cart.ts';
import type { TipId } from '../text/tips.ts';

export interface MoveOption {
  /** Actions it takes, as pips on the button: never more than a day's actions (see `plus`). */
  readonly cost: number;
  /** It takes more than a day's actions: the pips are followed by a plus. */
  readonly plus: boolean;
  /** Whether a tap can plan it now. */
  readonly enabled: boolean;
  /** Why it is greyed, as a tip. */
  readonly why?: TipId;
}

/** Far more actions than any day gives: a plan made with these shows what a path really costs. */
const UNLIMITED = 1000;

/** The Move offered for a place, or null where there is none (where you stand, or no way there). */
export function moveOption(
  state: GameStateView,
  characterId: string,
  to: Place,
): MoveOption | null {
  const me = findCharacter(state, characterId);
  if (me?.status !== 'active' || placeEquals(me.at, to)) return null;
  const max = state.config.actionsPerDay;
  const found = planned(state, characterId, to, max);
  if (found === null) return null;
  // Pinned or waiting, the move shows what it would cost, greyed with the reason.
  if (found.enabled && me.pinnedDay !== undefined) {
    return { ...found, enabled: false, why: 'why:pinned' };
  }
  if (found.enabled && me.waiting) return { ...found, enabled: false, why: 'why:other' };
  return found;
}

/** The option the core's plan gives, before pinned and waiting. */
function planned(
  state: GameStateView,
  characterId: string,
  to: Place,
  max: number,
): MoveOption | null {
  const plan = planPath(state, characterId, to);
  if (plan.ok) {
    if (plan.steps.length === 0) return null;
    return { cost: Math.min(plan.cost, max), plus: plan.cost > max, enabled: true };
  }
  if (plan.reason !== 'not-enough-actions') {
    // A refusal the cart gives (you sit in it, it cannot roll there) says why; anything else has no way there.
    const why = moveRefusalTip(plan.reason);
    return why === null ? null : { cost: 0, plus: false, enabled: false, why };
  }
  // Within reach of a rested day or not: the full cost tells which (planned as if with every action).
  const rested = {
    ...state,
    characters: state.characters.map((c) =>
      c.id === characterId ? { ...c, actionsLeft: UNLIMITED } : c,
    ),
  };
  const full = planPath(rested, characterId, to);
  if (!full.ok) return null;
  const plus = full.cost > max;
  const why: TipId = plus ? 'why:too-far' : 'why:not-enough-actions';
  return { cost: Math.min(full.cost, max), plus, enabled: false, why };
}
