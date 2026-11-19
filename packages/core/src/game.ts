/**
 * Starting a game.
 */

import { type ConfigOverrides, resolveConfig } from './config.ts';
import { type Direction, DIRECTIONS, type Hex, hexRing } from './hex.ts';
import { terrainAt } from './map.ts';
import type { GameState } from './state.ts';
import { updateTiles } from './window.ts';

export interface CreateGameOptions {
  /** One character per id, placed near the creature. Up to the player cap. */
  readonly characterIds?: readonly string[];
  readonly config?: ConfigOverrides;
  /** The creature's general heading. Default north. */
  readonly heading?: Direction;
  /** The creature's starting centre. Default the origin. */
  readonly start?: Hex;
}

const MAX_ID_LENGTH = 64;

/** The nearest passable hex to `centre`, searching outwards ring by ring. */
const nearestPassable = (seed: number, centre: Hex, maxRadius: number): Hex | undefined => {
  for (let radius = 0; radius <= maxRadius; radius++) {
    const found = hexRing(centre, radius).find((h) => terrainAt(seed, h).passable);
    if (found) return found;
  }
  return undefined;
};

export const createGame = (seed: number, options: CreateGameOptions = {}): GameState => {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('seed must be an integer from 0 to 2^32 - 1');
  }
  const config = resolveConfig(options.config);
  const heading = options.heading ?? 'n';
  if (!DIRECTIONS.includes(heading)) throw new RangeError(`Unknown heading: ${String(heading)}`);
  const centre = options.start ?? { q: 0, r: 0 };
  const ids = options.characterIds ?? [];
  if (ids.length > config.playerCap) throw new RangeError('More characters than the player cap');
  if (new Set(ids).size !== ids.length) throw new RangeError('Character ids must be unique');
  if (ids.some((id) => id.length === 0 || id.length > MAX_ID_LENGTH)) {
    throw new RangeError(`Character ids must be 1 to ${MAX_ID_LENGTH} characters`);
  }

  const day = 1;
  const position = ids.length > 0 ? nearestPassable(seed, centre, config.windowRadius) : centre;
  if (!position) throw new RangeError('No passable hex in the starting window');

  return {
    seed,
    day,
    config,
    creature: { centre, heading },
    tiles: updateTiles({}, centre, day, config),
    characters: ids.map((id) => ({
      id,
      position,
      actionsLeft: config.actionsPerDay,
      status: 'active',
    })),
  };
};
