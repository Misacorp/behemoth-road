/**
 * Player actions. Each returns a new state or the reason it was refused.
 */

import { UNLOCKS } from './content/index.ts';
import { depositPack, enterHex, type GameEvent } from './features.ts';
import type { Hex } from './hex.ts';
import { terrainOf } from './map.ts';
import { arePlacesAdjacent, placeNeighbours, toPlace } from './places.ts';
import { type Character, type GameStateView, isSeasonOver, type Place } from './state.ts';
import { isCreatureHex, isReachable } from './window.ts';

export type MoveRefusal =
  | 'season-over'
  | 'invalid-hex'
  | 'unknown-character'
  | 'character-lost'
  | 'not-adjacent'
  | 'unreachable'
  | 'impassable'
  | 'not-enough-actions';

export type ActionResult<S extends GameStateView = GameStateView> =
  | {
      readonly ok: true;
      readonly state: S;
      /** What happened on arrival: reveals, a scout's glints, a trap. */
      readonly events: readonly GameEvent[];
      /** A hidden trap caught the character here: its day is over. */
      readonly trapped: boolean;
    }
  | { readonly ok: false; readonly reason: MoveRefusal };

/** How a character can enter a place. */
export interface Entry {
  /** Actions it costs to enter. */
  readonly cost: number;
  /**
   * A tag naming what makes entering possible where the terrain alone would not
   * (a team unlock's id: the grappling hook over a cliff).
   */
  readonly via?: string;
}

/**
 * Whether and how a character may enter a hex, ignoring reachability and actions.
 * The creature's footprint hexes are not hexes to stand on (the creature is
 * entered as a whole, by boarding). A hex whose terrain the state does not know
 * cannot be entered. Terrain that is not passable can be entered with a team
 * unlock whose `movement` covers its tags; the cheapest wins, and its id is the
 * step's `via` (the grappling hook over a cliff).
 */
export const entryInto = (state: GameStateView, h: Hex): Entry | null => {
  if (isCreatureHex(state, h)) return null;
  const terrain = terrainOf(state, h);
  if (!terrain) return null;
  if (terrain.passable) return { cost: state.config.moveCost + terrain.extraMoveCost };
  let best: Entry | null = null;
  for (const unlock of UNLOCKS) {
    const movement = unlock.movement;
    if (!movement || !state.unlocks.includes(unlock.id)) continue;
    if (!movement.terrainTags.some((tag) => terrain.tags.includes(tag))) continue;
    if (!best || movement.cost < best.cost) best = { cost: movement.cost, via: unlock.id };
  }
  return best;
};

/** Whether and how a character may enter a place. Boarding the creature is one normal step. */
export const entryToPlace = (state: GameStateView, place: Place): Entry | null =>
  place.kind === 'creature' ? { cost: state.config.moveCost } : entryInto(state, place.hex);

/** A hex can be stood on: passable and not under the creature. */
export const isPassable = (state: GameStateView, h: Hex): boolean => entryInto(state, h) !== null;

/** Whether a place is in reach: the creature always is (the window is centred on it). */
export const isPlaceReachable = (state: GameStateView, place: Place): boolean =>
  place.kind === 'creature' || isReachable(state, place.hex);

export type CharacterLookup =
  | { readonly ok: true; readonly index: number; readonly character: Character }
  | { readonly ok: false; readonly reason: 'unknown-character' | 'character-lost' };

export const activeCharacter = (state: GameStateView, characterId: string): CharacterLookup => {
  const index = state.characters.findIndex((c) => c.id === characterId);
  const character = state.characters[index];
  if (!character) return { ok: false, reason: 'unknown-character' };
  if (character.status !== 'active') return { ok: false, reason: 'character-lost' };
  return { ok: true, index, character };
};

type StepResult<S extends GameStateView> =
  | { readonly ok: true; readonly state: S; readonly to: Place }
  | { readonly ok: false; readonly reason: MoveRefusal };

/** The movement of one step and its cost, without what happens on arrival. */
export const stepOnly = <S extends GameStateView>(
  state: S,
  characterId: string,
  to: Hex | Place,
): StepResult<S> => {
  if (isSeasonOver(state)) return { ok: false, reason: 'season-over' };
  const target = toPlace(state, to);
  if (!target) return { ok: false, reason: 'invalid-hex' };
  const found = activeCharacter(state, characterId);
  if (!found.ok) return found;
  const { index, character } = found;
  if (!arePlacesAdjacent(state, character.at, target)) return { ok: false, reason: 'not-adjacent' };
  if (!isPlaceReachable(state, target)) return { ok: false, reason: 'unreachable' };
  const entry = entryToPlace(state, target);
  if (!entry) return { ok: false, reason: 'impassable' };
  if (character.actionsLeft < entry.cost) return { ok: false, reason: 'not-enough-actions' };

  const characters = state.characters.slice();
  characters[index] = { ...character, at: target, actionsLeft: character.actionsLeft - entry.cost };
  return { ok: true, state: { ...state, characters }, to: target };
};

/**
 * Moves a character one step: to an adjacent hex, onto the creature from a hex
 * beside it (any footprint hex means the creature), or off the creature onto a
 * hex beside it. Entering a hex explores it, revealing its feature (on the
 * server, where hidden features exist); a hidden trap ends the character's day.
 * Boarding empties the character's pack into the team stores.
 */
export const move = <S extends GameStateView>(
  state: S,
  characterId: string,
  to: Hex | Place,
): ActionResult<S> => {
  const stepped = stepOnly(state, characterId, to);
  if (!stepped.ok) return stepped;
  if (stepped.to.kind !== 'hex') {
    const boarded = depositPack(stepped.state, characterId);
    return { ok: true, state: boarded.state, events: boarded.events, trapped: false };
  }
  const entered = enterHex(stepped.state, characterId, stepped.to.hex);
  return { ok: true, state: entered.state, events: entered.events, trapped: entered.trapped };
};

/** The places a character can move to with one step right now. */
export const legalMoves = (state: GameStateView, characterId: string): Place[] => {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return [];
  return placeNeighbours(state, character.at).filter((p) => move(state, characterId, p).ok);
};
