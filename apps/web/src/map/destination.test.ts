import * as v from 'valibot';
import { inDestination } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { chainScenario, toView } from '../api/fixtures.ts';
import { GameStateViewSchema } from '../api/schema.ts';
import { PROJECTION } from './art.ts';
import { destinationHexesOn } from './destination.ts';

describe('the destination band', () => {
  it('is in the view, and the client schema accepts it', () => {
    const game = toView(chainScenario()).game;
    expect(game.destination.depth).toBeGreaterThanOrEqual(1);
    expect(v.safeParse(GameStateViewSchema, game).success).toBe(true);
  });

  it('is staged a number of rows ahead of the creature', () => {
    const near = toView(chainScenario({ destinationAhead: 3 })).game;
    const far = toView(chainScenario()).game;
    expect(near.destination.from).toBeLessThan(far.destination.from);
  });

  it('is drawn on every band hex the layer covers, and only those', () => {
    const game = toView(chainScenario({ destinationAhead: 3 })).game;
    const box = { x: -600, y: -600, width: 1200, height: 1200 };
    const hexes = destinationHexesOn(game.destination, box, PROJECTION);
    expect(hexes.length).toBeGreaterThan(0);
    expect(hexes.every((h) => inDestination(game.destination, h))).toBe(true);
  });
});
