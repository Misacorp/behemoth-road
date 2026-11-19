/**
 * The player view's game part is the core's `GameStateView`: the state without the seed, with terrain on
 * every known tile. Every rule the client runs reads it directly; this checks the parsed shape is the
 * core's type, so a contract change shows up as a type error here.
 */
import type { CreatureSigns, GameStateView as CoreView } from '@behemoth-road/core';
import type { GameStateView, Signs } from '../api/schema.ts';

export const toGameState = (view: GameStateView): CoreView => view;

/** The parsed signs are the core's `CreatureSigns` (what the signed-in player reads off the creature). */
export const toSigns = (signs: Signs): CreatureSigns => signs;
