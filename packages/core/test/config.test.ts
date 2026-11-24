import { describe, expect, it } from 'vitest';
import { createGame, DEFAULT_CONFIG, resolveConfig } from '../src/index.ts';

describe('tuning config', () => {
  it('starts from the documented values', () => {
    expect(DEFAULT_CONFIG).toEqual({
      actionsPerDay: 3,
      moveCost: 1,
      creatureRadius: 1,
      windowRadius: 6,
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
      buildWork: 1,
      siteChanceSpecialistTier1: 0.7,
      siteChanceSpecialistTier2: 0.8,
      siteChanceOtherTier1: 0.35,
      siteChanceOtherTier2: 0,
      stimulusRange: 3,
      stimulusPull: 6,
      hungryVeerWeights: { left: 1, straight: 1, right: 1 },
      lightFireCost: 1,
      feedCost: 1,
      lingerCost: 2,
      towThrowCost: 1,
      towGrabCost: 1,
      towReach: 1,
      threatsFromDay: 3,
      threatChanceBase: 0.25,
      threatChancePerPlayer: 0.05,
      threatChancePerDay: 0.01,
      threatChanceMax: 0.9,
      threatsMax: 3,
      threatStrengthPlayers: 3,
      threatStrengthDays: 14,
      threatPathDistance: 5,
      struckActions: 1,
      stanceAmbushPerAction: 1,
      lingerChainMax: 2,
      strikeCost: 1,
      clearPowerWarden: 2,
      clearPowerOther: 1,
      defendCost: 1,
      defendReduction: 2,
      parleyCost: 1,
      offerCost: 1,
      askBoonCost: 1,
      parleyFavourWarden: 2,
      parleyFavourOther: 1,
      parleyAngerChanceOther: 0.25,
      offerFavour: 2,
      misleadDays: 4,
      shelterPeril: 3,
      settlementFirst: 4,
      settlementEvery: 10,
      perilMax: 10,
      perilWoundedAt: 5,
      perilHungry: 1,
      perilHungryLevel: 2,
      perilCalm: 1,
      routeLength: 40,
      xpPerPick: 14,
      catchUpEverySteps: 10,
      catchUpXp: 1,
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
    for (const key of [
      'lightFireCost',
      'feedCost',
      'lingerCost',
      'towThrowCost',
      'towGrabCost',
    ] as const) {
      expect(() => resolveConfig({ [key]: 0 })).toThrow(new RegExp(key));
    }
  });

  it('rejects season values the rules cannot use', () => {
    for (const key of [
      'threatChanceBase',
      'threatChancePerPlayer',
      'threatChancePerDay',
      'threatChanceMax',
      'parleyAngerChanceOther',
    ] as const) {
      expect(() => resolveConfig({ [key]: -0.1 })).toThrow(new RegExp(key));
      expect(() => resolveConfig({ [key]: 1.1 })).toThrow(new RegExp(key));
    }
    for (const key of [
      'routeLength',
      'settlementEvery',
      'settlementFirst',
      'strikeCost',
    ] as const) {
      expect(() => resolveConfig({ [key]: 0 })).toThrow(new RegExp(key));
    }
    expect(() => resolveConfig({ threatsMax: -1 })).toThrow(/threatsMax/);
    expect(() => resolveConfig({ struckActions: 0.5 })).toThrow(/struckActions/);
    // Lying in wait never beats an active strike.
    expect(() => resolveConfig({ stanceAmbushPerAction: 2 })).toThrow(/stanceAmbushPerAction/);
    expect(() => resolveConfig({ perilWoundedAt: 10 })).toThrow(/perilWoundedAt/);
    expect(() => resolveConfig({ perilMax: 4 })).toThrow(/perilWoundedAt/);
    expect(() => resolveConfig({ perilHungryLevel: 4 })).toThrow(/perilHungryLevel/);
    expect(() => resolveConfig({ threatPathDistance: 2 })).toThrow(/threatPathDistance/);
    expect(() => resolveConfig({ threatPathDistance: 7 })).toThrow(/threatPathDistance/);
    expect(resolveConfig({ routeLength: 12, perilWoundedAt: 9 }).routeLength).toBe(12);
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
