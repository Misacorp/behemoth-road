/**
 * The day tick: a pure function, the same whether a schedule or a
 * "next day" button calls it, and whether or not anyone has acted.
 *
 * Order: the creature steps, carrying its riders; the window and fog update;
 * anyone standing on a hex the creature stepped onto is now riding it (no cost);
 * anyone left out of reach is lost; actions reset.
 */

import { chooseCreatureStep } from './creature.ts';
import { ON_CREATURE } from './places.ts';
import type { Character, GameState } from './state.ts';
import { isCreatureHex, isReachable, updateTiles } from './window.ts';

export const nextDay = (state: GameState): GameState => {
  const day = state.day + 1;
  const step = chooseCreatureStep(state);
  const creature = { ...state.creature, centre: step.centre };
  const tiles = updateTiles(state.tiles, creature.centre, day, state.config);
  const moved: GameState = { ...state, day, creature, tiles };
  const actionsLeft = state.config.actionsPerDay;

  const characters = state.characters.map((c): Character => {
    if (c.status !== 'active') return { ...c, actionsLeft: 0 };
    if (c.at.kind === 'creature') return { ...c, actionsLeft };
    if (isCreatureHex(moved, c.at.hex)) return { ...c, at: ON_CREATURE, actionsLeft };
    if (isReachable(moved, c.at.hex)) return { ...c, actionsLeft };
    return { ...c, status: 'lost', actionsLeft: 0 };
  });
  return { ...moved, characters };
};
