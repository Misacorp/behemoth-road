import { type Character, type GameState, type Hex } from '../src/index.ts';

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

/** The first seed in 0..1999 for which `test` holds. */
export const findSeed = (test: (seed: number) => boolean): number => {
  for (let seed = 0; seed < 2000; seed++) if (test(seed)) return seed;
  throw new Error('no seed found');
};
