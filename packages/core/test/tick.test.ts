import { describe, expect, it } from 'vitest';
import { createGame, creatureEdge, isPassable, move, nextDay } from '../src/index.ts';

const stepOff = (seed: number) => {
  const state = createGame(seed, { characterIds: ['a'] });
  const to = creatureEdge(state).find((h) => isPassable(state, h))!;
  const result = move(state, 'a', to);
  if (!result.ok) throw new Error(result.reason);
  return { idle: state, acted: result.state };
};

describe('day tick', () => {
  it('advances the day and resets actions', () => {
    const state = nextDay(stepOff(2).acted);
    expect(state.day).toBe(2);
    expect(state.characters[0]?.actionsLeft).toBe(3);
  });

  it('moves the world the same whether or not anyone acted', () => {
    const { idle, acted } = stepOff(2);
    const a = nextDay(idle);
    const b = nextDay(acted);
    expect(b.creature).toEqual(a.creature);
    expect(b.tiles).toEqual(a.tiles);
  });
});
