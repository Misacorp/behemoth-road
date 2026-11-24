import { describe, expect, it } from 'vitest';
import {
  CREATURE_TYPES,
  ENDING_TITLES,
  type GameState,
  endingOf,
  largestPerilSource,
  nextDay,
  recordEvents,
  THREAT_TYPES,
  toPlayerView,
} from '../src/index.ts';
import { fieldGame, QUIET } from './helpers.ts';

const over = (
  outcome: 'safe' | 'wounded' | 'lost',
  added: Record<string, number> = {},
): GameState => {
  const state = fieldGame(['a']);
  return {
    ...state,
    season: { status: 'over', outcome, day: 9 },
    stats: { ...state.stats, peril: { added, eased: {}, held: 0 } },
  };
};

describe('creature and threat content', () => {
  it('the Mossback stays: one leg, no turns, with sound, habit, blessing and tier', () => {
    const m = CREATURE_TYPES.find((c) => c.id === 'mossback')!;
    expect(m).toMatchObject({ fate: 'stays', tier: 1, route: { legs: [{ share: 1, turn: 0 }] } });
    expect(m.sound).not.toBe('');
    expect(m.habit).not.toBe('');
    expect(m.blessing.length).toBeGreaterThan(0);
    expect(m.route.stops).toBeUndefined();
  });

  it('only captors end a season as a pursuer', () => {
    expect(THREAT_TYPES.filter((t) => t.ending === 'pursuer').map((t) => t.id)).toEqual([
      'captors',
    ]);
  });

  it('the creature kind is public and the heading still moves as before', () => {
    const state = fieldGame(['a']);
    expect(toPlayerView(state).creature.kind).toBe('mossback');
    expect(nextDay(state).creature.heading).toBe(state.creature.heading);
  });
});

describe('endingOf', () => {
  it('is null while the season goes on', () => {
    expect(endingOf(fieldGame(['a']))).toBeNull();
  });

  it('titles follow fate and outcome', () => {
    expect(ENDING_TITLES).toEqual({
      stays: { safe: 'Arrived', wounded: 'Arrived, wounded', lost: 'Lost' },
      'goes-on': { safe: 'Gone on', wounded: 'Gone on, wounded', lost: 'Lost' },
    });
    expect(endingOf(over('safe'))).toMatchObject({ title: 'Arrived', fate: 'stays' });
    expect(endingOf(over('wounded'))).toMatchObject({ title: 'Arrived, wounded' });
    expect(endingOf(over('lost'))).toMatchObject({ title: 'Lost' });
  });

  it('a safe or wounded line is `${creature}.${outcome}`', () => {
    expect(endingOf(over('safe'))?.line).toBe('mossback.safe');
    expect(endingOf(over('wounded'))?.line).toBe('mossback.wounded');
  });

  it('a lost line follows the largest source of peril', () => {
    const line = (added: Record<string, number>) => endingOf(over('lost', added))?.line;
    expect(line({ hunger: 5, 'threat:captors': 3 })).toBe('ending.lost.hunger');
    expect(line({ hunger: 2, 'threat:captors': 3 })).toBe('ending.lost.pursuer');
    // Other threats give no line.
    expect(line({ hunger: 2, 'threat:rockslide': 6 })).toBeNull();
    expect(line({})).toBeNull();
  });

  it('a tie goes to the source that added peril last', () => {
    expect(endingOf(over('lost', { hunger: 4, 'threat:captors': 4 }))?.line).toBe(
      'ending.lost.pursuer',
    );
    expect(endingOf(over('lost', { 'threat:captors': 4, hunger: 4 }))?.line).toBe(
      'ending.lost.hunger',
    );
  });

  it('recordEvents keeps the added keys in the order the sources last added peril', () => {
    let state = fieldGame(['a']);
    const peril = (source: string, amount: number) =>
      ({
        kind: 'peril',
        from: 0,
        to: amount,
        sources: [{ source, amount }],
      }) as const;
    state = recordEvents(state, [peril('hunger', 2), peril('threat:captors', 2)]);
    expect(largestPerilSource(state)).toBe('threat:captors');
    state = recordEvents(state, [peril('hunger', 1)]);
    // Hunger now has 3 against 2.
    expect(largestPerilSource(state)).toBe('hunger');
    state = recordEvents(state, [peril('threat:captors', 1)]);
    // 3 against 3: the captors struck last.
    expect(largestPerilSource(state)).toBe('threat:captors');
    expect(Object.keys(state.stats.peril.added)).toEqual(['hunger', 'threat:captors']);
  });

  it('a season played to a hunger loss and to a pursuer loss reads from its own peril log', () => {
    // Underfed from the start with no food: hunger is the whole peril.
    let starved = fieldGame(['a'], { ...QUIET, perilHungry: 1, routeLength: 100 });
    starved = { ...starved, care: { ...starved.care, satiety: 0 } };
    for (let i = 0; i < 40 && starved.season.status === 'on'; i++) starved = nextDay(starved);
    expect(starved.season).toMatchObject({ status: 'over', outcome: 'lost' });
    expect(endingOf(toPlayerView(starved))).toMatchObject({
      title: 'Lost',
      line: 'ending.lost.hunger',
    });
  });
});
