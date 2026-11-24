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

/** What becomes of a creature at the end of its road: a young one stays, an old one goes on. */
export type Fate = 'stays' | 'goes-on';

/**
 * One leg of a creature's route: `share` of the route's length, then a `turn` of the heading by one
 * direction at its end (-1 or 1), none (0), or a side picked by the seed. Data for now: the heading
 * stays state and nothing in movement reads it yet (the Mossback has one leg, no turns).
 */
export interface RouteLeg {
  readonly share: number;
  readonly turn: -1 | 0 | 1 | 'seeded';
}

/** A last thing an old creature does on its way: `at` is a route fraction; art and beats only, never halts it. */
export interface RouteStop {
  readonly at: number;
  readonly task: string;
}

export interface CreatureRoute {
  readonly legs: readonly RouteLeg[];
  readonly stops?: readonly RouteStop[];
}

export interface CreatureType {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
  /** Young creatures stay where they are going; old ones go on. Story only: no rule reads it. */
  readonly fate: Fate;
  /** Public text keys. None names a stimulus or shows hunger (the Keeper's puzzle). */
  readonly sound: string;
  readonly habit: string;
  /** What those near it gain while peril stays low: tags for art and lines (a rule only after the balance sim). */
  readonly blessing: readonly string[];
  /** The tier of play that brings this kind (1: the first). */
  readonly tier: number;
  readonly route: CreatureRoute;
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
    fate: 'stays',
    sound: 'hum-while-grazing',
    habit: 'eats-before-it-stops',
    blessing: ['berries-along-the-trail'],
    tier: 1,
    route: { legs: [{ share: 1, turn: 0 }] },
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
