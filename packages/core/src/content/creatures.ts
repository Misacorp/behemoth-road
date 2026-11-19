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
  /** How much it drops at each tick. */
  readonly drainPerDay: number;
  /** The comfortable band (inclusive); below it is underfed, above it overfed. */
  readonly comfortable: { readonly min: number; readonly max: number };
  /** The cap (overfeeding stops here). */
  readonly max: number;
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
    hunger: { start: 6, drainPerDay: 1, comfortable: { min: 4, max: 7 }, max: 10 },
    // Never indifferent to fire: the first creature must be steerable by it.
    reactions: { fire: ['attracted', 'repelled'] },
  },
];
