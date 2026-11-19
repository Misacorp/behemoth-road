/**
 * Actions beyond moving: survey an adjacent hex, gather at a node, work a site,
 * build an unlock. Roles are read by their tags: `survey` (surveys for less),
 * `sites` (better chances, tier 2), `build` (works on unlocks). Every number is
 * in the tuning config or content.
 */

import { MATERIALS, STIMULUS_TYPES, UNLOCKS, type SiteType, type Unlock } from './content/index.ts';
import { creatureType, FOOD_TAG, firstWithTag, isKeeper, nourishment } from './care.ts';
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
import { terrainOf } from './map.ts';
import { arePlacesAdjacent, onHex, placeNeighbours } from './places.ts';
import { hashString, hashToUnit } from './random.ts';
import {
  type Character,
  type FeatureState,
  type GameState,
  type GameStateView,
  hasSeed,
  type Materials,
} from './state.ts';
import { isCreatureHex } from './window.ts';

export type Action =
  | { readonly kind: 'survey'; readonly hex: Hex }
  | { readonly kind: 'gather' }
  | { readonly kind: 'work-site' }
  | { readonly kind: 'build'; readonly unlock: string }
  | { readonly kind: 'light-fire' }
  | { readonly kind: 'feed' }
  | { readonly kind: 'linger' };

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
  | 'missing-materials'
  | 'cannot-burn'
  | 'fire-here'
  | 'no-fuel'
  | 'no-food'
  | 'needs-keeper'
  | 'lingered-yesterday'
  | 'on-creature';

type Uses = readonly { readonly material: string; readonly amount: number }[];

/**
 * What an action would cost, or why it cannot be done now. A refusal still says
 * what the action costs this character (`cost`) wherever that is known, and for
 * an unlock the materials the stores lack (`missing`), so the interface needs no
 * rules or config of its own.
 */
export type ActCheck =
  | {
      readonly ok: true;
      /** Actions it costs. */
      readonly cost: number;
      /** Materials taken from the stores (starting an unlock, feeding) or the pack (fuel). */
      readonly uses: Uses;
      /** The published chance of success (working a site); 1 for everything else. */
      readonly chance: number;
    }
  | {
      readonly ok: false;
      readonly reason: ActRefusal;
      readonly cost?: number;
      readonly missing?: Uses;
    };

export type ActResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly reason: ActRefusal };

const SITE_STREAM = hashString('site');

