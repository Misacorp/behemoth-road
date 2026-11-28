/**
 * VERBS: the word under each action's icon, when the "action labels" setting is on (on by default; hide
 * them on staging with `?labels=0` at the end of the address). One short word each.
 */
import type { Action } from '@behemoth-road/core';

export const verbs = {
  survey: 'Survey',
  gather: 'Gather',
  'work-site': 'Work',
  build: 'Build',
  'light-fire': 'Light',
  feed: 'Feed',
  linger: 'Linger',
  'throw-line': 'Throw',
  'grab-line': 'Grab',
  hitch: 'Hitch',
  unhitch: 'Unhitch',
  'board-cart': 'Board',
  'leave-cart': 'Leave',
  load: 'Load',
  unload: 'Unload',
  strike: 'Strike',
  'dig-out': 'Dig',
  struggle: 'Struggle',
  lead: 'Lead',
  defend: 'Defend',
  parley: 'Parley',
  offer: 'Offer',
  'ask-boon': 'Ask',
  'pick-skill': 'Pick',
  'set-stance': 'Stance',
  wait: 'Wait',
} as const satisfies Record<Action['kind'], string>;

/** The verb for a button's kind (`offer:<material>` is an offer, `boon:<id>` asks for a boon), or null. */
export function verbOf(kind: string): string | null {
  if (kind === 'move') return 'Move';
  if (kind.startsWith('offer')) return verbs.offer;
  if (kind.startsWith('boon:')) return verbs['ask-boon'];
  return Object.hasOwn(verbs, kind) ? verbs[kind as keyof typeof verbs] : null;
}
