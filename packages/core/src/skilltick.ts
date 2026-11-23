/**
 * What taken skills do by themselves at the day tick, before the creature steps: a sweep explores
 * the hexes next to a scout, a drone gathers beside the creature, self-winding gives the unlock in
 * progress a little work, a standing guard defends. None costs an action, so each is held below what
 * the same character could do by hand (docs/design/skill-trees.md). Skills are read by effect, never
 * by id. Server only where it needs the hidden features.
 */

import { UNLOCKS } from './content/index.ts';
import { addMaterials, exploreHex, featureType, type GameEvent, keyToHex } from './features.ts';
import { hexDistance, hexKey, neighbours } from './hex.ts';
import { bestOf, effectsOf } from './skills.ts';
import type { Character, GameState, GameStateView } from './state.ts';

/** Days between hunger drains the team's best hunger skill sets (1 when none). */
export const hungerEveryDays = (state: GameStateView): number =>
  Math.max(
    1,
    ...state.characters
      .filter((c) => c.status === 'active')
      .flatMap((c) => effectsOf(c, 'hunger-slow').map((e) => e.everyDays)),
  );

const active = (state: GameState): Character[] =>
  state.characters.filter((c) => c.status === 'active');

export const applySkillTicks = (
  before: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } => {
  let state = before;
  const events: GameEvent[] = [];

  // Standing guard: a rider defends the creature without spending an action.
  const guards = active(state)
    .filter((c) => c.at.kind === 'creature' && effectsOf(c, 'defend-tick').length > 0)
    .map((c) => c.id)
    .filter((id) => !state.creature.defenders.includes(id));
  if (guards.length > 0) {
    state = {
      ...state,
      creature: { ...state.creature, defenders: [...state.creature.defenders, ...guards] },
    };
    for (const characterId of guards) events.push({ kind: 'defend', characterId });
  }

  // Sweep: hexes next to a scout are explored for everyone (no XP: it is not an action).
  for (const c of active(state)) {
    const count = bestOf(c, 'sweep', (e) => e.count);
    if (count === null || c.at.kind !== 'hex') continue;
    const around = neighbours(c.at.hex).filter((h) => {
      const tile = state.tiles[hexKey(h)];
      return tile !== undefined && !tile.explored;
    });
    for (const h of around.slice(0, count)) {
      const shown = exploreHex(state, h);
      state = shown.state;
      events.push(...shown.events);
    }
  }

  // Monkey drone: one unit a day from a revealed node beside the creature into the stores.
  for (const c of active(state)) {
    const amount = bestOf(c, 'drone', (e) => e.amount);
    if (amount === null) continue;
    const reach = state.config.creatureRadius + 1;
    const spot = Object.entries(state.features)
      .flatMap(([key, f]) => {
        const type = featureType(f.type);
        const at = keyToHex(key);
        return f.revealed &&
          f.left > 0 &&
          type.kind === 'node' &&
          hexDistance(at, state.creature.centre) <= reach
          ? [{ key, f, at, type }]
          : [];
      })
      .sort((a, b) => (a.key < b.key ? -1 : 1))[0];
    if (!spot) continue;
    const { material } = spot.type.yields;
    state = {
      ...state,
      features: { ...state.features, [spot.key]: { ...spot.f, left: spot.f.left - 1 } },
      stores: addMaterials(state.stores, { [material]: amount }),
    };
    events.push({ kind: 'gather', hex: spot.at, characterId: c.id, material, amount });
  }

  // Self-winding: the unlock in progress gains work by itself (the best such skill, once).
  const wind = Math.max(
    0,
    ...active(state).flatMap((c) => effectsOf(c, 'build-tick').map((e) => e.amount)),
  );
  const project = state.project;
  const unlock = project ? UNLOCKS.find((u) => u.id === project.unlock) : undefined;
  if (wind > 0 && project && unlock) {
    const work = project.work + wind;
    const finished = work >= unlock.work;
    state = {
      ...state,
      project: finished ? null : { unlock: unlock.id, work },
      unlocks: finished ? [...state.unlocks, unlock.id] : state.unlocks,
    };
    events.push({ kind: 'unlock-progress', unlock: unlock.id, work, needed: unlock.work });
    if (finished) events.push({ kind: 'unlock-done', unlock: unlock.id });
  }
  return { state, events };
};
