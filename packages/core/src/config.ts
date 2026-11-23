/**
 * Every tuning number in one place. Values are starting guesses from
 * docs/PROTOTYPE_PLAN.md ("Starting values"); expect them to change.
 */

export interface VeerWeights {
  /** Relative chance of stepping one sixth of a turn anticlockwise of the heading. */
  readonly left: number;
  readonly straight: number;
  /** Relative chance of stepping one sixth of a turn clockwise of the heading. */
  readonly right: number;
}

export interface TuningConfig {
  /** Actions each character gets per day. */
  readonly actionsPerDay: number;
  /** Base action cost to move one hex (terrain may add to it). */
  readonly moveCost: number;
  /** Creature footprint radius in hexes: 1 means the centre and its six neighbours. */
  readonly creatureRadius: number;
  /** Hexes within this distance of the creature's centre are in play. */
  readonly windowRadius: number;
  /** Days a hex stays reachable after it leaves the window, before it is lost. */
  readonly graceDays: number;
  /** Lost tiles are kept (for drawing the fog) this many rings beyond the window; further ones are pruned. */
  readonly lostTileRings: number;
  /** Maximum active characters in one game. */
  readonly playerCap: number;
  /** How the creature chooses each day's step. */
  readonly veerWeights: VeerWeights;
  /** Chance that a hex holds a feature (a node, site or trap), when one fits its terrain. */
  readonly featureChance: number;
  /** Units a character's pack holds. */
  readonly packCapacity: number;
  /** Action costs. Surveying an adjacent hex costs less for a role tagged `survey`. */
  readonly surveyCostSpecialist: number;
  readonly surveyCostOther: number;
  readonly gatherCost: number;
  readonly workSiteCost: number;
  /** Actions one build step costs. */
  readonly buildCost: number;
  /** Work one build step adds to the unlock in progress (a skill can raise it). */
  readonly buildWork: number;
  /** Chance to work a site, by tier, for a role tagged `sites` and for anyone else. */
  readonly siteChanceSpecialistTier1: number;
  readonly siteChanceSpecialistTier2: number;
  readonly siteChanceOtherTier1: number;
  readonly siteChanceOtherTier2: number;
  /** Stimuli (fires) within this distance of the creature's centre sway its step. */
  readonly stimulusRange: number;
  /**
   * How strongly a stimulus sways the step: each step option's weight is multiplied
   * by this to the power of its score (closer +1, farther −1, per stimulus in range).
   */
  readonly stimulusPull: number;
  /** The step weights while the creature is underfed (erratic). Stimuli still pull. */
  readonly hungryVeerWeights: VeerWeights;
  /** Action costs of the creature-care actions. */
  readonly lightFireCost: number;
  readonly feedCost: number;
  /** Keepers only: the creature stays put at the next tick. */
  readonly lingerCost: number;

  // Threats (docs/design/m5-season.md).
  /** The first day (after a tick) on which a threat may appear. */
  readonly threatsFromDay: number;
  /** Daily chance of a new threat: base + per active player + per day, capped at the max. */
  readonly threatChanceBase: number;
  readonly threatChancePerPlayer: number;
  readonly threatChancePerDay: number;
  readonly threatChanceMax: number;
  /** No new threat is rolled while this many are on the map. */
  readonly threatsMax: number;
  /** Strength rises by 1 per this many active players beyond the first… */
  readonly threatStrengthPlayers: number;
  /** …and by 1 per this many days after the first. */
  readonly threatStrengthDays: number;
  /** A `path` threat appears this far ahead of the creature's centre. */
  readonly threatPathDistance: number;
  /** Actions a character struck by a threat starts the next day with. */
  readonly struckActions: number;
  /** Stances (docs/design/stances.md): actions one hex explored by a watcher costs. */
  readonly stanceWatchCost: number;
  /** Extra strike power a character lying in wait adds per unspent action (on top of the base power). */
  readonly stanceAmbushPerAction: number;
  /** Unspent actions that make one point of defence for a rider helping aboard. */
  readonly stanceHelpActionsPerGuard: number;
  /** The most defence all riders helping aboard add together (it is a help, not a wall). */
  readonly stanceHelpGuardMax: number;

  // Guardian.
  readonly strikeCost: number;
  /** Strength a strike takes off a threat, for a role tagged `defend` and for anyone else. */
  readonly clearPowerGuardian: number;
  readonly clearPowerOther: number;
  readonly defendCost: number;
  /** Each strike on the creature is reduced by this per defending guardian still riding. */
  readonly defendReduction: number;

  // Envoy and the peoples.
  readonly parleyCost: number;
  readonly offerCost: number;
  readonly askBoonCost: number;
  /** Favour a parley gains, for a role tagged `peoples` and for anyone else. */
  readonly parleyFavourEnvoy: number;
  readonly parleyFavourOther: number;
  /** Chance a parley by anyone but an envoy angers the settlement instead. */
  readonly parleyAngerChanceOther: number;
  readonly offerFavour: number;
  /** Ticks after a mislead during which no pursuer appears. */
  readonly misleadDays: number;
  /** Peril a shelter takes off. */
  readonly shelterPeril: number;
  /** A settlement appears when the creature's steps reach this, then every `settlementEvery` steps. */
  readonly settlementFirst: number;
  readonly settlementEvery: number;

  // Peril and the ending.
  /** Peril at which the season is lost. */
  readonly perilMax: number;
  /** Home with peril at or above this is home wounded. */
  readonly perilWoundedAt: number;
  /** Peril added at a tick that ends with the creature underfed at `perilHungryLevel` or more. */
  readonly perilHungry: number;
  readonly perilHungryLevel: number;
  /** Peril lost at a tick where it did not rise. */
  readonly perilCalm: number;
  /** The season's length in creature steps. */
  readonly routeLength: number;

