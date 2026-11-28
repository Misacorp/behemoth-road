/**
 * What taken skills do by themselves at the day tick, before the creature steps: a drone gathers
 * beside the creature, self-winding gives the unlock in progress a little work, a standing guard
 * defends. None costs an action, so each is held below what the same character could do by hand
 * (docs/design/skill-trees.md). Skills are read by effect, never by id. Server only where it needs
 * the hidden features. A sweep is the exception: it runs after the creature's step and the window
 * update (`applySweep`), so a scout starts the next day with their surroundings explored, including
 * hexes that only came into view tonight.
 */

import { cartSpot, finishUnlock, isVehicleUnlock } from './cart.ts';
import { UNLOCKS } from './content/index.ts';
import { addMaterials, exploreHex, featureType, type GameEvent, keyToHex } from './features.ts';
import { hexDistance, hexKey, neighbours } from './hex.ts';
import { bestOf, effectsOf } from './skills.ts';
import type { Character, GameState, GameStateView } from './state.ts';
import { isCreatureHex, isReachable } from './window.ts';

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

  // Auto-defend: a rider with an unspent action defends the creature, spending it (as a hand defend
  // would: never more than the action).
  const guards = active(state)
    .filter(
      (c) =>
        c.at.kind === 'creature' &&
        c.actionsLeft >= state.config.defendCost &&
        effectsOf(c, 'defend-tick').length > 0,
    )
    .map((c) => c.id)
    .filter((id) => !state.creature.defenders.includes(id));
  if (guards.length > 0) {
    state = {
      ...state,
      creature: { ...state.creature, defenders: [...state.creature.defenders, ...guards] },
      characters: state.characters.map((c) =>
        guards.includes(c.id) ? { ...c, actionsLeft: c.actionsLeft - state.config.defendCost } : c,
      ),
    };
    for (const characterId of guards) events.push({ kind: 'defend', characterId });
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
    const taken = Math.min(amount, spot.f.left);
    state = {
      ...state,
      features: { ...state.features, [spot.key]: { ...spot.f, left: spot.f.left - taken } },
      stores: addMaterials(state.stores, { [material]: taken }),
    };
    events.push({ kind: 'gather', hex: spot.at, characterId: c.id, material, amount: taken });
  }

  // Self-winding: the unlock in progress gains work by itself (the best such skill, once).
  const wind = Math.max(
    0,
    ...active(state).flatMap((c) => effectsOf(c, 'build-tick').map((e) => e.amount)),
  );
  const project = state.project;
  const unlock = project ? UNLOCKS.find((u) => u.id === project.unlock) : undefined;
  if (wind > 0 && project && unlock) {
    // A cart with no room to put it waits one work short rather than vanishing with its materials.
    const roomless = isVehicleUnlock(unlock) && cartSpot(state, state.creature.centre) === null;
    const work = Math.min(project.work + wind, roomless ? unlock.work - 1 : Infinity);
    const finished = work >= unlock.work;
    state = { ...state, project: finished ? null : { unlock: unlock.id, work } };
    events.push({ kind: 'unlock-progress', unlock: unlock.id, work, needed: unlock.work });
    if (finished) {
      const built = finishUnlock(state, unlock, state.creature.centre, null);
      state = built.state;
      events.push(...built.events);
    }
  }
  return { state, events };
};

/**
 * End-of-day sweep, run after the creature's step and the window update: up to `count` unexplored hexes
 * in view next to each scout with the skill are explored for everyone (no XP: it is not an action).
 */
export const applySweep = (
  before: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } => {
  let state = before;
  const events: GameEvent[] = [];
  for (const c of active(state)) {
    const count = bestOf(c, 'sweep', (e) => e.count);
    if (count === null || c.at.kind !== 'hex') continue;
    // Only a scout who stays on the map: not one lost this tick, nor one hauled aboard by the creature.
    if (!isReachable(state, c.at.hex) || isCreatureHex(state, c.at.hex)) continue;
    const around = neighbours(c.at.hex).filter((h) => {
      const tile = state.tiles[hexKey(h)];
      return tile !== undefined && tile.visibility === 'seen' && !tile.explored;
    });
    for (const h of around.slice(0, count)) {
      const shown = exploreHex(state, h);
      state = shown.state;
      events.push(...shown.events);
    }
  }
  return { state, events };
};
