/**
 * Player actions. Each returns a new state or the reason it was refused.
 */

import { type Hex, hexEquals, hexKey, isAdjacent, isValidHex, neighbours } from './hex.ts';
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

export type PathRefusal = Exclude<MoveRefusal, 'not-adjacent'> | 'no-path';

export type ActionResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: MoveRefusal };

export type PathPlan =
  | {
      readonly ok: true;
      /** The hexes to step onto, in order, not including the start. Empty when already there. */
      readonly path: readonly Hex[];
      /** Total actions the path costs. */
      readonly cost: number;
    }
  | { readonly ok: false; readonly reason: PathRefusal };

export type PathResult =
  | { readonly ok: true; readonly state: GameState }
  | {
      readonly ok: false;
      readonly reason: MoveRefusal;
      /** Index in the path of the step that was refused. */
      readonly step: number;
    };

/** Actions it costs to enter `to`. */
export const moveCost = (state: GameState, to: Hex): number =>
  state.config.moveCost + terrainAt(state.seed, to).extraMoveCost;

/**
 * Whether a character may enter a hex. The creature's hexes always are, whatever
 * lies under them: characters can climb on and through it.
 */
export const isPassable = (state: GameState, h: Hex): boolean =>
  isCreatureHex(state, h) || terrainAt(state.seed, h).passable;

type CharacterLookup =
  | { readonly ok: true; readonly index: number; readonly character: Character }
  | { readonly ok: false; readonly reason: 'unknown-character' | 'character-lost' };

const activeCharacter = (state: GameState, characterId: string): CharacterLookup => {
  const index = state.characters.findIndex((c) => c.id === characterId);
  const character = state.characters[index];
  if (!character) return { ok: false, reason: 'unknown-character' };
  if (character.status !== 'active') return { ok: false, reason: 'character-lost' };
  return { ok: true, index, character };
};

/** Moves a character one hex. Characters may stand in and pass through the creature's hexes. */
export const move = (state: GameState, characterId: string, to: Hex): ActionResult => {
  if (!isValidHex(to)) return { ok: false, reason: 'invalid-hex' };
  const found = activeCharacter(state, characterId);
  if (!found.ok) return found;
  const { index, character } = found;
  if (!isAdjacent(character.position, to)) return { ok: false, reason: 'not-adjacent' };
  if (!isReachable(state, to)) return { ok: false, reason: 'unreachable' };
  if (!isPassable(state, to)) return { ok: false, reason: 'impassable' };
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

/**
 * The cheapest path for a character to `to` over reachable, passable hexes, with
 * its cost. Refused if the target cannot be entered, no path exists, or the
 * cheapest path costs more than the character's actions left. Ties are broken
 * the same way every time.
 */
export const planPath = (state: GameState, characterId: string, to: Hex): PathPlan => {
  if (!isValidHex(to)) return { ok: false, reason: 'invalid-hex' };
  const found = activeCharacter(state, characterId);
  if (!found.ok) return found;
  const start = found.character.position;
  if (hexEquals(start, to)) return { ok: true, path: [], cost: 0 };
  if (!isReachable(state, to)) return { ok: false, reason: 'unreachable' };
  if (!isPassable(state, to)) return { ok: false, reason: 'impassable' };

  // Uniform-cost search. The reachable area is a few hundred hexes at most, so a
  // sorted frontier is plenty.
  const best = new Map<string, { cost: number; from: Hex | null }>([
    [hexKey(start), { cost: 0, from: null }],
  ]);
  const done = new Set<string>();
  const frontier: { hex: Hex; cost: number }[] = [{ hex: start, cost: 0 }];
  const target = hexKey(to);
  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift() as { hex: Hex; cost: number };
    const key = hexKey(current.hex);
    if (done.has(key)) continue;
    done.add(key);
    if (key === target) break;
    for (const next of neighbours(current.hex)) {
      const nextKey = hexKey(next);
      if (done.has(nextKey) || !isReachable(state, next) || !isPassable(state, next)) continue;
      const cost = current.cost + moveCost(state, next);
      const known = best.get(nextKey);
      if (known && known.cost <= cost) continue;
      best.set(nextKey, { cost, from: current.hex });
      frontier.push({ hex: next, cost });
    }
  }

  const end = best.get(target);
  if (!end || !done.has(target)) return { ok: false, reason: 'no-path' };
  if (end.cost > found.character.actionsLeft) return { ok: false, reason: 'not-enough-actions' };
  const path: Hex[] = [];
  for (let h: Hex | null = to; h && !hexEquals(h, start); h = best.get(hexKey(h))?.from ?? null) {
    path.unshift(h);
  }
  return { ok: true, path, cost: end.cost };
};

/** Walks a path step by step through `move`: every step applies, or none does. */
export const moveAlong = (
  state: GameState,
  characterId: string,
  path: readonly Hex[],
): PathResult => {
  let current = state;
  for (const [step, h] of path.entries()) {
    const result = move(current, characterId, h);
    if (!result.ok) return { ok: false, reason: result.reason, step };
    current = result.state;
  }
  if (path.length === 0) {
    const found = activeCharacter(state, characterId);
    if (!found.ok) return { ok: false, reason: found.reason, step: 0 };
  }
  return { ok: true, state: current };
};
