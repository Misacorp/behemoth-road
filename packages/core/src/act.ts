/**
 * Actions at a character's place, beyond moving: gather at a node, craft from
 * the team inventory, work a site. Roles are read by their tags: `gather` (more
 * yield), `craft` (crafts every recipe at its listed cost), `sites` (better
 * chances, tier 2). Every number is in the tuning config or content.
 */

import { ITEMS, RECIPES, type Recipe, type SiteType } from './content/index.ts';
import { activeCharacter } from './actions.ts';
import { featureType, type GameEvent, roleHas } from './features.ts';
import { type Hex, hexKey } from './hex.ts';
import { hashString, hashToUnit } from './random.ts';
import {
  type Character,
  type FeatureState,
  type GameState,
  type GameStateView,
  hasSeed,
  type Inventory,
} from './state.ts';

export type Action =
  | { readonly kind: 'gather' }
  | { readonly kind: 'craft'; readonly recipe: string }
  | { readonly kind: 'work-site' };

export type ActRefusal =
  | 'invalid-action'
  | 'unknown-character'
  | 'character-lost'
  | 'not-on-hex'
  | 'nothing-here'
  | 'depleted'
  | 'not-enough-actions'
  | 'unknown-recipe'
  | 'needs-specialist'
  | 'crafted-today'
  | 'missing-materials'
  | 'already-have'
  | 'needs-item'
  | 'cannot-work';

/** What an action would cost, or why it cannot be done now. */
export type ActCheck =
  | {
      readonly ok: true;
      /** Actions it costs. */
      readonly cost: number;
      /** Materials it uses (crafting). */
      readonly uses: readonly { readonly material: string; readonly amount: number }[];
      /** The chance of success (working a site); 1 for everything else. */
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
  if (site.tier === 1)
    return specialist ? config.siteChanceSpecialistTier1 : config.siteChanceOtherTier1;
  return specialist ? config.siteChanceSpecialistTier2 : config.siteChanceOtherTier2;
};

/** The materials a recipe takes from this character: a non-specialist pays extra of the first. */
const recipeCost = (
  state: GameStateView,
  c: Character,
  recipe: Recipe,
): { material: string; amount: number }[] =>
  recipe.needs.map((need, i) => ({
    material: need.material,
    amount:
      need.amount + (i === 0 && !roleHas(c, 'craft') ? state.config.nonSpecialistExtraMaterial : 0),
  }));

const teamItemTags = (inventory: Inventory): Set<string> =>
  new Set(ITEMS.filter((item) => (inventory.items[item.id] ?? 0) > 0).flatMap((item) => item.tags));

const featureHere = (state: GameStateView, c: Character): FeatureState | null => {
  const h = hexOf(c);
  if (!h) return null;
  const f = state.features[hexKey(h)];
  return f?.revealed ? f : null;
};

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
    case 'gather': {
      if (!hexOf(c)) return { ok: false, reason: 'not-on-hex' };
      const f = featureHere(state, c);
      if (!f || featureType(f.type).kind !== 'node') return { ok: false, reason: 'nothing-here' };
      if (f.left <= 0) return { ok: false, reason: 'depleted' };
      if (!enough(config.gatherCost)) return { ok: false, reason: 'not-enough-actions' };
      return { ok: true, cost: config.gatherCost, uses: [], chance: 1 };
    }
    case 'craft': {
      const recipe = RECIPES.find((r) => r.id === action.recipe);
      if (!recipe) return { ok: false, reason: 'unknown-recipe' };
      if (recipe.tier > 1 && !roleHas(c, 'craft')) return { ok: false, reason: 'needs-specialist' };
      const item = ITEMS.find((i) => i.id === recipe.makes);
      if (item?.unique && (state.inventory.items[item.id] ?? 0) > 0) {
        return { ok: false, reason: 'already-have' };
      }
      if (c.craftsToday >= config.craftsPerDay) return { ok: false, reason: 'crafted-today' };
      const uses = recipeCost(state, c, recipe);
      if (uses.some((u) => (state.inventory.materials[u.material] ?? 0) < u.amount)) {
        return { ok: false, reason: 'missing-materials' };
      }
      if (!enough(config.craftCost)) return { ok: false, reason: 'not-enough-actions' };
      return { ok: true, cost: config.craftCost, uses, chance: 1 };
    }
    case 'work-site': {
      if (!hexOf(c)) return { ok: false, reason: 'not-on-hex' };
      const f = featureHere(state, c);
      const type = f ? featureType(f.type) : null;
      if (!f || type?.kind !== 'site') return { ok: false, reason: 'nothing-here' };
      if (f.left <= 0) return { ok: false, reason: 'depleted' };
      const tags = teamItemTags(state.inventory);
      if (!type.needs.every((tag) => tags.has(tag))) return { ok: false, reason: 'needs-item' };
      const chance = siteChance(state, c, type);
      if (chance <= 0) return { ok: false, reason: 'cannot-work' };
      if (!enough(config.workSiteCost)) return { ok: false, reason: 'not-enough-actions' };
      return { ok: true, cost: config.workSiteCost, uses: [], chance };
    }
    default:
      return { ok: false, reason: 'invalid-action' };
  }
};

