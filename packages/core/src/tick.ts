/**
 * The day tick: a pure function, the same whether a schedule or a
 * "next day" button calls it, and whether or not anyone has acted.
 */

import { chooseCreatureStep } from './creature.ts';
import type { Character, GameState } from './state.ts';
import { isReachable, updateTiles } from './window.ts';

export const nextDay = (state: GameState): GameState => {
  const day = state.day + 1;
  const step = chooseCreatureStep(state);
  const creature = { ...state.creature, centre: step.centre };
  const tiles = updateTiles(state.tiles, creature.centre, day, state.config);
  const moved: GameState = { ...state, day, creature, tiles };

  const characters = state.characters.map((c): Character => {
    if (c.status === 'active' && isReachable(moved, c.position)) {
      return { ...c, actionsLeft: state.config.actionsPerDay };
    }
    return { ...c, status: 'lost', actionsLeft: 0 };
  });
  return { ...moved, characters };
};
