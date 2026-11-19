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
import { addFeatures, depositPack, type GameEvent, keyToHex, pruneFeatures } from './features.ts';
import { hexDistance } from './hex.ts';
import { hashString, hashToUnit } from './random.ts';
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
): { readonly care: Care; readonly stores: Materials; readonly ate: string | null } => {
  const { hunger } = creatureType(state.nature.type);
  const list = state.stimuli
    .filter((s) => hexDistance(state.creature.centre, s.hex) <= state.config.stimulusRange)
    .map((s) => ({ hex: s.hex, stimulus: s.type, reaction: reactionTo(state.nature, s) }));
  let satiety = Math.max(0, state.care.satiety - hunger.drainPerDay);
  let stores = state.stores;
  let ate: string | null = null;
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
      ate = meal;
    }
  }
  return { care: { satiety, cues: { day, list } }, stores, ate };
};

/** Whether a stimulus still burns after the tick that ends `day - 1`. */
const burnsOn = (s: Stimulus, day: number): boolean =>
  s.litDay + stimulusType(s.type).lastsTicks > day;

/**
 * The day tick, with what happened, in order: the creature's step (from equals
 * to when it lingered), what a starving creature ate, each fire that went out,
 * pick-up deposits, losses, the day. Events are public: none carries the
 * creature's reactions, hunger or cues.
 */
export const nextDayWithEvents = (
  state: GameState,
): { readonly state: GameState; readonly events: readonly GameEvent[] } => {
  const day = state.day + 1;
  const step = chooseCreatureStep(state);
  const creature: Creature = {
    ...state.creature,
    centre: step.centre,
    lingering: false,
    lingeredDay: state.creature.lingering ? state.day : state.creature.lingeredDay,
  };
  const { care, stores, ate } = careAfter(state, day);
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
    stimuli: state.stimuli.filter((s) => burnsOn(s, day)),
  };
  const actionsLeft = state.config.actionsPerDay;
  const events: GameEvent[] = [
    { kind: 'creature-step', from: state.creature.centre, to: creature.centre },
  ];
  if (ate) events.push({ kind: 'creature-ate', material: ate });
  for (const s of state.stimuli) {
    if (!burnsOn(s, day)) events.push({ kind: 'fire-out', hex: s.hex, stimulus: s.type });
  }
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
