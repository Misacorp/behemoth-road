import { describe, expect, it } from 'vitest';
import {
  createGame,
  creatureEdge,
  type GameState,
  hexDistance,
  hexKey,
  isCreatureHex,
  isPassable,
  isReachable,
  move,
  moveAlong,
  nextDay,
  ON_CREATURE,
  planPath,
  predictCreature,
  reachablePlaces,
  visibilityAt,
  windowHexes,
} from '../src/index.ts';

const apply = (state: GameState, result: ReturnType<typeof move>): GameState =>
  result.ok ? result.state : state;

/** The wanderer steps off to the farthest place it can reach, then boards again the next day. */
const wander = (state: GameState, day: number): GameState => {
  const me = state.characters.find((c) => c.id === 'wanderer')!;
  if (me.status !== 'active') return state;
  if (day % 2 === 1) {
    const plan = planPath(state, 'wanderer', ON_CREATURE);
    return plan.ok ? apply(state, moveAlong(state, 'wanderer', plan.steps)) : state;
  }
  const far = reachablePlaces(state, 'wanderer').at(-1);
  return far ? apply(state, move(state, 'wanderer', far.place)) : state;
};

describe('30 seeded days', () => {
  it('keeps its invariants with a rider, a wanderer and a sitter left behind', () => {
    let state = createGame(2026, { characterIds: ['rider', 'wanderer', 'sitter'] });
    const { windowRadius, graceDays } = state.config;

    // The sitter steps off behind the creature on day 1 and never moves again.
    const behind = creatureEdge(state)
      .filter((h) => isPassable(state, h))
      .sort((a, b) => 2 * b.r + b.q - (2 * a.r + a.q))[0]!;
    state = apply(state, move(state, 'sitter', behind));
    expect(state.characters[2]?.at).toEqual({ kind: 'hex', hex: behind });
    let sitterLostOn: number | undefined;

    for (let d = 0; d < 30; d++) {
      state = wander(state, d);
      const options = predictCreature(state).map((o) => hexKey(o.centre));
      state = nextDay(state);

      expect(options).toContain(hexKey(state.creature.centre));
      const window = windowHexes(state);
      expect(window.every((h) => visibilityAt(state, h) === 'seen')).toBe(true);
      expect(window.every((h) => hexDistance(h, state.creature.centre) <= windowRadius)).toBe(true);

      for (const c of state.characters) {
        if (c.status !== 'active' || c.at.kind === 'creature') continue;
        expect(isReachable(state, c.at.hex)).toBe(true);
        expect(isCreatureHex(state, c.at.hex)).toBe(false);
        expect(hexDistance(c.at.hex, state.creature.centre)).toBeLessThanOrEqual(
          windowRadius + graceDays,
        );
      }
      const [rider, , sitter] = state.characters;
      expect(rider).toMatchObject({ at: { kind: 'creature' }, status: 'active', actionsLeft: 3 });
      if (sitter?.status === 'lost') sitterLostOn ??= state.day;
      if (sitterLostOn !== undefined) expect(sitter?.status).toBe('lost');
    }

    expect(state.day).toBe(31);
    expect(state.characters[1]?.status).toBe('active');
    expect(sitterLostOn).toBeGreaterThan(2);
  });
});
