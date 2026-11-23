/**
 * Why an action is greyed: the one mapping from the core's refusal (`checkAction`) to a tip id, shared by
 * every card and the hub. A greyed action is built from the same check that greys it, so the reason is the
 * core's own and there is no second copy of the rules here. The texts are in `text/tips.ts` (`why:*`).
 * A refusal about who you are is answered by the role that can: that role's own tip.
 */
import type { ActCheck, ActRefusal, PickRefusal } from '@behemoth-road/core';
import { TIP_TABLE, type TipId } from '../text/tips.ts';

/** The tip for each refusal. A record over every refusal: a new one in the core is a type error here. */
export const WHY_BY_REFUSAL: Readonly<Record<ActRefusal, TipId>> = {
  'invalid-action': 'why:other',
  'invalid-hex': 'why:wrong-place',
  'unknown-character': 'why:other',
  'character-lost': 'why:other',
  'not-adjacent': 'why:not-near',
  unreachable: 'why:wrong-place',
  'already-explored': 'why:done',
  'not-on-hex': 'why:elsewhere',
  'nothing-here': 'why:nothing',
  depleted: 'why:nothing',
  'pack-full': 'why:pack-full',
  'not-enough-actions': 'why:not-enough-actions',
  'cannot-work': 'why:other',
  'needs-unlock': 'why:needs-unlock',
  'needs-specialist': 'why:other',
  'not-riding': 'why:not-riding',
  'unknown-unlock': 'why:other',
  'already-have': 'why:done',
  busy: 'why:busy',
  'missing-materials': 'why:missing-materials',
  'cannot-burn': 'why:no-fire',
  'fire-here': 'why:done',
  'no-fuel': 'why:no-fuel',
  'no-food': 'why:no-food',
  'needs-keeper': 'why:role-keeper',
  'lingered-yesterday': 'why:lingered-yesterday',
  'on-creature': 'why:on-creature',
  'season-over': 'why:season-over',
  'no-threat': 'why:other',
  'not-near': 'why:not-near',
  'needs-guardian': 'why:role-guardian',
  'no-settlement': 'why:wrong-place',
  'not-wary': 'why:settlement',
  'not-friendly': 'why:settlement',
  'boon-taken': 'why:done',
  'unknown-boon': 'why:other',
  'no-trade-good': 'why:other',
  // Skills (the tree drawer): each refusal has its own reason.
  'unknown-skill': 'why:other',
  'skill-veiled': 'why:veiled',
  'no-pick': 'why:no-pick',
  'branch-closed': 'why:branch-closed',
  'skill-tier-order': 'why:tier-order',
  'skill-tier-limit': 'why:tier-limit',
};

/**
 * The tip for a refused pick. Like `whyTip`, except that a node already taken says so (the shared
 * `already-have` refusal reads "done today" on the cards, which is not what a skill means).
 */
export const whyOfPick = (reason: ActRefusal | PickRefusal): TipId =>
  reason === 'already-have' ? 'why:taken' : WHY_BY_REFUSAL[reason];

/** The tip for a refusal: the role that can (when the refusal is about who you are), else the refusal's own. */
export function whyTip(reason: ActRefusal, needs?: string | null): TipId {
  const role = needs ? `why:role-${needs}` : null;
  if (role !== null && Object.hasOwn(TIP_TABLE, role)) return role as TipId;
  return WHY_BY_REFUSAL[reason];
}

/** The tip for a refused check, or null for an accepted one. */
export const whyOfCheck = (check: ActCheck, needs?: string | null): TipId | null =>
  check.ok ? null : whyTip(check.reason, needs);

/** Greyed only because the action was already done today. */
export const WHY_DONE: TipId = 'why:done';
/** On a card where the action is only a hint (a fire is lit where you stand). */
export const WHY_ELSEWHERE: TipId = 'why:elsewhere';
