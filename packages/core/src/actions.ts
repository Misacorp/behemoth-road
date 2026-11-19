/**
 * Player actions. Each returns a new state or the reason it was refused.
 */

import { type Hex, isAdjacent, isValidHex, neighbours } from './hex.ts';
import { terrainAt } from './map.ts';
import type { Character, GameState } from './state.ts';
import { isCreatureHex, isReachable } from './window.ts';

export type MoveRefusal =
  | 'invalid-hex'
  | 'unknown-character'
  | 'character-lost'
  | 'not-adjacent'
  | 'unreachable'
  | 'impassable'
  | 'not-enough-actions';

export type ActionResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: MoveRefusal };

/** How a character can enter a hex. */
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
 * The creature's hexes are occupied: nobody enters, stands on or passes through them.
 * Gear will plug in here, returning a `via`.
 */
export const entryInto = (state: GameState, h: Hex): Entry | null => {
  if (isCreatureHex(state, h)) return null;
  const terrain = terrainAt(state.seed, h);
  if (!terrain.passable) return null;
  return { cost: state.config.moveCost + terrain.extraMoveCost };
};

export const isPassable = (state: GameState, h: Hex): boolean => entryInto(state, h) !== null;

export type CharacterLookup =
  | { readonly ok: true; readonly index: number; readonly character: Character }
  | { readonly ok: false; readonly reason: 'unknown-character' | 'character-lost' };

export const activeCharacter = (state: GameState, characterId: string): CharacterLookup => {
  const index = state.characters.findIndex((c) => c.id === characterId);
  const character = state.characters[index];
  if (!character) return { ok: false, reason: 'unknown-character' };
  if (character.status !== 'active') return { ok: false, reason: 'character-lost' };
  return { ok: true, index, character };
};

/** Moves a character one hex. */
export const move = (state: GameState, characterId: string, to: Hex): ActionResult => {
  if (!isValidHex(to)) return { ok: false, reason: 'invalid-hex' };
  const found = activeCharacter(state, characterId);
  if (!found.ok) return found;
  const { index, character } = found;
  if (!isAdjacent(character.position, to)) return { ok: false, reason: 'not-adjacent' };
  if (!isReachable(state, to)) return { ok: false, reason: 'unreachable' };
  const entry = entryInto(state, to);
  if (!entry) return { ok: false, reason: 'impassable' };
  if (character.actionsLeft < entry.cost) return { ok: false, reason: 'not-enough-actions' };

  const characters = state.characters.slice();
  characters[index] = {
    ...character,
    position: { q: to.q, r: to.r },
    actionsLeft: character.actionsLeft - entry.cost,
  };
  return { ok: true, state: { ...state, characters } };
};

/** The hexes a character can move to with one step right now. */
export const legalMoves = (state: GameState, characterId: string): Hex[] => {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return [];
  return neighbours(character.position).filter((h) => move(state, characterId, h).ok);
};
