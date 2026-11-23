/**
 * What the stance control and the wait button show, from the view and the core's rules (the client has
 * none of its own): your stance and whether it falls back to rest where you stand, the choices, and
 * whether you can end your day. Pure, so it is tested here.
 */
import {
  type Character,
  DEFAULT_STANCE,
  effectiveStance,
  type GameStateView,
  REST_TAG,
  STANCES,
  stanceFits,
  stanceType,
} from '@behemoth-road/core';

export interface StanceChoice {
  readonly id: string;
  /** The glyph's name (content). */
  readonly icon: string;
  /** What it needs holds where you stand now (an unfit one is drawn faded; the pick still sticks). */
  readonly fits: boolean;
  readonly chosen: boolean;
}

export interface StanceView {
  /** The stance you chose. */
  readonly chosen: string;
  readonly icon: string;
  /** It does not fit where you are, so rest acts instead (the control shows it faded, with a moon). */
  readonly fallback: boolean;
  readonly choices: readonly StanceChoice[];
}

/** A character's stance as the control shows it. */
export function stanceView(state: GameStateView, c: Character): StanceView {
  const chosen = stanceType(c.stance);
  return {
    chosen: chosen.id,
    icon: chosen.icon,
    fallback: !stanceFits(state, c, chosen),
    choices: STANCES.map((s) => ({
      id: s.id,
      icon: s.icon,
      fits: stanceFits(state, c, s),
      chosen: s.id === chosen.id,
    })),
  };
}

/** The stance that acts at the tick for a character: what the map and the roster show (null for rest). */
export function actingStance(state: GameStateView, c: Character): string | null {
  const s = effectiveStance(state, c);
  return s.tags.includes(REST_TAG) ? null : s.id;
}

/** The glyph name of a stance id (the default's for an unknown one). */
export const stanceIcon = (id: string): string => stanceType(id).icon;

/** Ending your day is possible with actions left and not already waiting (never for a lost character). */
export const canWait = (c: Character | undefined): boolean =>
  c !== undefined && c.status === 'active' && c.actionsLeft > 0 && !c.waiting;

/**
 * What a tap on the wait button does: the first arms it, the second (while armed) ends the day. A tap
 * when it is not possible does nothing and leaves it disarmed.
 */
export function waitTap(armed: boolean, enabled: boolean): { armed: boolean; fire: boolean } {
  if (!enabled) return { armed: false, fire: false };
  return armed ? { armed: false, fire: true } : { armed: true, fire: false };
}

export { DEFAULT_STANCE };
