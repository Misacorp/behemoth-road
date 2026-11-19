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
  /** How far a scout senses hidden features (a glint, not what they are). */
  readonly senseRadius: number;
  /** Action costs. */
  readonly gatherCost: number;
  readonly craftCost: number;
  readonly workSiteCost: number;
  /** Crafts per character per day. */
  readonly craftsPerDay: number;
  /** A gathering specialist (role tag `gather`) multiplies the yield by this. */
  readonly specialistYield: number;
  /** A non-specialist (no role tag `craft`) pays this much more of a tier-1 recipe's first material. */
  readonly nonSpecialistExtraMaterial: number;
  /** Chance to work a site, by tier, for a specialist (role tag `sites`) and for anyone else. */
  readonly siteChanceSpecialistTier1: number;
  readonly siteChanceSpecialistTier2: number;
  readonly siteChanceOtherTier1: number;
  readonly siteChanceOtherTier2: number;
}

export const DEFAULT_CONFIG: TuningConfig = {
  actionsPerDay: 3,
  moveCost: 1,
  creatureRadius: 1,
  windowRadius: 5,
  graceDays: 1,
  lostTileRings: 4,
  playerCap: 15,
  veerWeights: { left: 1, straight: 2, right: 1 },
  featureChance: 0.08,
  senseRadius: 1,
  gatherCost: 1,
  craftCost: 1,
  workSiteCost: 2,
  craftsPerDay: 1,
  specialistYield: 2,
  nonSpecialistExtraMaterial: 1,
  siteChanceSpecialistTier1: 0.7,
  siteChanceSpecialistTier2: 0.5,
  siteChanceOtherTier1: 0.35,
  siteChanceOtherTier2: 0,
};

export type ConfigOverrides = Partial<Omit<TuningConfig, 'veerWeights'>> & {
  readonly veerWeights?: Partial<VeerWeights>;
};

const isCount = (n: number, min: number): boolean => Number.isInteger(n) && n >= min;

/** Merges overrides onto the defaults and rejects values the rules cannot use. */
export const resolveConfig = (overrides: ConfigOverrides = {}): TuningConfig => {
  const config: TuningConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    veerWeights: { ...DEFAULT_CONFIG.veerWeights, ...overrides.veerWeights },
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
  ] as const;
  for (const key of chances) {
    const p = config[key];
    if (!(Number.isFinite(p) && p >= 0 && p <= 1)) problems.push(key);
  }
  if (!isCount(config.senseRadius, 0)) problems.push('senseRadius');
  for (const key of ['gatherCost', 'craftCost', 'workSiteCost', 'specialistYield'] as const) {
    if (!isCount(config[key], 1)) problems.push(key);
  }
  if (!isCount(config.craftsPerDay, 0)) problems.push('craftsPerDay');
  if (!isCount(config.nonSpecialistExtraMaterial, 0)) problems.push('nonSpecialistExtraMaterial');
  const w = config.veerWeights;
  const weights = [w.left, w.straight, w.right];
  if (weights.some((x) => !(Number.isFinite(x) && x >= 0)) || !weights.some((x) => x > 0)) {
    problems.push('veerWeights');
  }
  if (problems.length > 0) throw new RangeError(`Invalid tuning config: ${problems.join(', ')}`);
  return config;
};
