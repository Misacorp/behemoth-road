/**
 * The day tick: a pure function, the same whether a schedule or a
 * "next day" button calls it, and whether or not anyone has acted.
 *
 * Order: the creature steps, carrying its riders; the window and fog update;
 * anyone standing on a hex the creature stepped onto is now riding it (no cost);
 * anyone picked up empties their pack into the stores; anyone left out of
 * reach is lost, with their pack; actions reset; hexes new
 * in view get their (hidden) features; lost tiles far behind are
 * pruned. Server only: it needs the seed.
 */

import { chooseCreatureStep } from './creature.ts';
import { addFeatures, depositPack, type GameEvent, keyToHex, pruneFeatures } from './features.ts';
import { ON_CREATURE } from './places.ts';
import type { Character, GameState } from './state.ts';
import { isCreatureHex, isReachable, pruneLostTiles, updateTiles } from './window.ts';

/** The day tick, with what happened, in order: the step, pick-up deposits, losses, the day. */
export const nextDayWithEvents = (
  state: GameState,
): { readonly state: GameState; readonly events: readonly GameEvent[] } => {
  const day = state.day + 1;
  const step = chooseCreatureStep(state);
  const creature = { ...state.creature, centre: step.centre };
  const tiles = updateTiles(state.tiles, creature.centre, day, state.config, state.seed);
  const newHexes = Object.keys(tiles)
    .filter((key) => !state.tiles[key])
    .map(keyToHex);
  const features = addFeatures(
    state.features,
    tiles,
    newHexes,
    state.seed,
    state.config.featureChance,
  );
  const moved: GameState = { ...state, day, creature, tiles, features };
  const actionsLeft = state.config.actionsPerDay;
  const events: GameEvent[] = [
    { kind: 'creature-step', from: state.creature.centre, to: creature.centre },
  ];
  const lost: GameEvent[] = [];

  const characters = state.characters.map((c): Character => {
    if (c.status !== 'active') return { ...c, actionsLeft: 0 };
    const fresh = { ...c, actionsLeft };
    if (c.at.kind === 'creature') return fresh;
    if (isCreatureHex(moved, c.at.hex)) return { ...fresh, at: ON_CREATURE };
    if (isReachable(moved, c.at.hex)) return fresh;
    // Lost for good, and the pack with them.
    lost.push({ kind: 'lost', characterId: c.id, hex: c.at.hex });
    return { ...c, status: 'lost', actionsLeft: 0, pack: {} };
  });
  // Anyone now on the creature (picked up by it today) empties their pack into the stores.
  let settled: GameState = { ...moved, characters };
  for (const c of characters) {
    const deposited = depositPack(settled, c.id);
    settled = deposited.state;
    events.push(...deposited.events);
  }
  events.push(...lost, { kind: 'day', day });
  return { state: pruneFeatures({ ...settled, tiles: pruneLostTiles(settled) }), events };
};

/** The day tick (see `nextDayWithEvents` for what happened). */
export const nextDay = (state: GameState): GameState => nextDayWithEvents(state).state;
