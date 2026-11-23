/**
 * The window of play around the creature, and fog of war.
 */

import type { TuningConfig } from './config.ts';
import { type Hex, hexDistance, hexesInRange, hexKey } from './hex.ts';
import { terrainIdAt } from './map.ts';
import type { Seed } from './random.ts';
import type { GameStateView, TileKnowledge, Visibility } from './state.ts';

/** The hexes the creature stands on. */
export const creatureHexes = (state: GameStateView): Hex[] =>
  hexesInRange(state.creature.centre, state.config.creatureRadius);

export const isCreatureHex = (state: GameStateView, h: Hex): boolean =>
  hexDistance(h, state.creature.centre) <= state.config.creatureRadius;

/** The hexes in play this day. */
export const windowHexes = (state: GameStateView): Hex[] =>
  hexesInRange(state.creature.centre, state.config.windowRadius);

export const isInWindow = (state: GameStateView, h: Hex): boolean =>
  hexDistance(h, state.creature.centre) <= state.config.windowRadius;

export const visibilityAt = (state: GameStateView, h: Hex): Visibility =>
  state.tiles[hexKey(h)]?.visibility ?? 'hidden';

/** A hex characters may be on: in the window, or out of it but still in its grace days. */
export const isReachable = (state: GameStateView, h: Hex): boolean =>
  visibilityAt(state, h) === 'seen';

/**
 * Recomputes tile knowledge for a window centred on `centre` on `day`.
 * Hexes in the window are seen (even ones lost earlier: the window is always in play),
 * and a hex seen for the first time records its terrain, generated from `seed`.
 * A seen hex outside it records the day it left, and is lost once `graceDays` have passed.
 * Server only: it needs the seed.
 */
export const updateTiles = (
  tiles: Readonly<Record<string, TileKnowledge>>,
  centre: Hex,
  day: number,
  config: TuningConfig,
  seed: Seed,
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
        ? { visibility: 'lost', terrain: tile.terrain, explored: tile.explored }
        : {
            visibility: 'seen',
            terrain: tile.terrain,
            explored: tile.explored,
            leftWindowOnDay: left,
          };
  }
  for (const h of hexesInRange(centre, config.windowRadius)) {
    const key = hexKey(h);
    const known = next[key];
    const terrain = known?.terrain ?? terrainIdAt(seed, h);
    next[key] = {
      visibility: 'seen',
      terrain,
      explored: known?.explored ?? false,
      leftWindowOnDay: null,
    };
  }
  return next;
};

/**
 * Drops lost tiles more than `lostTileRings` beyond the window, except under a
 * character (a lost character still stands somewhere), so the state stops growing.
 * A pruned hex reads as hidden; if the window ever reaches it again, it is seen afresh.
 */
export const pruneLostTiles = (state: GameStateView): Record<string, TileKnowledge> => {
  const limit = state.config.windowRadius + state.config.lostTileRings;
  const keep = new Set(
    state.characters.flatMap((c) => (c.at.kind === 'hex' ? [hexKey(c.at.hex)] : [])),
  );
  const next: Record<string, TileKnowledge> = {};
  for (const [key, tile] of Object.entries(state.tiles)) {
    if (tile.visibility === 'lost' && !keep.has(key)) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      if (hexDistance({ q, r }, state.creature.centre) > limit) continue;
    }
    next[key] = tile;
  }
  return next;
};
