/**
 * Milestone 3's chain as the web client reads it from the player view, on the core's own types and rules:
 * revealed features, glints, the team inventory, what can be done where you stand (`actionsHere`) and how
 * each recipe could be crafted. The client runs the same checks the server runs; the server re-checks.
 */
import {
  actionsHere,
  type ActCheck,
  type FeatureType,
  featureType,
  type GameStateView,
  type Hex,
  hexKey,
  ITEMS,
  MATERIALS,
  RECIPES,
  type Recipe,
  ROLES,
  roleHas,
} from '@behemoth-road/core';

export interface Feature {
  readonly type: FeatureType;
  /** Charges left (nodes) or tries left before it is spent (sites). */
  readonly left: number;
}

export interface Chain {
  /** Revealed features by hex key (hidden ones never reach the client). */
  readonly features: ReadonlyMap<string, Feature>;
  /** Hexes a scout has sensed something on. */
  readonly glints: ReadonlySet<string>;
  /** Materials and items the team holds, with counts: materials first, in content order. */
  readonly stock: readonly (readonly [string, number])[];
}

function typeOf(id: string): FeatureType | null {
  try {
    return featureType(id);
  } catch {
    return null; // Content this build does not know: leave it out rather than break the map.
  }
}

export function chainOf(game: GameStateView): Chain {
  const features = new Map<string, Feature>();
  for (const [key, f] of Object.entries(game.features)) {
    const type = f.revealed ? typeOf(f.type) : null;
    if (type) features.set(key, { type, left: f.left });
  }
  const stock: (readonly [string, number])[] = [];
  for (const m of MATERIALS) {
    const n = game.inventory.materials[m.id] ?? 0;
    if (n > 0) stock.push([m.id, n]);
  }
  for (const i of ITEMS) {
    const n = game.inventory.items[i.id] ?? 0;
    if (n > 0) stock.push([i.id, n]);
  }
  return { features, glints: new Set(Object.keys(game.glints)), stock };
}

export const featureAt = (chain: Chain, h: Hex): Feature | null =>
  chain.features.get(hexKey(h)) ?? null;

/** The art kit icon key for a content id (material, item, recipe, role, feature), or the id itself. */
export function iconOf(id: string): string {
  const all: readonly { readonly id: string; readonly icon: string }[] = [
    ...MATERIALS,
    ...ITEMS,
    ...RECIPES,
    ...ROLES,
  ];
  return all.find((x) => x.id === id)?.icon ?? typeOf(id)?.icon ?? id;
}

export interface PossibleAction {
  readonly kind: 'gather' | 'work-site';
  readonly cost: number;
  readonly enabled: boolean;
}

/** Refusals that mean "this exists here but cannot be done now": offered faded rather than hidden. */
const NOT_NOW: ReadonlySet<string> = new Set([
  'not-enough-actions',
  'needs-item',
  'cannot-work',
  'needs-specialist',
]);

/** Gather and work-site where the character stands: offered, offered faded, or not at all. */
export function actionsAt(game: GameStateView, characterId: string): PossibleAction[] {
  const out: PossibleAction[] = [];
  for (const { action, check } of actionsHere(game, characterId)) {
    if (action.kind === 'craft') continue;
    const cost = action.kind === 'gather' ? game.config.gatherCost : game.config.workSiteCost;
    if (check.ok) out.push({ kind: action.kind, cost: check.cost, enabled: true });
    else if (NOT_NOW.has(check.reason)) out.push({ kind: action.kind, cost, enabled: false });
  }
  return out;
}

export interface CraftOption {
  readonly recipe: Recipe;
  /** What crafting takes from the inventory for this character. */
  readonly inputs: readonly (readonly [string, number])[];
  /** The extra material a non-specialist pays, or null. */
  readonly extra: readonly [string, number] | null;
  readonly cost: number;
  readonly enabled: boolean;
  /** The core's refusal when it cannot be crafted now. */
  readonly refusal: string | null;
}

/** How the character could craft each recipe now, from the core's own checks. */
export function craftOptions(game: GameStateView, characterId: string): CraftOption[] {
  const me = game.characters.find((c) => c.id === characterId);
  const specialist = me ? roleHas(me, 'craft') : false;
  const checks = new Map<string, ActCheck>();
  for (const { action, check } of actionsHere(game, characterId)) {
    if (action.kind === 'craft') checks.set(action.recipe, check);
  }
  return RECIPES.map((recipe) => {
    const check: ActCheck = checks.get(recipe.id) ?? { ok: false, reason: 'unknown-character' };
    const first = recipe.needs[0];
    const extraAmount = specialist ? 0 : game.config.nonSpecialistExtraMaterial;
    const extra: readonly [string, number] | null =
      first && extraAmount > 0 ? [first.material, extraAmount] : null;
    const inputs = check.ok
      ? check.uses.map((u) => [u.material, u.amount] as const)
      : recipe.needs.map(
          (n, i) => [n.material, n.amount + (i === 0 && extra ? extra[1] : 0)] as const,
        );
    return {
      recipe,
      inputs,
      extra,
      cost: check.ok ? check.cost : game.config.craftCost,
      enabled: check.ok,
      refusal: check.ok ? null : check.reason,
    };
  });
}
