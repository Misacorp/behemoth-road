/**
 * Actions beyond moving: survey an adjacent hex, gather at a node, work a site,
 * build an unlock. Roles are read by their tags: `survey` (surveys for less),
 * `sites` (better chances, tier 2), `build` (works on unlocks). Every number is
 * in the tuning config or content.
 */

import { UNLOCKS, type SiteType, type Unlock } from './content/index.ts';
import { activeCharacter, isPlaceReachable } from './actions.ts';
import {
  addMaterials,
  exploreHex,
  featureType,
  type GameEvent,
  isExplored,
  packSize,
  roleHas,
  unlockTags,
} from './features.ts';
import { type Hex, hexKey, isValidHex } from './hex.ts';
import { arePlacesAdjacent, onHex, placeNeighbours } from './places.ts';
import { hashString, hashToUnit } from './random.ts';
import {
  type Character,
  type FeatureState,
  type GameState,
  type GameStateView,
  hasSeed,
} from './state.ts';
import { isCreatureHex } from './window.ts';

export type Action =
  | { readonly kind: 'survey'; readonly hex: Hex }
  | { readonly kind: 'gather' }
  | { readonly kind: 'work-site' }
  | { readonly kind: 'build'; readonly unlock: string };

export type ActRefusal =
  | 'invalid-action'
  | 'invalid-hex'
  | 'unknown-character'
  | 'character-lost'
  | 'not-adjacent'
  | 'unreachable'
  | 'already-explored'
  | 'not-on-hex'
  | 'nothing-here'
  | 'depleted'
  | 'pack-full'
  | 'not-enough-actions'
  | 'cannot-work'
  | 'needs-unlock'
  | 'needs-specialist'
  | 'not-riding'
  | 'unknown-unlock'
  | 'already-have'
  | 'busy'
  | 'missing-materials';

/** What an action would cost, or why it cannot be done now. */
export type ActCheck =
  | {
      readonly ok: true;
      /** Actions it costs. */
      readonly cost: number;
      /** Materials taken from the stores (starting an unlock). */
      readonly uses: readonly { readonly material: string; readonly amount: number }[];
      /** The published chance of success (working a site); 1 for everything else. */
      readonly chance: number;
    }
  | { readonly ok: false; readonly reason: ActRefusal };

export type ActResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly reason: ActRefusal };

const SITE_STREAM = hashString('site');

const hexOf = (c: Character): Hex | null => (c.at.kind === 'hex' ? c.at.hex : null);

const siteChance = (state: GameStateView, c: Character, site: SiteType): number => {
  const { config } = state;
  const specialist = roleHas(c, 'sites');
  if (site.tier === 1) {
    return specialist ? config.siteChanceSpecialistTier1 : config.siteChanceOtherTier1;
  }
  return specialist ? config.siteChanceSpecialistTier2 : config.siteChanceOtherTier2;
};

/** The revealed feature where the character stands, if any. */
const featureHere = (state: GameStateView, c: Character): FeatureState | null => {
  const h = hexOf(c);
  if (!h) return null;
  const f = state.features[hexKey(h)];
  return f?.revealed ? f : null;
};

const free = (state: GameStateView, c: Character): number =>
  state.config.packCapacity - packSize(c.pack);

type Uses = readonly { readonly material: string; readonly amount: number }[];

const done = (cost: number, uses: Uses = []): ActCheck => ({
  ok: true,
  cost,
  uses,
  chance: 1,
});

/**
 * Whether a character can do an action now, and what it costs. Works on a player
 * view, so the interface can show what is possible; `act` applies it on the server.
 */
export const checkAction = (
  state: GameStateView,
  characterId: string,
  action: Action,
): ActCheck => {
  const found = activeCharacter(state, characterId);
  if (!found.ok) return found;
  const c = found.character;
  const { config } = state;
  const enough = (cost: number) => c.actionsLeft >= cost;

  switch (action?.kind) {
    case 'survey': {
      const target = action.hex;
      if (!isValidHex(target)) return { ok: false, reason: 'invalid-hex' };
      if (isCreatureHex(state, target)) return { ok: false, reason: 'not-adjacent' };
      if (!arePlacesAdjacent(state, c.at, onHex(target)))
        return { ok: false, reason: 'not-adjacent' };
      if (!isPlaceReachable(state, onHex(target))) return { ok: false, reason: 'unreachable' };
      if (isExplored(state, target)) return { ok: false, reason: 'already-explored' };
      const cost = roleHas(c, 'survey') ? config.surveyCostSpecialist : config.surveyCostOther;
      return enough(cost) ? done(cost) : { ok: false, reason: 'not-enough-actions' };
    }
    case 'gather': {
      if (!hexOf(c)) return { ok: false, reason: 'not-on-hex' };
      const f = featureHere(state, c);
      const type = f ? featureType(f.type) : null;
      if (!f || type?.kind !== 'node') return { ok: false, reason: 'nothing-here' };
      if (f.left <= 0) return { ok: false, reason: 'depleted' };
      if (free(state, c) < type.yields.amount) return { ok: false, reason: 'pack-full' };
      return enough(config.gatherCost)
        ? done(config.gatherCost)
        : { ok: false, reason: 'not-enough-actions' };
    }
    case 'work-site': {
      if (!hexOf(c)) return { ok: false, reason: 'not-on-hex' };
      const f = featureHere(state, c);
      const type = f ? featureType(f.type) : null;
      if (!f || type?.kind !== 'site') return { ok: false, reason: 'nothing-here' };
      if (f.left <= 0) return { ok: false, reason: 'depleted' };
      // Whether this character could ever work it comes before what the team lacks.
      const chance = siteChance(state, c, type);
      if (chance <= 0) return { ok: false, reason: 'cannot-work' };
      const tags = unlockTags(state);
      if (!type.needs.every((tag) => tags.has(tag))) return { ok: false, reason: 'needs-unlock' };
      if (free(state, c) < type.finds.amount) return { ok: false, reason: 'pack-full' };
      if (!enough(config.workSiteCost)) return { ok: false, reason: 'not-enough-actions' };
      return { ok: true, cost: config.workSiteCost, uses: [], chance };
    }
    case 'build': {
      const unlock = UNLOCKS.find((u) => u.id === action.unlock);
      if (!unlock) return { ok: false, reason: 'unknown-unlock' };
      if (!roleHas(c, 'build')) return { ok: false, reason: 'needs-specialist' };
      if (c.at.kind !== 'creature') return { ok: false, reason: 'not-riding' };
      if (state.unlocks.includes(unlock.id)) return { ok: false, reason: 'already-have' };
      const project = state.project;
      if (project && project.unlock !== unlock.id) return { ok: false, reason: 'busy' };
      const uses = project ? [] : unlock.cost;
      if (uses.some((u) => (state.stores[u.material] ?? 0) < u.amount)) {
        return { ok: false, reason: 'missing-materials' };
      }
      return enough(config.buildCost)
        ? done(config.buildCost, uses)
        : { ok: false, reason: 'not-enough-actions' };
    }
    default:
      return { ok: false, reason: 'invalid-action' };
  }
};

