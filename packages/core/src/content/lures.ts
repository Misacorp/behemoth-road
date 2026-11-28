/**
 * Lures: small animals on the map that draw a creature or drive it off, like a fire does, until they are
 * led away, settle or are trampled. The creature's reaction is read by the lure's tags from its hidden
 * reactions (`CreatureType.reactions`). Rules read tags and properties, never ids.
 */

export interface LureType {
  readonly id: string;
  readonly name: string;
  /** `lure` marks it; the other tags (`small-beast`) are what a creature's reactions are keyed by. */
  readonly tags: readonly string[];
  readonly icon: string;
  /** How hard it pushes the step sideways when the creature reacts to it (as a stimulus's `push`). */
  readonly push: number;
  /** Reach in hexes from the creature's centre. */
  readonly range: number;
  /** Terrain tags it is never placed or led onto. */
  readonly notOn: readonly string[];
}

export const LURE_TYPES: readonly LureType[] = [
  {
    id: 'capybara',
    name: 'Capybara',
    tags: ['small-beast', 'lure'],
    icon: 'capybara',
    push: 2,
    range: 6,
    notOn: ['water'],
  },
];
