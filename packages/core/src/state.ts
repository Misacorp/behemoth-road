/**
 * Game state: plain, immutable, JSON-serialisable data. Rules never mutate it;
 * they return a new state.
 */

import type { TuningConfig } from './config.ts';
import type { Direction, Hex } from './hex.ts';
import { isSeed, type Seed } from './random.ts';

/** hidden: never in view. seen: in play (in the window or its grace). lost: gone to the fog. */
export type Visibility = 'hidden' | 'seen' | 'lost';

/** What is known of a hex that has been in view. `terrain` is its terrain id. */
export type TileKnowledge =
  | {
      readonly visibility: 'seen';
      readonly terrain: string;
      /** The day the hex left the window, or null while it is in the window. */
      readonly leftWindowOnDay: number | null;
    }
  | { readonly visibility: 'lost'; readonly terrain: string };

export interface Creature {
  readonly centre: Hex;
  /** The general heading. Each step goes this way or one sixth of a turn to either side. */
  readonly heading: Direction;
}

export type CharacterStatus = 'active' | 'lost';

/**
 * Where a character is: on a hex, or riding the creature. The creature's
 * footprint is one place, not hexes to stand on.
 */
export type Place = { readonly kind: 'hex'; readonly hex: Hex } | { readonly kind: 'creature' };

export interface Character {
  readonly id: string;
  /** The player who runs this character (a Discord user id from Milestone 2). */
  readonly userId: string;
  readonly name: string;
  /** Content ids (`content/`); null for the plain character. */
  readonly trait: string | null;
  readonly quirk: string | null;
  readonly role: string;
  /** Public: picks the figure's look. Rolled with the character, never from the map. */
  readonly lookSeed: number;
  /** The day the character joined. */
  readonly joinedDay: number;
  readonly at: Place;
  readonly actionsLeft: number;
  /** Crafts made today (reset by the tick). */
  readonly craftsToday: number;
  readonly status: CharacterStatus;
}

/**
 * A feature on a hex (content `FEATURE_TYPES`). `left` is what remains: a node's
 * charges, 1 for an unworked site (0 once found), 1 for a trap.
 */
export interface FeatureState {
  readonly type: string;
  readonly revealed: boolean;
  readonly left: number;
}

/** The team's shared materials and items, by content id. */
export interface Inventory {
  readonly materials: Readonly<Record<string, number>>;
  readonly items: Readonly<Record<string, number>>;
}

/**
 * The game as a player may see it: everything but the seed. Terrain is known
 * only for tiles that have been in view (`tiles`), so the map ahead and the
 * creature's next step cannot be worked out from it. Every rule a client uses
 * reads this type.
 */
export interface GameStateView {
  /** The content the state was made with (`CONTENT_VERSION`). */
  readonly contentVersion: number;
  /**
   * A public random number for cosmetic variety in drawing (props, figures).
   * Unrelated to the game seed, so it reveals nothing about the map.
   */
  readonly artSeed: number;
  /** Starts at 1 and goes up by one each tick. */
  readonly day: number;
  /** The tuning this game was created with; every rule reads it from here. */
  readonly config: TuningConfig;
  readonly creature: Creature;
  /** Knowledge of hexes that have been in view, by `hexKey`. Absent means hidden. */
  readonly tiles: Readonly<Record<string, TileKnowledge>>;
  readonly characters: readonly Character[];
  /**
   * Features by `hexKey`. On the server this holds hidden ones too; a player
   * view holds only revealed ones.
   */
  readonly features: Readonly<Record<string, FeatureState>>;
  /** Hexes a scout has sensed something on, by `hexKey` (what it is stays hidden). */
  readonly glints: Readonly<Record<string, true>>;
  readonly inventory: Inventory;
}

/** The whole game, held only by the server: the view plus the seed that generates the map. */
export interface GameState extends GameStateView {
  /** 128 bits; never sent to players. */
  readonly seed: Seed;
}

export const hasSeed = (state: GameStateView): state is GameState =>
  isSeed((state as Partial<GameState>).seed);

export const findCharacter = (state: GameStateView, id: string): Character | undefined =>
  state.characters.find((c) => c.id === id);
