import { type Character, type GameState, type Hex, neighbours, terrainAt } from '../src/index.ts';

/** Returns a copy of the state with one character replaced. */
export const withCharacter = (state: GameState, character: Character): GameState => ({
  ...state,
  characters: state.characters.map((c) => (c.id === character.id ? character : c)),
});

export const placeCharacter = (state: GameState, id: string, position: Hex): GameState => {
  const c = state.characters.find((x) => x.id === id);
  if (!c) throw new Error(`no character ${id}`);
  return withCharacter(state, { ...c, position });
};

/** A neighbour of `h` whose terrain is (or is not) passable, if any. */
export const neighbourWhere = (seed: number, h: Hex, passable: boolean): Hex | undefined =>
  neighbours(h).find((n) => terrainAt(seed, n).passable === passable);
