import { describe, expect, it } from 'vitest';
import { createGame, move, nextDay, neighbours, terrainAt } from '../src/index.ts';

describe('day tick', () => {
  it('advances the day and resets actions', () => {
    const seed = 2;
    let state = createGame(seed, { characterIds: ['a'] });
    const to = neighbours(state.characters[0]!.position).find((h) => terrainAt(seed, h).passable)!;
    const result = move(state, 'a', to);
    if (!result.ok) throw new Error(result.reason);
    state = nextDay(result.state);
    expect(state.day).toBe(2);
    expect(state.characters[0]?.actionsLeft).toBe(3);
  });

  it('moves the world the same whether or not anyone acted', () => {
    const seed = 2;
    const idle = createGame(seed, { characterIds: ['a'] });
    const to = neighbours(idle.characters[0]!.position).find((h) => terrainAt(seed, h).passable)!;
    const result = move(idle, 'a', to);
    if (!result.ok) throw new Error(result.reason);
    const a = nextDay(idle);
    const b = nextDay(result.state);
    expect(b.creature).toEqual(a.creature);
    expect(b.tiles).toEqual(a.tiles);
  });
});
