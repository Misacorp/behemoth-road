/**
 * The day tick: a pure function, the same whether a schedule or a
 * "next day" button calls it, and whether or not anyone has acted.
 *
 * Order: the creature steps (or lingers), carrying its riders, its step chosen
 * from the state before the tick (that day's fires, the current hunger); the
 * creature's care updates (cues for fires in range, hunger drains, a starving
 * creature eats from the stores, fires that have burnt out go, lingering ends);
 * the window and fog update;
 * anyone standing on a hex the creature stepped onto is now riding it (no cost);
 * anyone picked up empties their pack into the stores; anyone left out of
 * reach is lost, with their pack; actions reset; hexes new
 * in view get their (hidden) features; lost tiles far behind are
 * pruned. Server only: it needs the seed.
 */

import {
  appetiteOf,
  creatureType,
  MAX_SIGN_LEVEL,
  FOOD_TAG,
  firstWithTag,
  nourishment,
  reactionTo,
  stimulusType,
} from './care.ts';
import { chooseCreatureStep } from './creature.ts';
import { hexDistance } from './hex.ts';
import { hashString, hashToUnit } from './random.ts';
import { addFeatures, depositPack, keyToHex, pruneFeatures } from './features.ts';
import { ON_CREATURE } from './places.ts';
import type { Care, Character, Creature, GameState, Materials, Stimulus } from './state.ts';
import { isCreatureHex, isReachable, pruneLostTiles, updateTiles } from './window.ts';

const EAT_STREAM = hashString('creature-eats');

/** What a starving creature eats from the stores: food first, else a seeded pick. */
const starvingMeal = (state: GameState, stores: Materials): string | null => {
  const food = firstWithTag(stores, FOOD_TAG);
  if (food) return food;
  const held = Object.keys(stores)
    .filter((id) => (stores[id] ?? 0) > 0)
    .sort();
  if (held.length === 0) return null;
  return held[Math.floor(hashToUnit(state.seed, EAT_STREAM, state.day) * held.length)] ?? null;
};

/**
 * The creature's condition after a tick: cues for the stimuli in range, hunger
 * drained, and at underfed level 3 one unit eaten from the stores (food
 * nourishes as if fed). Reads the state before the tick.
 */
const careAfter = (
  state: GameState,
  day: number,
): { readonly care: Care; readonly stores: Materials } => {
  const { hunger } = creatureType(state.nature.type);
  const list = state.stimuli
    .filter((s) => hexDistance(state.creature.centre, s.hex) <= state.config.stimulusRange)
    .map((s) => ({ hex: s.hex, stimulus: s.type, reaction: reactionTo(state.nature, s) }));
  let satiety = Math.max(0, state.care.satiety - hunger.drainPerDay);
  let stores = state.stores;
  const drained = appetiteOf({ ...state, care: { ...state.care, satiety } });
  if (drained?.kind === 'underfed' && drained.level === MAX_SIGN_LEVEL) {
    const meal = starvingMeal(state, stores);
    if (meal) {
      const left = (stores[meal] ?? 0) - 1;
      const next: Record<string, number> = { ...stores };
      if (left > 0) next[meal] = left;
      else delete next[meal];
      stores = next;
      satiety = Math.min(hunger.max, satiety + nourishment(meal));
    }
  }
  return { care: { satiety, cues: { day, list } }, stores };
};

/** Stimuli still burning after the tick that ends `day - 1`. */
const stimuliAfter = (stimuli: readonly Stimulus[], day: number): Stimulus[] =>
  stimuli.filter((s) => s.litDay + stimulusType(s.type).lastsTicks > day);

export const nextDay = (state: GameState): GameState => {
  const day = state.day + 1;
  const step = chooseCreatureStep(state);
  const creature: Creature = {
    ...state.creature,
    centre: step.centre,
    lingering: false,
    lingeredDay: state.creature.lingering ? state.day : state.creature.lingeredDay,
  };
  const { care, stores } = careAfter(state, day);
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
  const moved: GameState = {
    ...state,
    day,
    creature,
    tiles,
    features,
    care,
    stores,
    stimuli: stimuliAfter(state.stimuli, day),
  };
  const actionsLeft = state.config.actionsPerDay;

  const characters = state.characters.map((c): Character => {
    if (c.status !== 'active') return { ...c, actionsLeft: 0 };
    const fresh = { ...c, actionsLeft };
    if (c.at.kind === 'creature') return fresh;
    if (isCreatureHex(moved, c.at.hex)) return { ...fresh, at: ON_CREATURE };
    if (isReachable(moved, c.at.hex)) return fresh;
    // Lost for good, and the pack with them.
    return { ...c, status: 'lost', actionsLeft: 0, pack: {} };
  });
  // Anyone now on the creature (picked up by it today) empties their pack into the stores.
  let settled: GameState = { ...moved, characters };
  for (const c of characters) settled = depositPack(settled, c.id).state;
  return pruneFeatures({ ...settled, tiles: pruneLostTiles(settled) });
};
