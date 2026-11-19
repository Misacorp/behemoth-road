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
      featureChance: 0.08,
      packCapacity: 6,
      surveyCostSpecialist: 1,
      surveyCostOther: 2,
      gatherCost: 1,
      workSiteCost: 2,
      buildCost: 1,
      siteChanceSpecialistTier1: 0.7,
      siteChanceSpecialistTier2: 0.5,
      siteChanceOtherTier1: 0.35,
      siteChanceOtherTier2: 0,
      stimulusRange: 3,
      stimulusPull: 6,
      hungryVeerWeights: { left: 1, straight: 1, right: 1 },
      lightFireCost: 1,
      feedCost: 1,
      lingerCost: 2,
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
    expect(() => resolveConfig({ hungryVeerWeights: { left: 0, straight: 0, right: 0 } })).toThrow(
      /hungryVeerWeights/,
    );
    expect(() => resolveConfig({ hungryVeerWeights: { left: -1 } })).toThrow(/hungryVeerWeights/);
    expect(() => resolveConfig({ stimulusRange: -1 })).toThrow(/stimulusRange/);
    expect(() => resolveConfig({ stimulusRange: 1.5 })).toThrow(/stimulusRange/);
    expect(() => resolveConfig({ stimulusPull: 0.5 })).toThrow(/stimulusPull/);
    expect(() => resolveConfig({ stimulusPull: Infinity })).toThrow(/stimulusPull/);
    for (const key of ['lightFireCost', 'feedCost', 'lingerCost'] as const) {
      expect(() => resolveConfig({ [key]: 0 })).toThrow(new RegExp(key));
    }
  });

  it('merges part of the hungry veer weights', () => {
    expect(resolveConfig({ hungryVeerWeights: { straight: 3 } }).hungryVeerWeights).toEqual({
      left: 1,
      straight: 3,
      right: 1,
    });
  });

  it('is stored in the game, so every rule reads the same values', () => {
    expect(createGame(1, { config: { actionsPerDay: 5 } }).config.actionsPerDay).toBe(5);
  });
});
