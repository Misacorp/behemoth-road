/**
 * The hexes a character can survey now, for the survey hints on the map. The core is the judge
 * (`surveyableHexes`): a skill that reaches further (long survey) lights every hex it reaches.
 */
import { type GameStateView, type Hex, surveyableHexes } from '@behemoth-road/core';

/** Every hex the character may survey right now (the core accepts the action). */
export function surveyHexes(state: GameStateView, characterId: string): Hex[] {
  return surveyableHexes(state, characterId);
}
