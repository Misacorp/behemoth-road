/**
 * The creature: a footprint that steps one hex per day, straight ahead or one
 * sixth of a turn to either side of its general heading, never back.
 * It ignores terrain for now. Fires within range sway the step by the
 * creature's hidden reaction to them, and hunger changes how it walks: that
 * part is server only (`stepWeights`); the public prediction uses the base weights.
 */

import { appetiteOf, reactionTo } from './care.ts';
import type { VeerWeights } from './config.ts';
import { type Direction, hexDistance, neighbour, rotate, type Hex } from './hex.ts';
import { hashString, hashToUnit, pickWeighted } from './random.ts';
import { type GameState, type GameStateView, hasSeed } from './state.ts';

const STEP_STREAM = hashString('creature-step');

export interface CreatureStepOption {
  readonly direction: Direction;
  readonly centre: Hex;
  /** Chance of this step, 0 to 1; the options' chances add up to 1. */
  readonly chance: number;
  /**
   * Set when the creature lingers: the only option, it stays where it is
   * (`centre` is its current centre, `direction` its heading).
   */
  readonly stay?: true;
}

/** The three step options, left to right, with a weight each. */
const optionsWith = (state: GameStateView, w: VeerWeights) => {
  const { heading, centre } = state.creature;
  return [
    { direction: rotate(heading, -1), weight: w.left },
    { direction: heading, weight: w.straight },
    { direction: rotate(heading, 1), weight: w.right },
  ].map((o) => ({ ...o, centre: neighbour(centre, o.direction) }));
};

const toChances = (
  options: readonly { direction: Direction; centre: Hex; weight: number }[],
): CreatureStepOption[] => {
  const kept = options.filter((o) => o.weight > 0);
  const total = kept.reduce((sum, o) => sum + o.weight, 0);
  return kept.map((o) => ({ direction: o.direction, centre: o.centre, chance: o.weight / total }));
};

const stayOption = (state: GameStateView): CreatureStepOption[] => [
  { direction: state.creature.heading, centre: state.creature.centre, chance: 1, stay: true },
];

/**
 * The possible next centres of the creature, with their chances, from the base
 * weights only (no stimuli, no hunger), so it reveals nothing hidden. Zero-chance
 * steps are left out. A lingering creature has one option: it stays.
 */
export const predictCreature = (state: GameStateView): CreatureStepOption[] =>
  state.creature.lingering
    ? stayOption(state)
    : toChances(optionsWith(state, state.config.veerWeights));

/**
 * The real weights of the three step options (left, straight, right), server
 * only. Base: the veer weights, or the hungry ones while underfed. Each stimulus
 * within `stimulusRange` of the centre scores each option +1 if it ends closer,
 * −1 if farther; the weight is multiplied by the pull to the power of the summed
 * score (attracted), of minus it (repelled), or left alone (indifferent). An
 * overfed creature feels a weaker pull: `1 + (pull − 1) / (level + 1)`.
 */
export const stepWeights = (state: GameState): VeerWeights => {
  const { config, creature } = state;
  const appetite = appetiteOf(state);
  const base = appetite?.kind === 'underfed' ? config.hungryVeerWeights : config.veerWeights;
  const pull =
    appetite?.kind === 'overfed'
      ? 1 + (config.stimulusPull - 1) / (appetite.level + 1)
      : config.stimulusPull;
  const options = optionsWith(state, base);
  const scores = options.map(() => 0);
  for (const s of state.stimuli) {
    const from = hexDistance(creature.centre, s.hex);
    if (from > config.stimulusRange) continue;
    const reaction = reactionTo(state.nature, s);
    const sign = reaction === 'attracted' ? 1 : reaction === 'repelled' ? -1 : 0;
    options.forEach((o, i) => {
      const to = hexDistance(o.centre, s.hex);
      scores[i] = (scores[i] ?? 0) + sign * Math.sign(from - to);
    });
  }
  const [left, straight, right] = options.map((o, i) => o.weight * pull ** (scores[i] ?? 0)) as [
    number,
    number,
    number,
  ];
  return { left, straight, right };
};

/**
 * The step the creature takes at the end of the current day: a pure function of
 * the seed, the day and the state (stimuli, hunger, lingering). Server only.
 */
export const chooseCreatureStep = (state: GameState): CreatureStepOption => {
  if (!hasSeed(state)) throw new TypeError('The creature step needs the seed: server only');
  if (state.creature.lingering) return stayOption(state)[0] as CreatureStepOption;
  return pickWeighted(
    toChances(optionsWith(state, stepWeights(state))),
    (o) => o.chance,
    hashToUnit(state.seed, STEP_STREAM, state.day),
  );
};
