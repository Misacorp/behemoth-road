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
  const w = config.veerWeights;
  const weights = [w.left, w.straight, w.right];
  if (weights.some((x) => !(Number.isFinite(x) && x >= 0)) || !weights.some((x) => x > 0)) {
    problems.push('veerWeights');
  }
  if (problems.length > 0) throw new RangeError(`Invalid tuning config: ${problems.join(', ')}`);
  return config;
};