/**
 * Does an action for a character (server only: working a site rolls from the
 * seed, the day, the character and the site, so the outcome is fair and
 * repeatable but unknown in advance; a retry by the same character on the same
 * day rolls the same).
 */
export const act = (state: GameState, characterId: string, action: Action): ActResult => {
  if (!hasSeed(state)) throw new TypeError('Acting needs the seed: server only');
  const check = checkAction(state, characterId, action);
  if (!check.ok) return check;
  const c = state.characters.find((x) => x.id === characterId) as Character;
  const withCharacter = (s: GameState, change: Partial<Character>): GameState => ({
    ...s,
    characters: s.characters.map((x) =>
      x.id === characterId ? { ...x, actionsLeft: x.actionsLeft - check.cost, ...change } : x,
    ),
  });

  if (action.kind === 'survey') {
    // Surveying explores from outside: a trap there is revealed and harmless.
    const explored = exploreHex(state, action.hex);
    return {
      ok: true,
      state: withCharacter(explored.state, {}),
      events: [{ kind: 'survey', hex: action.hex, characterId }, ...explored.events],
    };
  }

  if (action.kind === 'build') {
    const unlock = UNLOCKS.find((u) => u.id === action.unlock) as Unlock;
    const subtracted: Record<string, number> = { ...state.stores };
    for (const u of check.uses) subtracted[u.material] = (subtracted[u.material] ?? 0) - u.amount;
    const work = (state.project?.work ?? 0) + 1;
    const finished = work >= unlock.work;
    const next: GameState = {
      ...state,
      stores: subtracted,
      project: finished ? null : { unlock: unlock.id, work },
      unlocks: finished ? [...state.unlocks, unlock.id] : state.unlocks,
    };
    const events: GameEvent[] = [
      { kind: 'unlock-progress', unlock: unlock.id, work, needed: unlock.work },
    ];
    if (finished) events.push({ kind: 'unlock-done', unlock: unlock.id });
    return { ok: true, state: withCharacter(next, {}), events };
  }

  const h = hexOf(c) as Hex;
  const key = hexKey(h);
  const f = state.features[key] as FeatureState;
  const type = featureType(f.type);

  if (action.kind === 'gather' && type.kind === 'node') {
    const { material, amount } = type.yields;
    return {
      ok: true,
      state: withCharacter(
        { ...state, features: { ...state.features, [key]: { ...f, left: f.left - 1 } } },
        { pack: addMaterials(c.pack, { [material]: amount }) },
      ),
      events: [{ kind: 'gather', hex: h, characterId, material, amount }],
    };
  }

  if (action.kind === 'work-site' && type.kind === 'site') {
    const roll = hashToUnit(state.seed, SITE_STREAM, state.day, hashString(c.id), h.q, h.r);
    if (roll >= check.chance) {
      return {
        ok: true,
        state: withCharacter(state, {}),
        events: [{ kind: 'site-failed', hex: h, characterId }],
      };
    }
    const { material, amount } = type.finds;
    return {
      ok: true,
      state: withCharacter(
        { ...state, features: { ...state.features, [key]: { ...f, left: 0 } } },
        { pack: addMaterials(c.pack, { [material]: amount }) },
      ),
      events: [{ kind: 'find', hex: h, characterId, material, amount }],
    };
  }
  return { ok: false, reason: 'invalid-action' };
};

/**
 * Every action a character could take now, with its check, for the interface:
 * surveying each adjacent unexplored hex, gathering and working a site here, and
 * building each unlock. Runs on a view.
 */
export const actionsHere = (
  state: GameStateView,
  characterId: string,
): { readonly action: Action; readonly check: ActCheck }[] => {
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) return [];
  const surveys: Action[] = placeNeighbours(state, c.at).flatMap((p) =>
    p.kind === 'hex' && state.tiles[hexKey(p.hex)] && !isExplored(state, p.hex)
      ? [{ kind: 'survey' as const, hex: p.hex }]
      : [],
  );
  const options: Action[] = [
    ...surveys,
    { kind: 'gather' },
    { kind: 'work-site' },
    ...UNLOCKS.map((u) => ({ kind: 'build' as const, unlock: u.id })),
  ];
  return options.map((action) => ({ action, check: checkAction(state, characterId, action) }));
};

/** The same list as `actionsHere`. */
export const possibleActions = actionsHere;
