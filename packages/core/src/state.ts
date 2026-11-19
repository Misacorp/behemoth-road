/**
 * Game state: plain, immutable, JSON-serialisable data. Rules never mutate it;
 * they return a new state.
 */

import type { TuningConfig } from './config.ts';
import type { Direction, Hex } from './hex.ts';

/** hidden: never in view. seen: in play (in the window or its grace). lost: gone to the fog. */
export type Visibility = 'hidden' | 'seen' | 'lost';

export type TileKnowledge =
  | {
      readonly visibility: 'seen';
      /** The day the hex left the window, or null while it is in the window. */
      readonly leftWindowOnDay: number | null;
    }
  | { readonly visibility: 'lost' };

export interface Creature {
  readonly centre: Hex;
  /** The general heading. Each step goes this way or one sixth of a turn to either side. */
  readonly heading: Direction;
}

export type CharacterStatus = 'active' | 'lost';

export interface Character {
  readonly id: string;
  readonly position: Hex;
  readonly actionsLeft: number;
  readonly status: CharacterStatus;
}

export interface GameState {
  readonly seed: number;
  /** Starts at 1 and goes up by one each tick. */
  readonly day: number;
  /** The tuning this game was created with; every rule reads it from here. */
  readonly config: TuningConfig;
  readonly creature: Creature;
  /** Knowledge of hexes that have been in view, by `hexKey`. Absent means hidden. */
  readonly tiles: Readonly<Record<string, TileKnowledge>>;
  readonly characters: readonly Character[];
}

export const findCharacter = (state: GameState, id: string): Character | undefined =>
  state.characters.find((c) => c.id === id);
