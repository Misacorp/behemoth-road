import { describe, expect, it } from 'vitest';
import { createGame, destinationProgress, nextDay } from '@behemoth-road/core';
import { seasonScenario } from '../api/fixtures.ts';
import { routeOf } from './route.ts';

// A short season with nothing to lose it: it ends on the band.
const QUIET = {
  routeLength: 12,
  threatsFromDay: 100_000,
  settlementFirst: 100_000,
  perilHungry: 0,
};

describe('the route strip numbers', () => {
  it('read the destination band, and are full exactly when the season ends', () => {
    let state = createGame(7, { characterIds: ['a'], config: QUIET });
    expect(routeOf(state).progress).toBe(0);
    for (let i = 0; i < 60 && state.season.status === 'on'; i++) {
      expect(routeOf(state).progress).toBeLessThan(1);
      state = nextDay(state);
    }
    expect(state.season.status).toBe('over');
    expect(routeOf(state)).toMatchObject({ progress: 1, steps: state.creature.steps });
    expect(routeOf(state).progress).toBe(destinationProgress(state));
  });

  it('follows the band, not the steps', () => {
    const state = createGame(7, { characterIds: ['a'], config: QUIET });
    const walked = { ...state, creature: { ...state.creature, steps: 12 } };
    expect(routeOf(walked)).toMatchObject({ steps: 12, length: 12, progress: 0 });
  });

  it('is coherent in staged scenarios: staged steps move the route behind the creature', () => {
    const half = seasonScenario({ steps: 20 }).state;
    expect(routeOf(half).steps).toBe(20);
    expect(routeOf(half).progress).toBeCloseTo(0.5, 1);
    expect(routeOf(seasonScenario({ steps: 0 }).state).progress).toBe(0);
  });
});
