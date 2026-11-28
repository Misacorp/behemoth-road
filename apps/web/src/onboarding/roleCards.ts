/**
 * What each role's card shows before the pick: what you do out there (icons) leading to what the team gets
 * (one mark), and one short line. Icons are the art kit's ids (actions, materials, moments), so the card
 * reads without words; the line is the role's whole pitch. Warden uses the Guardian's shield emblem like
 * everywhere else.
 */

export type RoleGet =
  /** A moment mark (what the map plays when it happens). */
  | { readonly kind: 'moment'; readonly id: string }
  /** An ink icon. */
  | { readonly kind: 'icon'; readonly id: string }
  /** What an item lets everyone do (a `via` mark). */
  | { readonly kind: 'via'; readonly id: string }
  /** The creature itself. */
  | { readonly kind: 'creature' };

export interface RoleCard {
  readonly role: string;
  /** What you do out there: icon ids, in order. */
  readonly does: readonly string[];
  /** What the team gets. */
  readonly gets: RoleGet;
  /** One short line. */
  readonly line: string;
}

export const ROLE_CARDS: readonly RoleCard[] = [
  {
    role: 'scout',
    does: ['eye', 'boot'],
    gets: { kind: 'moment', id: 'survey' },
    line: 'Finds the way',
  },
  {
    role: 'scholar',
    does: ['scroll', 'key'],
    gets: { kind: 'moment', id: 'find' },
    line: 'Searches tombs for finds',
  },
  {
    role: 'keeper',
    does: ['sprig', 'feed'],
    gets: { kind: 'creature' },
    line: 'Reads the creature',
  },
  {
    role: 'engineer',
    does: ['iron', 'timber'],
    gets: { kind: 'via', id: 'grappling-hook' },
    line: 'Builds gear for everyone',
  },
  {
    role: 'warden',
    does: ['defend', 'parley'],
    gets: { kind: 'icon', id: 'shelter' },
    line: 'Defends, speaks for the party',
  },
];

/** The card for a role, or null for a role with none. */
export const roleCard = (role: string): RoleCard | null =>
  ROLE_CARDS.find((c) => c.role === role) ?? null;