/** The stimulus a fire is (the one tagged `fire`): content, read by tag. */
const FIRE = STIMULUS_TYPES.find((t) => t.tags.includes('fire'));

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

  switch (action?.kind) {
    case 'survey': {
      const cost = roleHas(c, 'survey') ? config.surveyCostSpecialist : config.surveyCostOther;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      const target = action.hex;
      if (!isValidHex(target)) return no('invalid-hex');
      if (isCreatureHex(state, target)) return no('not-adjacent');
      if (!arePlacesAdjacent(state, c.at, onHex(target))) return no('not-adjacent');
      if (!isPlaceReachable(state, onHex(target))) return no('unreachable');
      if (isExplored(state, target)) return no('already-explored');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'gather': {
      const cost = config.gatherCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (!hexOf(c)) return no('not-on-hex');
      const f = featureHere(state, c);
      const type = f ? featureType(f.type) : null;
      if (!f || type?.kind !== 'node') return no('nothing-here');
      if (f.left <= 0) return no('depleted');
      if (free(state, c) < type.yields.amount) return no('pack-full');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'work-site': {
      const cost = config.workSiteCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (!hexOf(c)) return no('not-on-hex');
      const f = featureHere(state, c);
      const type = f ? featureType(f.type) : null;
      if (!f || type?.kind !== 'site') return no('nothing-here');
      if (f.left <= 0) return no('depleted');
      // Whether this character could ever work it comes before what the team lacks.
      const chance = siteChance(state, c, type);
      if (chance <= 0) return no('cannot-work');
      const tags = unlockTags(state);
      if (!type.needs.every((tag) => tags.has(tag))) return no('needs-unlock');
      if (free(state, c) < type.finds.amount) return no('pack-full');
      if (c.actionsLeft < cost) return no('not-enough-actions');
      return { ok: true, cost, uses: [], chance };
    }
    case 'build': {
      const unlock = UNLOCKS.find((u) => u.id === action.unlock);
      if (!unlock) return { ok: false, reason: 'unknown-unlock' };
      const cost = config.buildCost;
      // Materials are taken only when the work starts.
      const project = state.project;
      const uses = project?.unlock === unlock.id ? [] : unlock.cost;
      const missing = uses.flatMap((u) => {
        const short = u.amount - (state.stores[u.material] ?? 0);
        return short > 0 ? [{ material: u.material, amount: short }] : [];
      });
      const no = (reason: ActRefusal): ActCheck =>
        missing.length > 0 ? { ok: false, reason, cost, missing } : { ok: false, reason, cost };
      if (!roleHas(c, 'build')) return no('needs-specialist');
      if (c.at.kind !== 'creature') return no('not-riding');
      if (state.unlocks.includes(unlock.id)) return { ok: false, reason: 'already-have', cost };
      if (project && project.unlock !== unlock.id) return no('busy');
      if (missing.length > 0) return no('missing-materials');
      return c.actionsLeft >= cost ? done(cost, uses) : no('not-enough-actions');
    }
    case 'light-fire': {
      if (!FIRE) return { ok: false, reason: 'invalid-action' };
      const cost = config.lightFireCost;
      const no = (reason: ActRefusal, missing?: Uses): ActCheck =>
        missing ? { ok: false, reason, cost, missing } : { ok: false, reason, cost };
      const h = hexOf(c);
      if (!h || isCreatureHex(state, h)) return no('on-creature');
      const terrain = terrainOf(state, h);
      if (!terrain || FIRE.notOn.some((tag) => terrain.tags.includes(tag))) {
        return no('cannot-burn');
      }
      if (state.stimuli.some((s) => hexKey(s.hex) === hexKey(h))) return no('fire-here');
      const fuel = firstWithTag(c.pack, FIRE.fuel.tag, FIRE.fuel.amount);
      if (!fuel) {
        const kind = MATERIALS.find((m) => m.tags.includes(FIRE.fuel.tag));
        return no('no-fuel', kind ? [{ material: kind.id, amount: FIRE.fuel.amount }] : undefined);
      }
      return c.actionsLeft >= cost
        ? done(cost, [{ material: fuel, amount: FIRE.fuel.amount }])
        : no('not-enough-actions');
    }
    case 'feed': {
      const cost = config.feedCost;
      const no = (reason: ActRefusal, missing?: Uses): ActCheck =>
        missing ? { ok: false, reason, cost, missing } : { ok: false, reason, cost };
      if (c.at.kind !== 'creature') return no('not-riding');
      const food = firstWithTag(state.stores, FOOD_TAG);
      if (!food) {
        const kind = MATERIALS.find((m) => m.tags.includes(FOOD_TAG));
        return no('no-food', kind ? [{ material: kind.id, amount: 1 }] : undefined);
      }
      return c.actionsLeft >= cost
        ? done(cost, [{ material: food, amount: 1 }])
        : no('not-enough-actions');
    }
    case 'linger': {
      const cost = config.lingerCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (!isKeeper(state, c.id)) return no('needs-keeper');
      if (c.at.kind !== 'creature') return no('not-riding');
      // Already asked today: a second linger would change nothing.
      if (state.creature.lingering) return no('already-have');
      if (state.creature.lingeredDay === state.day - 1) return no('lingered-yesterday');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    default:
      return { ok: false, reason: 'invalid-action' };
  }
};

const subtract = (from: Materials, uses: Uses): Materials => {
  const out: Record<string, number> = { ...from };
  for (const u of uses) {
    const left = (out[u.material] ?? 0) - u.amount;
    if (left > 0) out[u.material] = left;
    else delete out[u.material];
  }
  return out;
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

  if (action.kind === 'light-fire' && FIRE) {
    const h = hexOf(c) as Hex;
    const lit: GameState = {
      ...state,
      stimuli: [...state.stimuli, { type: FIRE.id, hex: h, litDay: state.day }],
    };
    return {
      ok: true,
      state: withCharacter(lit, { pack: subtract(c.pack, check.uses) }),
      events: [{ kind: 'fire-lit', hex: h, characterId, stimulus: FIRE.id }],
    };
  }

  if (action.kind === 'feed') {
    const use = check.uses[0] as { material: string; amount: number };
    const { max } = creatureType(state.nature.type).hunger;
    const satiety = Math.min(max, state.care.satiety + nourishment(use.material) * use.amount);
    const fed: GameState = {
      ...state,
      stores: subtract(state.stores, check.uses),
      care: { ...state.care, satiety },
    };
    return {
      ok: true,
      state: withCharacter(fed, {}),
      events: [{ kind: 'fed', characterId, material: use.material }],
    };
  }

  if (action.kind === 'linger') {
    const lingering: GameState = { ...state, creature: { ...state.creature, lingering: true } };
    return {
      ok: true,
      state: withCharacter(lingering, {}),
      events: [{ kind: 'linger', characterId }],
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
 * surveying each adjacent unexplored hex, gathering and working a site here,
 * building each unlock, lighting a fire, feeding and lingering. Runs on a view.
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
    { kind: 'light-fire' },
    { kind: 'feed' },
    { kind: 'linger' },
  ];
  return options.map((action) => ({ action, check: checkAction(state, characterId, action) }));
};

/** The same list as `actionsHere`. */
export const possibleActions = actionsHere;
