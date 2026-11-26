/**
 * The lure animal (a capybara) as the web reads it from the player view: where it can be led (the core's
 * `canLeadOnto`), and what leading it offers you (the core's `checkAction`, its cost and refusal). Nothing
 * here knows a rule; the hidden reaction of the creature to it is never shown.
 */
import {
  canLeadOnto,
  checkAction,
  type GameStateView,
  type Hex,
  hexDistance,
  hexEquals,
  hexesInRange,
  type Lure,
} from '@behemoth-road/core';
import type { TipId } from '../text/tips.ts';
import { whyTip } from './why.ts';

export const lureById = (state: GameStateView, id: string): Lure | undefined =>
  state.lures.find((l) => l.id === id);

export const lureAt = (state: GameStateView, h: Hex): Lure | undefined =>
  state.lures.find((l) => hexEquals(l.hex, h));

/** The art kit's look of a lure: settled once it has no leads left. */
export const lureLook = (lure: Lure): 'normal' | 'settled' =>
  lure.leadsLeft > 0 ? 'normal' : 'settled';

/** The six neighbours the lure can be led onto, as the core allows them. */
export const leadTargets = (state: GameStateView, lure: Lure): Hex[] =>
  hexesInRange(lure.hex, 1).filter(
    (h) => hexDistance(h, lure.hex) === 1 && canLeadOnto(state, lure, h),
  );

export interface LeadOption {
  readonly cost: number;
  readonly enabled: boolean;
  readonly why?: TipId;
}

/** Refusals that mean leading is not a thing for you here at all (no button). */
const NOT_OFFERED: ReadonlySet<string> = new Set([
  'no-lure',
  'not-near',
  'invalid-action',
  'invalid-hex',
  'unknown-character',
  'character-lost',
  'season-over',
  'waiting',
]);

/**
 * Leading this lure, for its card: offered when you stand on or next to it (faded, with the core's reason,
 * when it cannot be done now: settled, no way out, no actions, pinned); otherwise not at all.
 */
export function leadOption(
  game: GameStateView,
  characterId: string,
  lureId: string,
): LeadOption | null {
  const lure = lureById(game, lureId);
  if (!lure) return null;
  const to = leadTargets(game, lure)[0];
  const check = checkAction(
    game,
    characterId,
    to ? { kind: 'lead', lure: lureId, to } : { kind: 'lead', lure: lureId, direction: 'n' },
  );
  if (check.ok) return { cost: check.cost, enabled: true };
  if (NOT_OFFERED.has(check.reason) || check.cost === undefined) return null;
  return { cost: check.cost, enabled: false, why: whyTip(check.reason) };
}

/** Whether `h` is a hex the lure can be led onto (for the flow's target taps). */
export const canLeadTo = (state: GameStateView, lure: Lure, h: Hex): boolean =>
  leadTargets(state, lure).some((t) => hexEquals(t, h));
