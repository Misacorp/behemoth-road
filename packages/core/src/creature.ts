/**
 * The creature: a footprint that steps one hex per day, straight ahead or one
 * sixth of a turn to either side of its general heading, never back.
 * It ignores terrain for now.
 */

import { type Direction, neighbour, rotate, type Hex } from './hex.ts';
import { hashString, hashToUnit, pickWeighted } from './random.ts';
import type { GameState } from './state.ts';

const STEP_STREAM = hashString('creature-step');

export interface CreatureStepOption {
  readonly direction: Direction;
  readonly centre: Hex;
  /** Chance of this step, 0 to 1; the options' chances add up to 1. */
  readonly chance: number;
}

/** The possible next centres of the creature, with their chances. Zero-chance steps are left out. */
export const predictCreature = (state: GameState): CreatureStepOption[] => {
  const { heading, centre } = state.creature;
  const w = state.config.veerWeights;
  const options = [
    { direction: rotate(heading, -1), weight: w.left },
    { direction: heading, weight: w.straight },
    { direction: rotate(heading, 1), weight: w.right },
  ].filter((o) => o.weight > 0);
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  return options.map((o) => ({
    direction: o.direction,
    centre: neighbour(centre, o.direction),
    chance: o.weight / total,
  }));
};

/** The step the creature takes at the end of the current day: a pure function of seed and day. */
export const chooseCreatureStep = (state: GameState): CreatureStepOption =>
  pickWeighted(
    predictCreature(state),
    (o) => o.chance,
    hashToUnit(state.seed, STEP_STREAM, state.day),
  );
