import { describe, expect, it } from 'vitest';
import { createGame, DEFAULT_CONFIG, resolveConfig } from '../src/index.ts';

describe('tuning config', () => {
  it('starts from the documented values', () => {
    expect(DEFAULT_CONFIG).toEqual({
      actionsPerDay: 3,
      moveCost: 1,
      creatureRadius: 1,
      windowRadius: 5,
      graceDays: 1,
      lostTileRings: 4,
      playerCap: 15,
      veerWeights: { left: 1, straight: 2, right: 1 },
    });
  });

  it('merges overrides, including part of the veer weights', () => {
    const c = resolveConfig({ windowRadius: 7, veerWeights: { left: 0 } });
    expect(c.windowRadius).toBe(7);
    expect(c.veerWeights).toEqual({ left: 0, straight: 2, right: 1 });
  });

  it('rejects values the rules cannot use', () => {
    expect(() => resolveConfig({ actionsPerDay: 1.5 })).toThrow(/actionsPerDay/);
    expect(() => resolveConfig({ moveCost: 0 })).toThrow(/moveCost/);
    expect(() => resolveConfig({ moveCost: -1 })).toThrow(/moveCost/);
    expect(() => resolveConfig({ windowRadius: 1 })).toThrow(/windowRadius/);
    expect(() => resolveConfig({ veerWeights: { left: 0, straight: 0, right: 0 } })).toThrow(
      /veerWeights/,
    );
  });

  it('is stored in the game, so every rule reads the same values', () => {
    expect(createGame(1, { config: { actionsPerDay: 5 } }).config.actionsPerDay).toBe(5);
  });
});