const add = (record: Readonly<Record<string, number>>, id: string, amount: number) => ({
  ...record,
  [id]: (record[id] ?? 0) + amount,
});

/**
 * Does an action for a character at its place (server only: working a site
 * rolls from the seed, the day, the character and the site, so the outcome is
 * fair and repeatable but unknown in advance).
 */
export const act = (state: GameState, characterId: string, action: Action): ActResult => {
  if (!hasSeed(state)) throw new TypeError('Acting needs the seed: server only');
  const check = checkAction(state, characterId, action);
  if (!check.ok) return check;
  const c = state.characters.find((x) => x.id === characterId) as Character;
  const spend = (extra: Partial<Character> = {}) =>
    state.characters.map((x) =>
      x.id === characterId ? { ...x, actionsLeft: x.actionsLeft - check.cost, ...extra } : x,
    );

  if (action.kind === 'craft') {
    const recipe = RECIPES.find((r) => r.id === action.recipe) as Recipe;
    let materials = state.inventory.materials;
    for (const u of check.uses) materials = add(materials, u.material, -u.amount);
    const items = add(state.inventory.items, recipe.makes, 1);
    return {
      ok: true,
      state: {
        ...state,
        inventory: { materials, items },
        characters: spend({ craftsToday: c.craftsToday + 1 }),
      },
      events: [{ kind: 'craft', item: recipe.makes }],
    };
  }

  const h = hexOf(c) as Hex;
  const key = hexKey(h);
  const f = state.features[key] as FeatureState;
  const type = featureType(f.type);

  if (action.kind === 'gather' && type.kind === 'node') {
    const amount = type.yields.amount * (roleHas(c, 'gather') ? state.config.specialistYield : 1);
    return {
      ok: true,
      state: {
        ...state,
        features: { ...state.features, [key]: { ...f, left: f.left - 1 } },
        inventory: {
          ...state.inventory,
          materials: add(state.inventory.materials, type.yields.material, amount),
        },
        characters: spend(),
      },
      events: [{ kind: 'gather', hex: h, material: type.yields.material, amount }],
    };
  }

  if (action.kind === 'work-site' && type.kind === 'site') {
    const roll = hashToUnit(state.seed, SITE_STREAM, state.day, hashString(c.id), h.q, h.r);
    if (roll >= check.chance) {
      return {
        ok: true,
        state: { ...state, characters: spend() },
        events: [{ kind: 'site-failed', hex: h }],
      };
    }
    const { material, amount } = type.finds;
    return {
      ok: true,
      state: {
        ...state,
        features: { ...state.features, [key]: { ...f, left: 0 } },
        inventory: {
          ...state.inventory,
          materials: add(state.inventory.materials, material, amount),
        },
        characters: spend(),
      },
      events: [{ kind: 'find', hex: h, material, amount }],
    };
  }
  return { ok: false, reason: 'invalid-action' };
};

/** Every action a character could take at its place now, with its check (for the interface). */
export const actionsHere = (
  state: GameStateView,
  characterId: string,
): { readonly action: Action; readonly check: ActCheck }[] => {
  const options: Action[] = [
    { kind: 'gather' },
    { kind: 'work-site' },
    ...RECIPES.map((r) => ({ kind: 'craft' as const, recipe: r.id })),
  ];
  return options.map((action) => ({ action, check: checkAction(state, characterId, action) }));
};

/** Which of gather, work-site and each craft are possible now, with costs or refusals. Runs on a view. */
export const possibleActions = actionsHere;

/**
 * What crafting a recipe would take from this character: the materials (with a
 * non-specialist's surcharge) and the action cost, or why it cannot be crafted now.
 * Runs on a view.
 */
export const craftCost = (
  state: GameStateView,
  characterId: string,
  recipe: string,
):
  | {
      readonly ok: true;
      readonly cost: number;
      readonly uses: readonly { readonly material: string; readonly amount: number }[];
    }
  | { readonly ok: false; readonly reason: ActRefusal } => {
  const check = checkAction(state, characterId, { kind: 'craft', recipe });
  return check.ok ? { ok: true, cost: check.cost, uses: check.uses } : check;
};
