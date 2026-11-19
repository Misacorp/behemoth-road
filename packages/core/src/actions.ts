/**
 * Player actions. Each returns a new state or the reason it was refused.
 */

import { type Hex, isAdjacent, neighbours } from './hex.ts';
import { terrainAt } from './map.ts';
import type { GameState } from './state.ts';
import { isReachable } from './window.ts';

export type MoveRefusal =
  | 'unknown-character'
  | 'character-lost'
  | 'not-adjacent'
  | 'unreachable'
  | 'impassable'
  | 'not-enough-actions';

export type ActionResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: MoveRefusal };

/** Actions it costs to enter `to`. */
export const moveCost = (state: GameState, to: Hex): number =>
  state.config.moveCost + terrainAt(state.seed, to).extraMoveCost;

/** Moves a character one hex. Characters may stand in and pass through the creature's hexes. */
export const move = (state: GameState, characterId: string, to: Hex): ActionResult => {
  const index = state.characters.findIndex((c) => c.id === characterId);
  const character = state.characters[index];
  if (!character) return { ok: false, reason: 'unknown-character' };
  if (character.status !== 'active') return { ok: false, reason: 'character-lost' };
  if (!isAdjacent(character.position, to)) return { ok: false, reason: 'not-adjacent' };
  if (!isReachable(state, to)) return { ok: false, reason: 'unreachable' };
  if (!terrainAt(state.seed, to).passable) return { ok: false, reason: 'impassable' };
  const cost = moveCost(state, to);
  if (character.actionsLeft < cost) return { ok: false, reason: 'not-enough-actions' };

  const characters = state.characters.slice();
  characters[index] = {
    ...character,
    position: { q: to.q, r: to.r },
    actionsLeft: character.actionsLeft - cost,
  };
  return { ok: true, state: { ...state, characters } };
};

/** The hexes a character can move to right now. */
export const legalMoves = (state: GameState, characterId: string): Hex[] => {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return [];
  return neighbours(character.position).filter((h) => move(state, characterId, h).ok);
};
