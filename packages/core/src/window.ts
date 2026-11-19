/**
 * The window of play around the creature, and fog of war.
 */

import type { TuningConfig } from './config.ts';
import { type Hex, hexDistance, hexesInRange, hexKey } from './hex.ts';
import type { GameState, TileKnowledge, Visibility } from './state.ts';

/** The hexes the creature stands on. */
export const creatureHexes = (state: GameState): Hex[] =>
  hexesInRange(state.creature.centre, state.config.creatureRadius);

export const isCreatureHex = (state: GameState, h: Hex): boolean =>
  hexDistance(h, state.creature.centre) <= state.config.creatureRadius;

/** The hexes in play this day. */
export const windowHexes = (state: GameState): Hex[] =>
  hexesInRange(state.creature.centre, state.config.windowRadius);

export const isInWindow = (state: GameState, h: Hex): boolean =>
  hexDistance(h, state.creature.centre) <= state.config.windowRadius;

export const visibilityAt = (state: GameState, h: Hex): Visibility =>
  state.tiles[hexKey(h)]?.visibility ?? 'hidden';

/** A hex characters may be on: in the window, or out of it but still in its grace days. */
export const isReachable = (state: GameState, h: Hex): boolean => visibilityAt(state, h) === 'seen';

/**
 * Recomputes tile knowledge for a window centred on `centre` on `day`.
 * Hexes in the window are seen (even ones lost earlier: the window is always in play).
 * A seen hex outside it records the day it left, and is lost once `graceDays` have passed.
 */
export const updateTiles = (
  tiles: Readonly<Record<string, TileKnowledge>>,
  centre: Hex,
  day: number,
  config: TuningConfig,
): Record<string, TileKnowledge> => {
  const next: Record<string, TileKnowledge> = {};
  for (const [key, tile] of Object.entries(tiles)) {
    if (tile.visibility === 'lost') {
      next[key] = tile;
      continue;
    }
    const left = tile.leftWindowOnDay ?? day;
    next[key] =
      day - left >= config.graceDays
        ? { visibility: 'lost' }
        : { visibility: 'seen', leftWindowOnDay: left };
  }
  for (const h of hexesInRange(centre, config.windowRadius)) {
    next[hexKey(h)] = { visibility: 'seen', leftWindowOnDay: null };
  }
  return next;
};
