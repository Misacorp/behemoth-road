/**
 * Player actions. Each returns a new state or the reason it was refused.
 */

import type { Hex } from './hex.ts';
import { terrainOf } from './map.ts';
import { arePlacesAdjacent, placeNeighbours, toPlace } from './places.ts';
import type { Character, GameStateView, Place } from './state.ts';
import { isCreatureHex, isReachable } from './window.ts';

export type MoveRefusal =
  | 'invalid-hex'
  | 'unknown-character'
  | 'character-lost'
  | 'not-adjacent'
  | 'unreachable'
  | 'impassable'
  | 'not-enough-actions';

export type ActionResult<S extends GameStateView = GameStateView> =
  { readonly ok: true; readonly state: S } | { readonly ok: false; readonly reason: MoveRefusal };

/** How a character can enter a place. */
export interface Entry {
  /** Actions it costs to enter. */
  readonly cost: number;
  /**
   * A tag naming what makes entering possible where the terrain alone would not
   * (later: a rope over a cliff, a tunnel, a boat). Nothing sets it yet.
   */
  readonly via?: string;
}

/**
 * Whether and how a character may enter a hex, ignoring reachability and actions.
 * The creature's footprint hexes are not hexes to stand on (the creature is
 * entered as a whole, by boarding). A hex whose terrain the state does not know
 * cannot be entered. Gear will plug in here, returning a `via`.
 */
export const entryInto = (state: GameStateView, h: Hex): Entry | null => {
  if (isCreatureHex(state, h)) return null;
  const terrain = terrainOf(state, h);
  if (!terrain?.passable) return null;
  return { cost: state.config.moveCost + terrain.extraMoveCost };
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

/**
 * Moves a character one step: to an adjacent hex, onto the creature from a hex
 * beside it (any footprint hex means the creature), or off the creature onto a
 * hex beside it.
 */
export const move = <S extends GameStateView>(
  state: S,
  characterId: string,
  to: Hex | Place,
): ActionResult<S> => {
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
  return { ok: true, state: { ...state, characters } };
};

/** The places a character can move to with one step right now. */
export const legalMoves = (state: GameStateView, characterId: string): Place[] => {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return [];
  return placeNeighbours(state, character.at).filter((p) => move(state, characterId, p).ok);
};
