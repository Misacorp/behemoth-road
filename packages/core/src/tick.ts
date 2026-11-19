/**
 * The day tick: a pure function, the same whether a schedule or a
 * "next day" button calls it, and whether or not anyone has acted.
 *
 * Order: the creature steps; the window and fog update; anyone the creature
 * stepped onto is moved to the nearest free hex (no cost); anyone left outside
 * reach is lost; actions reset.
 */

import { chooseCreatureStep } from './creature.ts';
import type { Character, GameState } from './state.ts';
import { nearestFreeHex } from './placement.ts';
import { isCreatureHex, isReachable, updateTiles } from './window.ts';

export const nextDay = (state: GameState): GameState => {
  const day = state.day + 1;
  const step = chooseCreatureStep(state);
  const creature = { ...state.creature, centre: step.centre };
  const tiles = updateTiles(state.tiles, creature.centre, day, state.config);
  const moved: GameState = { ...state, day, creature, tiles };

  const characters = state.characters.map((c): Character => {
    if (c.status !== 'active') return { ...c, actionsLeft: 0 };
    // Pushed aside by the creature, for free, before the left-behind check.
    const position = isCreatureHex(moved, c.position)
      ? nearestFreeHex(moved, c.position)
      : c.position;
    if (position && isReachable(moved, position)) {
      return { ...c, position, actionsLeft: state.config.actionsPerDay };
    }
    return { ...c, status: 'lost', actionsLeft: 0 };
  });
  return { ...moved, characters };
};
