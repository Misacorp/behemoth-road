/**
 * The hexes a character can survey now, for the survey hints on the map. The core is the judge: each
 * candidate goes through `checkAction` for a survey, so a skill that reaches further (long survey) lights
 * every hex it reaches, not only the neighbours. This is the web's fallback for the core's
 * `surveyableHexes(view, characterId)`; swap the body for that call when the core exports it.
 */
import { checkAction, type GameStateView, type Hex, hexesInRange } from '@behemoth-road/core';

/** How far out the search looks: far beyond any survey reach, and cheap (a few hundred checks). */
const SEARCH_RADIUS = 8;

/** Every hex the character may survey right now (the core accepts the action). */
export function surveyHexes(state: GameStateView, characterId: string): Hex[] {
  const me = state.characters.find((c) => c.id === characterId);
  if (me?.status !== 'active') return [];
  const from = me.at.kind === 'hex' ? me.at.hex : state.creature.centre;
  return hexesInRange(from, SEARCH_RADIUS).filter(
    (h) => checkAction(state, characterId, { kind: 'survey', hex: h }).ok,
  );
}
