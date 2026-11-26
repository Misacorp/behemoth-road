/**
 * The fire rework as the web reads it from the player view, on the core's own rules (docs/design/fire.md):
 * what a feature says about fire (burnable, or a lit brazier's nights), digging a pinned character out,
 * and what a pinned character sees greyed. Every "can I" is the core's `checkAction`; nothing here keeps a
 * second copy of a rule.
 */
import {
  BURNABLE_TAG,
  checkAction,
  FIRE_SITE_TAG,
  featureType,
  type GameStateView,
  type Hex,
  hexKey,
  firesBurning,
  nightsLeft,
} from '@behemoth-road/core';
import type { TipId } from '../text/tips.ts';
import { whyTip } from './why.ts';

/** What a feature's card says about fire: it would burn (`burnable`), or burns this many nights more. */
export type FireNote = { readonly burnable: true } | { readonly nights: number };

/** The fire note of the revealed feature on a hex (read by tag), or null. */
export function fireNoteAt(game: GameStateView, h: Hex): FireNote | null {
  const key = hexKey(h);
  const f = game.features[key];
  if (!f?.revealed) return null;
  let tags: readonly string[];
  try {
    tags = featureType(f.type).tags;
  } catch {
    return null;
  }
  if (tags.includes(BURNABLE_TAG)) return { burnable: true };
  if (tags.includes(FIRE_SITE_TAG)) {
    const fire = firesBurning(game).find((s) => hexKey(s.hex) === key);
    if (fire) return { nights: nightsLeft(game, fire) };
  }
  return null;
}

/** Whether a feature hex holds something a fire could be lit on (a brazier or a burnable). */
export function takesFire(game: GameStateView, h: Hex): boolean {
  const f = game.features[hexKey(h)];
  if (!f?.revealed) return false;
  try {
    const tags = featureType(f.type).tags;
    return tags.includes(BURNABLE_TAG) || tags.includes(FIRE_SITE_TAG);
  } catch {
    return false;
  }
}

export interface DigOption {
  readonly cost: number;
  readonly enabled: boolean;
  readonly why?: TipId;
}

/**
 * Digging `targetId` out, for their character card: offered when they are pinned and you are on or next to
 * their place (faded without the actions, with the core's reason); never otherwise.
 */
export function digOption(
  game: GameStateView,
  characterId: string,
  targetId: string,
): DigOption | null {
  const check = checkAction(game, characterId, { kind: 'dig-out', target: targetId });
  if (check.ok) return { cost: check.cost, enabled: true };
  if (check.reason !== 'not-enough-actions' || check.cost === undefined) return null;
  return { cost: check.cost, enabled: false, why: whyTip(check.reason) };
}

/** Whether a character is pinned under a slide. */
export const isPinned = (game: GameStateView, characterId: string): boolean =>
  game.characters.some((c) => c.id === characterId && c.pinnedDay !== undefined);

/**
 * What a pinned character's own card shows greyed: each action it would offer unpinned, faded, with the
 * pinned reason as its tip. `offered` are the actions as they would be without the pin.
 */
export function greyedForPin<T extends { readonly enabled: boolean }>(
  offered: readonly T[],
): (Omit<T, 'enabled' | 'why'> & { readonly enabled: false; readonly why: TipId })[] {
  return offered.map((a) => ({ ...a, enabled: false as const, why: 'why:pinned' }));
}
