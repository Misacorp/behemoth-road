/**
 * PROVISIONAL ADAPTER, until `m3/core` lands: the one module that knows how Milestone 3's chain appears in
 * the player view (revealed features, glints, the team inventory). Everything else in the web client reads
 * the chain through this file, so switching to the core's real types and rule functions is one edit here.
 *
 * Shape assumed (`docs/design/m3-chain.md` leaves it open): `game.features` maps a hex key to a revealed
 * feature, `game.glints` lists sensed hex keys, `game.inventory` maps content ids to counts.
 */
import { hexKey, type Hex } from '@behemoth-road/core';

export type FeatureKind = 'node' | 'site' | 'trap';

export interface Feature {
  readonly kind: FeatureKind;
  /** Content id (`iron-deposit`, `tomb`, `snare`…). */
  readonly id: string;
  /** Nodes: gathers left. */
  readonly charges?: number;
  /** Sites: 1 or 2. */
  readonly tier?: number;
  /** Sites: opened (the find taken); nodes: no charges left. */
  readonly spent?: boolean;
}

export interface Chain {
  readonly features: ReadonlyMap<string, Feature>;
  readonly glints: ReadonlySet<string>;
  readonly inventory: ReadonlyMap<string, number>;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function asFeature(x: unknown): Feature | null {
  if (!isRecord(x)) return null;
  const { kind, id } = x;
  if ((kind !== 'node' && kind !== 'site' && kind !== 'trap') || typeof id !== 'string')
    return null;
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  const charges = num(x['charges']);
  const tier = num(x['tier']);
  return {
    kind,
    id,
    ...(charges === undefined ? {} : { charges }),
    ...(tier === undefined ? {} : { tier }),
    ...(x['spent'] === true ? { spent: true } : {}),
  };
}

/** The chain parts of a view's game; absent parts are empty (a Milestone 2 view). */
export function chainOf(game: unknown): Chain {
  const g = isRecord(game) ? game : {};
  const features = new Map<string, Feature>();
  if (isRecord(g['features'])) {
    for (const [key, raw] of Object.entries(g['features'])) {
      const f = asFeature(raw);
      if (f) features.set(key, f);
    }
  }
  const glints = new Set<string>(
    Array.isArray(g['glints']) ? g['glints'].filter((k): k is string => typeof k === 'string') : [],
  );
  const inventory = new Map<string, number>();
  if (isRecord(g['inventory'])) {
    for (const [id, n] of Object.entries(g['inventory'])) {
      if (typeof n === 'number' && n > 0) inventory.set(id, n);
    }
  }
  return { features, glints, inventory };
}

export const featureAt = (chain: Chain, h: Hex): Feature | null =>
  chain.features.get(hexKey(h)) ?? null;

// --- Provisional rules (replace with the core's own functions when `m3/core` lands) ---------------------

export type ActionKind = 'gather' | 'work-site';

export interface PossibleAction {
  readonly kind: ActionKind;
  /** Actions it costs. */
  readonly cost: number;
  /** False when it cannot be done now (not enough actions, a missing item, a tier this role cannot try). */
  readonly enabled: boolean;
}

/** What can be done where a character stands, from the starting values in `docs/design/m3-chain.md`. */
export function actionsAt(
  chain: Chain,
  here: Hex | null,
  role: string | null,
  actionsLeft: number,
): PossibleAction[] {
  const f = here ? featureAt(chain, here) : null;
  if (!f || f.spent) return [];
  if (f.kind === 'node' && (f.charges ?? 1) > 0) {
    return [{ kind: 'gather', cost: 1, enabled: actionsLeft >= 1 }];
  }
  if (f.kind === 'site') {
    const tier2 = (f.tier ?? 1) >= 2;
    const canTry = !tier2 || (role === 'scholar' && (chain.inventory.get('lantern') ?? 0) > 0);
    return [{ kind: 'work-site', cost: 2, enabled: canTry && actionsLeft >= 2 }];
  }
  return [];
}

export interface Recipe {
  readonly id: string;
  readonly inputs: readonly (readonly [string, number])[];
  readonly tier: number;
}

/** Recipes from the plan (content data in the core later). */
export const RECIPES: readonly Recipe[] = [
  {
    id: 'grappling-hook',
    inputs: [
      ['iron', 2],
      ['timber', 1],
    ],
    tier: 1,
  },
  {
    id: 'lantern',
    inputs: [
      ['river-stone', 1],
      ['timber', 1],
    ],
    tier: 1,
  },
  {
    id: 'climbing-spikes',
    inputs: [
      ['ancient-alloy', 1],
      ['iron', 1],
    ],
    tier: 2,
  },
];

export interface CraftOption {
  readonly recipe: Recipe;
  /** What crafting takes from the inventory for this character (with the extra material for non-engineers). */
  readonly inputs: readonly (readonly [string, number])[];
  /** The extra material a non-engineer pays, or null. */
  readonly extra: readonly [string, number] | null;
  readonly cost: number;
  readonly enabled: boolean;
}

/** How a character could craft each recipe now. */
export function craftOptions(
  chain: Chain,
  role: string | null,
  actionsLeft: number,
): CraftOption[] {
  return RECIPES.map((recipe) => {
    const engineer = role === 'engineer';
    const allowed = engineer || recipe.tier === 1;
    const first = recipe.inputs[0]!;
    const extra: readonly [string, number] | null = engineer ? null : [first[0], 1];
    const inputs = recipe.inputs.map(
      ([id, n]) => [id, extra && id === extra[0] ? n + 1 : n] as const,
    );
    const affordable = inputs.every(([id, n]) => (chain.inventory.get(id) ?? 0) >= n);
    return {
      recipe,
      inputs,
      extra,
      cost: 1,
      enabled: allowed && affordable && actionsLeft >= 1,
    };
  });
}