  // Skills (docs/design/skill-trees.md).
  /** XP that makes one pick (own tree, or another role's tier 1). */
  readonly xpPerPick: number;
  /** Each time the creature's steps reach a multiple of this, every active character gets `catchUpXp` XP. */
  readonly catchUpEverySteps: number;
  readonly catchUpXp: number;
}

export const DEFAULT_CONFIG: TuningConfig = {
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
  stanceWatchCost: 1,
  stanceAmbushPerAction: 1,
  stanceHelpActionsPerGuard: 3,
  stanceHelpGuardMax: 2,
  strikeCost: 1,
  clearPowerGuardian: 2,
  clearPowerOther: 1,
  defendCost: 1,
  defendReduction: 2,
  parleyCost: 1,
  offerCost: 1,
  askBoonCost: 1,
  parleyFavourEnvoy: 2,
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
};

export type ConfigOverrides = Partial<Omit<TuningConfig, 'veerWeights' | 'hungryVeerWeights'>> & {
  readonly veerWeights?: Partial<VeerWeights>;
  readonly hungryVeerWeights?: Partial<VeerWeights>;
};

/** Weights the creature can step with: finite, not negative, at least one above zero. */
const validWeights = (w: VeerWeights): boolean => {
  const weights = [w.left, w.straight, w.right];
  return weights.every((x) => Number.isFinite(x) && x >= 0) && weights.some((x) => x > 0);
};

const isCount = (n: number, min: number): boolean => Number.isInteger(n) && n >= min;

/** Merges overrides onto the defaults and rejects values the rules cannot use. */
export const resolveConfig = (overrides: ConfigOverrides = {}): TuningConfig => {
  const config: TuningConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    veerWeights: { ...DEFAULT_CONFIG.veerWeights, ...overrides.veerWeights },
    hungryVeerWeights: { ...DEFAULT_CONFIG.hungryVeerWeights, ...overrides.hungryVeerWeights },
  };
  const problems: string[] = [];
  if (!isCount(config.actionsPerDay, 0)) problems.push('actionsPerDay');
  if (!isCount(config.moveCost, 1)) problems.push('moveCost');
  if (!isCount(config.creatureRadius, 0)) problems.push('creatureRadius');
  if (!isCount(config.windowRadius, config.creatureRadius + 1)) problems.push('windowRadius');
  if (!isCount(config.graceDays, 0)) problems.push('graceDays');
  if (!isCount(config.lostTileRings, 0)) problems.push('lostTileRings');
  if (!isCount(config.playerCap, 1)) problems.push('playerCap');
  const chances = [
    'featureChance',
    'siteChanceSpecialistTier1',
    'siteChanceSpecialistTier2',
    'siteChanceOtherTier1',
    'siteChanceOtherTier2',
    'threatChanceBase',
    'threatChancePerPlayer',
    'threatChancePerDay',
    'threatChanceMax',
    'parleyAngerChanceOther',
  ] as const;
  for (const key of chances) {
    const p = config[key];
    if (!(Number.isFinite(p) && p >= 0 && p <= 1)) problems.push(key);
  }
  const costs = [
    'packCapacity',
    'surveyCostSpecialist',
    'surveyCostOther',
    'gatherCost',
    'workSiteCost',
    'buildCost',
    'buildWork',
    'xpPerPick',
    'catchUpEverySteps',
    'catchUpXp',
    'lightFireCost',
    'feedCost',
    'lingerCost',
    'strikeCost',
    'defendCost',
    'stanceWatchCost',
    'stanceHelpActionsPerGuard',
    'parleyCost',
    'offerCost',
    'askBoonCost',
    'threatStrengthPlayers',
    'threatStrengthDays',
    'settlementFirst',
    'settlementEvery',
    'routeLength',
    'perilMax',
  ] as const;
  for (const key of costs) if (!isCount(config[key], 1)) problems.push(key);
  const counts = [
    'threatsFromDay',
    'threatsMax',
    'struckActions',
    'stanceAmbushPerAction',
    'stanceHelpGuardMax',
    'clearPowerGuardian',
    'clearPowerOther',
    'defendReduction',
    'parleyFavourEnvoy',
    'parleyFavourOther',
    'offerFavour',
    'misleadDays',
    'shelterPeril',
    'perilHungry',
    'perilCalm',
  ] as const;
  for (const key of counts) if (!isCount(config[key], 0)) problems.push(key);
  // A path threat appears beyond contact (next to the footprint) and inside the window.
  const path = config.threatPathDistance;
  if (!(isCount(path, config.creatureRadius + 2) && path <= config.windowRadius)) {
    problems.push('threatPathDistance');
  }
  if (!(isCount(config.perilWoundedAt, 1) && config.perilWoundedAt < config.perilMax)) {
    problems.push('perilWoundedAt');
  }
  if (!(isCount(config.perilHungryLevel, 1) && config.perilHungryLevel <= 3)) {
    problems.push('perilHungryLevel');
  }
  if (!validWeights(config.veerWeights)) problems.push('veerWeights');
  if (!validWeights(config.hungryVeerWeights)) problems.push('hungryVeerWeights');
  if (!isCount(config.stimulusRange, 0)) problems.push('stimulusRange');
  if (!(Number.isFinite(config.stimulusPull) && config.stimulusPull >= 1)) {
    problems.push('stimulusPull');
  }
  if (problems.length > 0) throw new RangeError(`Invalid tuning config: ${problems.join(', ')}`);
  return config;
};
