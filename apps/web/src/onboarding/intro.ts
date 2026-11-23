/**
 * The intro cards' content and paging rules. The lines are the only prose in the onboarding, kept to one
 * short sentence a card (British English); the art carries the rest.
 */

export interface IntroCard {
  readonly id: 'journey' | 'actions' | 'dusk' | 'home';
  readonly line: string;
}

export const INTRO_CARDS: readonly IntroCard[] = [
  { id: 'journey', line: 'Friends escort a huge creature home across a wild map.' },
  { id: 'actions', line: 'Each of you has a few actions a day.' },
  { id: 'dusk', line: 'At dusk the creature walks and dangers move.' },
  { id: 'home', line: 'Together you reach home.' },
];

/** How far a finger must travel sideways to turn a card, in px. */
export const SWIPE_PX = 48;

/** The card a step from `page` lands on, clamped to the cards. */
export const cardAfter = (page: number, step: 1 | -1): number =>
  Math.min(INTRO_CARDS.length - 1, Math.max(0, page + step));

/**
 * What a sideways drag of `dx` px does on `page`: the page index to go to (the count itself, past the last
 * card, means done), or null when it was too short (a tap).
 */
export function swipeTo(page: number, dx: number): number | null {
  if (dx <= -SWIPE_PX) return page + 1;
  if (dx >= SWIPE_PX) return page > 0 ? page - 1 : null;
  return null;
}
