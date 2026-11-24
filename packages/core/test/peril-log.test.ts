import { describe, expect, it } from 'vitest';
import {
  act,
  createGame,
  type GameEvent,
  type GameState,
  hex,
  nextDayWithEvents,
  recordEvents,
  threatOfSource,
  toPlayerView,
} from '../src/index.ts';
import {
  fieldGame,
  lingering,
  placeCharacter,
  QUIET,
  withSettlement,
  withThreat,
} from './helpers.ts';

const HUNGRY = { ...QUIET, perilHungry: 1 };
const withSatiety = (state: GameState, satiety: number): GameState => ({
  ...state,
  care: { ...state.care, satiety },
});

/** What the log adds up to: added less eased. */
const net = (state: GameState): number => {
  const sum = (r: Readonly<Record<string, number>>) => Object.values(r).reduce((a, v) => a + v, 0);
  return sum(state.stats.peril.added) - sum(state.stats.peril.eased);
};

const perilEvents = (events: readonly GameEvent[]) =>
  events.filter((e): e is Extract<GameEvent, { kind: 'peril' }> => e.kind === 'peril');

describe('the peril breakdown', () => {
  it('starts empty', () => {
    expect(fieldGame(['a'], QUIET).stats.peril).toEqual({ added: {}, eased: {}, held: 0 });
  });

  it('blames hunger for the rise when the creature ends a tick underfed', () => {
    // Satiety 6 drains to 5: underfed level 2.
    const { state, events } = nextDayWithEvents(withSatiety(fieldGame(['a'], HUNGRY), 6));
    expect(perilEvents(events)).toEqual([
      { kind: 'peril', from: 0, to: 1, sources: [{ source: 'hunger', amount: 1 }] },
    ]);
    expect(state.stats.peril).toEqual({ added: { hunger: 1 }, eased: {}, held: 0 });
  });

  it('blames each threat type for its strike, hunger for its own part, in order', () => {
    let state = withSatiety(fieldGame(['a'], HUNGRY), 6);
    state = withThreat(lingering(state), 'captors', hex(0, 3), 3);
    const { state: next, events } = nextDayWithEvents(state);
    expect(next.peril).toBe(4);
    expect(perilEvents(events)[0]?.sources).toEqual([
      { source: 'threat:captors', amount: 3 },
      { source: 'hunger', amount: 1 },
    ]);
    expect(next.stats.peril.added).toEqual({ 'threat:captors': 3, hunger: 1 });
    expect(threatOfSource('threat:captors')).toBe('captors');
    expect(threatOfSource('hunger')).toBeNull();
  });

  it('counts only the room left below perilMax', () => {
    let state = withSatiety(fieldGame(['a'], HUNGRY), 6);
    state = withThreat(lingering(state), 'captors', hex(0, 3), 3);
    const { state: next, events } = nextDayWithEvents({ ...state, peril: 8 });
    expect(next.peril).toBe(10);
    expect(perilEvents(events)[0]?.sources).toEqual([{ source: 'threat:captors', amount: 2 }]);
  });

  it('records calm as easing, and what defence held off as held', () => {
    let state = fieldGame(['warden'], QUIET);
    state = withThreat(lingering(state), 'captors', hex(0, 3), 3);
    state = { ...state, peril: 4 };
    const defended = act(state, 'warden', { kind: 'defend' });
    if (!defended.ok) throw new Error(defended.reason);
    const { state: next } = nextDayWithEvents(defended.state);
    // Strength 3 less defence 2: 1 gets through; 2 held.
    expect(next.peril).toBe(5);
    expect(next.stats.peril).toEqual({ added: { 'threat:captors': 1 }, eased: {}, held: 2 });
    // A quiet day after it: peril falls by perilCalm.
    const calm = nextDayWithEvents(lingering(next));
    expect(calm.state.peril).toBe(4);
    expect(calm.state.stats.peril.eased).toEqual({ calm: 1 });
    // The log counts changes from the 4 we set by hand: 1 added, 2 held, then 1 eased.
    expect(net(calm.state)).toBe(calm.state.peril - 4);
  });

  it('records a shelter boon as easing, by what it took off', () => {
    let state = placeCharacter(fieldGame(['scout'], QUIET), 'scout', hex(3, -1));
    state = withSettlement(state, hex(3, -1), { attitude: 'friendly', favour: 3 });
    state = { ...state, peril: 5 };
    const r = act(state, 'scout', { kind: 'ask-boon', boon: 'shelter' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.peril).toBe(2);
    expect(r.state.stats.peril).toEqual({ added: {}, eased: { shelter: 3 }, held: 0 });
  });

  it('adds up to the peril at every tick of played seasons', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let state = createGame(seed, { characterIds: ['a', 'b'], config: { routeLength: 12 } });
      for (let i = 0; i < 40 && state.season.status === 'on'; i++) {
        state = nextDayWithEvents(state).state;
        expect(net(state)).toBe(state.peril);
      }
    }
  });

  it('is public in the player view and only names threat types and the plain causes', () => {
    const state = recordEvents(fieldGame(['a'], QUIET), [
      { kind: 'peril', from: 0, to: 2, sources: [{ source: 'hunger', amount: 2 }] },
    ]);
    expect(toPlayerView(state).stats.peril.added).toEqual({ hunger: 2 });
  });
});
