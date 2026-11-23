/**
 * The creature: a footprint that steps one hex per day, straight ahead or one
 * sixth of a turn to either side of its general heading, never back.
 * It ignores terrain for now. Fires within range steer the step sideways by the
 * creature's hidden reaction to them (never straight on or back), and hunger changes how it walks: that
 * part is server only (`stepWeights`); the public prediction uses the base weights.
 */

import { appetiteOf, reactionTo, stimulusType } from './care.ts';
import type { VeerWeights } from './config.ts';
import {
  type Direction,
  directionOffset,
  hexDistance,
  neighbour,
  rotate,
  type Hex,
} from './hex.ts';
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

/** A hex offset as flat-top plane coordinates (x east, y south), for telling sides apart. */
const plane = (h: Hex): readonly [number, number] => [1.5 * h.q, Math.sqrt(3) * (h.r + h.q / 2)];

/**
 * Which side of the creature's heading a hex lies on: 1 left (anticlockwise), -1
 * right, 0 straight ahead or straight behind (on the heading's line), and for the
 * creature's own centre. Fires on the line push neither way.
 */
export const sideOf = (state: GameStateView, target: Hex): -1 | 0 | 1 => {
  const { heading, centre } = state.creature;
  const [tx, ty] = plane({ q: target.q - centre.q, r: target.r - centre.r });
  const [lx, ly] = plane(directionOffset(rotate(heading, -1)));
  const [rx, ry] = plane(directionOffset(rotate(heading, 1)));
  const lean = tx * (lx - rx) + ty * (ly - ry);
  return Math.abs(lean) < 1e-9 ? 0 : lean > 0 ? 1 : -1;
};

/**
 * The sideways push of the stimuli in range, server only: each one within
 * `stimulusRange` of the centre adds its type's `push` toward its side if the
 * creature is attracted, away from it if repelled, nothing if indifferent or if
 * it lies on the heading's line. Positive is left, negative right; pushes on
 * opposite sides cancel, and a tie of zero leaves the step alone.
 */
export const stimulusPush = (state: GameState): number => {
  let push = 0;
  for (const s of state.stimuli) {
    if (hexDistance(state.creature.centre, s.hex) > state.config.stimulusRange) continue;
    const reaction = reactionTo(state.nature, s);
    const sign = reaction === 'attracted' ? 1 : reaction === 'repelled' ? -1 : 0;
    push += sign * sideOf(state, s.hex) * stimulusType(s.type).push;
  }
  return push;
};

/**
 * The real weights of the three step options (left, straight, right), server
 * only. Base: the veer weights, or the hungry ones while underfed. Fires only
 * steer sideways: with a net push of n (see `stimulusPush`), the left weight is
 * multiplied by the pull to the power of n and the right weight by the pull to
 * the power of minus n; straight is unchanged, and the creature never turns
 * back. An overfed creature feels a weaker pull: `1 + (pull - 1) / (level + 1)`.
 */
export const stepWeights = (state: GameState): VeerWeights => {
  const { config } = state;
  const appetite = appetiteOf(state);
  const base = appetite?.kind === 'underfed' ? config.hungryVeerWeights : config.veerWeights;
  const pull =
    appetite?.kind === 'overfed'
      ? 1 + (config.stimulusPull - 1) / (appetite.level + 1)
      : config.stimulusPull;
  const push = stimulusPush(state);
  return {
    left: base.left * pull ** push,
    straight: base.straight,
    right: base.right * pull ** -push,
  };
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
