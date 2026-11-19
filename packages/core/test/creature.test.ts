import { describe, expect, it } from 'vitest';
import {
  chooseCreatureStep,
  createGame,
  creatureHexes,
  hex,
  hexDistance,
  hexEquals,
  nextDay,
  predictCreature,
  rotate,
} from '../src/index.ts';

describe('the creature', () => {
  it('stands on a 7-hex footprint', () => {
    const state = createGame(1);
    expect(creatureHexes(state)).toHaveLength(7);
  });

  it('predicts straight ahead or one step to either side, with chances from the config', () => {
    const state = createGame(1, { heading: 'n' });
    const options = predictCreature(state);
    expect(options.map((o) => [o.direction, o.chance])).toEqual([
      ['nw', 0.25],
      ['n', 0.5],
      ['ne', 0.25],
    ]);
    expect(options.map((o) => o.centre)).toEqual([hex(-1, 0), hex(0, -1), hex(1, -1)]);
  });

  it('leaves out steps with zero weight', () => {
    const state = createGame(1, { config: { veerWeights: { left: 0, right: 0 } } });
    expect(predictCreature(state)).toEqual([{ direction: 'n', centre: hex(0, -1), chance: 1 }]);
  });

  it('steps one hex a day among the predicted options, never back, keeping its heading', () => {
    let state = createGame(11, { heading: 'se' });
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const options = predictCreature(state);
      const before = state.creature.centre;
      expect(chooseCreatureStep(state)).toEqual(chooseCreatureStep(state));
      state = nextDay(state);
      const after = state.creature.centre;
      expect(hexDistance(before, after)).toBe(1);
      const taken = options.find((o) => hexEquals(o.centre, after));
      expect(taken).toBeDefined();
      expect(taken?.direction).not.toBe(rotate('se', 3));
      seen.add(taken?.direction ?? '');
      expect(state.creature.heading).toBe('se');
    }
    expect([...seen].sort()).toEqual(['ne', 's', 'se']);
  });
});
