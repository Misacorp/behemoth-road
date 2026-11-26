/**
 * Fires: how long a stimulus burns, and the ring around a burning fire that threats tagged `fears-fire`
 * keep out of. Read by tag (`fire`), never by id. Reads the public view only.
 */

import { STIMULUS_TYPES } from './content/index.ts';
import { type Hex, hexDistance } from './hex.ts';
import type { GameStateView, Stimulus } from './state.ts';

/** The stimulus tag of fires (a lit brazier or a burning feature). */
export const FIRE_TAG = 'fire';
/** The threat tag of threats that keep clear of burning fires. */
export const FEARS_FIRE_TAG = 'fears-fire';

/** The feature tag of a place that takes fire (a brazier): lit with the fuel, burns for nights. */
export const FIRE_SITE_TAG = 'fire-site';
/** The feature tag of something a fire burns away for good. */
export const BURNABLE_TAG = 'burnable';

const tagsOf = (s: Stimulus): readonly string[] =>
  STIMULUS_TYPES.find((t) => t.id === s.type)?.tags ?? [];

/** Nights a stimulus burns in all, from the day it was lit. */
export const nightsOf = (s: Stimulus): number =>
  s.nights ?? STIMULUS_TYPES.find((t) => t.id === s.type)?.lastsTicks ?? 1;

/** Ticks it still acts on, counting the next one (at least 1 for any stimulus in the state). */
export const nightsLeft = (state: GameStateView, s: Stimulus): number =>
  s.litDay + nightsOf(s) - state.day;

/** The fires still burning `ahead` ticks from now (1: at the next tick). */
export const firesBurning = (state: GameStateView, ahead = 1): Stimulus[] =>
  state.stimuli.filter((s) => tagsOf(s).includes(FIRE_TAG) && nightsLeft(state, s) >= ahead);

/** Whether a hex lies within the fear radius of a fire burning `ahead` ticks from now. */
export const inFireRing = (state: GameStateView, h: Hex, ahead = 1): boolean =>
  firesBurning(state, ahead).some((s) => hexDistance(s.hex, h) <= state.config.fireFearRadius);
