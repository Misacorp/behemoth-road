/**
 * The player view as the state the map and the core's rules read. The server keeps the seed; the view's
 * known tiles carry their terrain instead, and that is where terrain is read from (`terrainOf`).
 * The placeholder seed only feeds decoration (prop placement), never terrain.
 */
import { type GameState, type Hex, hexKey, terrainIdAt } from '@behemoth-road/core';
import type { GameStateView } from '../api/schema.ts';

/** Decoration seed for views (the real seed stays on the server). */
export const VIEW_SEED = 0;

export function toGameState(view: GameStateView): GameState {
  return {
    seed: VIEW_SEED,
    day: view.day,
    config: view.config,
    creature: view.creature,
    // Tiles keep their `terrain`, which the core reads first for known tiles.
    tiles: view.tiles,
    characters: view.characters.map((c) => ({
      id: c.id,
      at: c.at,
      actionsLeft: c.actionsLeft,
      status: c.status,
    })),
  };
}

/** A known tile's terrain from the view; otherwise (a local game with a seed) the generated terrain. */
export function terrainOf(state: GameState, h: Hex): string {
  const tile = state.tiles[hexKey(h)] as { readonly terrain?: string } | undefined;
  return tile?.terrain ?? terrainIdAt(state.seed, h);
}
