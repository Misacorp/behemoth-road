import { describe, expect, it } from 'vitest';
import {
  createGame,
  creatureEdge,
  isPassable,
  move,
  nextDay,
  nextDayWithEvents,
  onHex,
} from '../src/index.ts';

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
    // The same tiles; only where the character stepped is explored.
    const plain = (tiles: typeof a.tiles) =>
      Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, { ...t, explored: false }]));
    expect(plain(b.tiles)).toEqual(plain(a.tiles));
  });
});

describe('the day tick’s events', () => {
  const straight = { veerWeights: { left: 0, right: 0 } };

  it('reports the step and the new day, the same as nextDay', () => {
    const state = createGame(3, { config: straight });
    const { state: next, events } = nextDayWithEvents(state);
    expect(next).toEqual(nextDay(state));
    expect(events).toEqual([
      { kind: 'creature-step', from: { q: 0, r: 0 }, to: { q: 0, r: -1 } },
      { kind: 'day', day: 2 },
    ]);
  });

  it('reports packs deposited by those picked up, and characters left behind', () => {
    let state = createGame(3, { characterIds: ['picked', 'left'], config: straight });
    state = {
      ...state,
      characters: state.characters.map((c) =>
        c.id === 'picked'
          ? { ...c, at: onHex({ q: 1, r: -2 }), pack: { iron: 2 } }
          : { ...c, at: onHex({ q: 0, r: 5 }), pack: { stone: 1 } },
      ),
    };
    const day2 = nextDayWithEvents(state);
    expect(day2.events).toEqual([
      { kind: 'creature-step', from: { q: 0, r: 0 }, to: { q: 0, r: -1 } },
      { kind: 'deposit', characterId: 'picked', materials: { iron: 2 } },
      { kind: 'day', day: 2 },
    ]);
    const day3 = nextDayWithEvents(day2.state);
    expect(day3.events).toEqual([
      { kind: 'creature-step', from: { q: 0, r: -1 }, to: { q: 0, r: -2 } },
      { kind: 'lost', characterId: 'left', hex: { q: 0, r: 5 } },
      { kind: 'day', day: 3 },
    ]);
    // Lost once: not reported again.
    expect(nextDayWithEvents(day3.state).events.some((e) => e.kind === 'lost')).toBe(false);
  });
});
