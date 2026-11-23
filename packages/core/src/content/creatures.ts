/**
 * Creature types, as data. A type carries its need (hunger, for now) and, per
 * stimulus tag, the reactions a game may roll for it. Rules read tags and
 * properties, never ids. `icon` names what the art kit draws.
 */

/** How a creature feels about a stimulus: drawn to it, driven from it, or unmoved. */
export type Reaction = 'attracted' | 'repelled' | 'indifferent';

export const REACTIONS: readonly Reaction[] = ['attracted', 'repelled', 'indifferent'];

/** A need measured as a hidden number from 0 to `max` (hunger: satiety). */
export interface Need {
  /** The value a new game starts with. */
  readonly start: number;
  /** How much it drops on a draining tick. */
  readonly drainPerDay: number;
  /**
   * It drains only on the ticks into a day that is a multiple of this (2: the
   * ticks into days 2, 4, 6…), so the drain stays a whole number but can be slower
   * than one a day.
   */
  readonly drainEveryDays: number;
  /** The comfortable band (inclusive); below it is underfed, above it overfed. */
  readonly comfortable: { readonly min: number; readonly max: number };
  /** The cap (overfeeding stops here). */
  readonly max: number;
  /** How far outside the comfortable band one appetite level is (levels 1 to 3). */
  readonly levelStep: number;
}

export interface CreatureType {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
  readonly hunger: Need;
  /** Per stimulus tag, the reactions a new game picks one from (seeded). */
  readonly reactions: Readonly<Record<string, readonly Reaction[]>>;
}

export const CREATURE_TYPES: readonly CreatureType[] = [
  {
    id: 'mossback',
    name: 'Mossback',
    tags: ['beast', 'tame', 'grazer'],
    icon: 'mossback',
    hunger: {
      // Drains every day (1 of 20); a forage gives 4, so one feeding lasts four days.
      start: 12,
      drainPerDay: 1,
      drainEveryDays: 1,
      comfortable: { min: 8, max: 15 },
      max: 20,
      levelStep: 2,
    },
    // Never indifferent to fire: the first creature must be steerable by it.
    reactions: { fire: ['attracted', 'repelled'] },
  },
];
