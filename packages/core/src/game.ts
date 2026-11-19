/**
 * Starting a game.
 */

import { type ConfigOverrides, resolveConfig } from './config.ts';
import { type Direction, DIRECTIONS, type Hex, isValidHex } from './hex.ts';
import { CONTENT_VERSION } from './content/index.ts';
import { ON_CREATURE } from './places.ts';
import { type Seed, toSeed } from './random.ts';
import type { GameState } from './state.ts';
import { updateTiles } from './window.ts';

export interface CreateGameOptions {
  /**
   * Plain characters for tests and local play: one per id, its own user, all riding
   * the creature. Real players join with `addCharacter`.
   */
  readonly characterIds?: readonly string[];
  readonly config?: ConfigOverrides;
  /** The creature's general heading. Default north. */
  readonly heading?: Direction;
  /** The creature's starting centre. Default the origin. */
  readonly start?: Hex;
}

const MAX_ID_LENGTH = 64;

/** The role given to characters made by `characterIds`. */
const DEV_ROLE = 'scout';

/**
 * A new game. Pass `newSeed()` for a real game; a plain number (0 to 2^32 - 1)
 * is accepted for tests and local play.
 */
export const createGame = (
  seedOrNumber: Seed | number,
  options: CreateGameOptions = {},
): GameState => {
  const seed = toSeed(seedOrNumber);
  const config = resolveConfig(options.config);
  const heading = options.heading ?? 'n';
  if (!DIRECTIONS.includes(heading)) throw new RangeError(`Unknown heading: ${String(heading)}`);
  const centre = options.start ?? { q: 0, r: 0 };
  if (!isValidHex(centre)) throw new RangeError('start must have integer coordinates');
  const ids = options.characterIds ?? [];
  if (ids.length > config.playerCap) throw new RangeError('More characters than the player cap');
  if (new Set(ids).size !== ids.length) throw new RangeError('Character ids must be unique');
  if (ids.some((id) => id.length === 0 || id.length > MAX_ID_LENGTH)) {
    throw new RangeError(`Character ids must be 1 to ${MAX_ID_LENGTH} characters`);
  }

  const day = 1;
  return {
    contentVersion: CONTENT_VERSION,
    seed,
    day,
    config,
    creature: { centre, heading },
    tiles: updateTiles({}, centre, day, config, seed),
    characters: ids.map((id) => ({
      id,
      userId: id,
      name: id,
      trait: null,
      quirk: null,
      role: DEV_ROLE,
      joinedDay: day,
      at: ON_CREATURE,
      actionsLeft: config.actionsPerDay,
      status: 'active',
    })),
  };
};
