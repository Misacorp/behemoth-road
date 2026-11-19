/**
 * Game state: plain, immutable, JSON-serialisable data. Rules never mutate it;
 * they return a new state.
 */

import type { TuningConfig } from './config.ts';
import type { Direction, Hex } from './hex.ts';

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
  /** The day the character joined. */
  readonly joinedDay: number;
  readonly at: Place;
  readonly actionsLeft: number;
  readonly status: CharacterStatus;
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
  /** Starts at 1 and goes up by one each tick. */
  readonly day: number;
  /** The tuning this game was created with; every rule reads it from here. */
  readonly config: TuningConfig;
  readonly creature: Creature;
  /** Knowledge of hexes that have been in view, by `hexKey`. Absent means hidden. */
  readonly tiles: Readonly<Record<string, TileKnowledge>>;
  readonly characters: readonly Character[];
}

/** The whole game, held only by the server: the view plus the seed that generates the map. */
export interface GameState extends GameStateView {
  readonly seed: number;
}

export const hasSeed = (state: GameStateView): state is GameState =>
  typeof (state as Partial<GameState>).seed === 'number';

export const findCharacter = (state: GameStateView, id: string): Character | undefined =>
  state.characters.find((c) => c.id === id);
