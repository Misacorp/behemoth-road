/**
 * Milestone 3's chain as the web client reads it from the player view, on the core's own types and rules:
 * revealed features, explored hexes, your pack, the team stores and unlocks, and what you can do now
 * (`checkAction`, `actionsHere`). The client runs the same checks the server runs; the server re-checks.
 */
import {
  actionsHere,
  checkAction,
  type FeatureType,
  featureType,
  type GameStateView,
  type Hex,
  hexKey,
  MATERIALS,
  ROLES,
  STIMULUS_TYPES,
  UNLOCKS,
  type Unlock,
} from '@behemoth-road/core';

export interface Feature {
  readonly type: FeatureType;
  /** Charges left (nodes); 1 for an unworked site, 0 once found. */
  readonly left: number;
}

function typeOf(id: string): FeatureType | null {
  try {
    return featureType(id);
  } catch {
    return null; // Content this build does not know: leave it out rather than break the map.
  }
}

/** The revealed feature on a hex (hidden ones never reach the client). */
export function featureAt(game: GameStateView, h: Hex): Feature | null {
  const f = game.features[hexKey(h)];
  const type = f?.revealed ? typeOf(f.type) : null;
  return f && type ? { type, left: f.left } : null;
}

export type Stock = readonly (readonly [string, number])[];

/** Materials with a count above zero, in content order (unknown ids last). */
export function stockOf(materials: Readonly<Record<string, number>>): Stock {
  const known = MATERIALS.map((m) => m.id);
  return Object.entries(materials)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => {
      const i = known.indexOf(a);
      const j = known.indexOf(b);
      return (i < 0 ? known.length : i) - (j < 0 ? known.length : j);
    });
}

export const packUnits = (pack: Readonly<Record<string, number>>): number =>
  Object.values(pack).reduce((a, n) => a + n, 0);

/** The art kit icon key for a content id (material, unlock, role, feature), or the id itself. */
export function iconOf(id: string): string {
  const all: readonly { readonly id: string; readonly icon: string }[] = [
    ...MATERIALS,
    ...UNLOCKS,
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
  'needs-unlock',
  'cannot-work',
  'pack-full',
]);

/** Gather and work-site where the character stands: offered, offered faded, or not at all. */
export function actionsAt(game: GameStateView, characterId: string): PossibleAction[] {
  const out: PossibleAction[] = [];
  for (const { action, check } of actionsHere(game, characterId)) {
    if (action.kind !== 'gather' && action.kind !== 'work-site') continue;
    const cost = action.kind === 'gather' ? game.config.gatherCost : game.config.workSiteCost;
    if (check.ok) out.push({ kind: action.kind, cost: check.cost, enabled: true });
    else if (NOT_NOW.has(check.reason)) out.push({ kind: action.kind, cost, enabled: false });
  }
  return out;
}

/** Surveying a hex from where the character is: its cost and whether it can be done now, or null. */
export function surveyOf(
  game: GameStateView,
  characterId: string,
  h: Hex,
): { readonly cost: number; readonly enabled: boolean } | null {
  const check = checkAction(game, characterId, { kind: 'survey', hex: h });
  if (check.ok) return { cost: check.cost, enabled: true };
  if (check.reason !== 'not-enough-actions') return null;
  const me = game.characters.find((c) => c.id === characterId);
  const scout = ROLES.find((r) => r.id === me?.role)?.tags.includes('survey') ?? false;
  return {
    cost: scout ? game.config.surveyCostSpecialist : game.config.surveyCostOther,
    enabled: false,
  };
}

export interface UnlockOption {
  readonly unlock: Unlock;
  readonly done: boolean;
  /** Work done, while it is the unlock in progress; null otherwise. */
  readonly work: number | null;
  /** Whether the stores hold its cost (only matters before it starts). */
  readonly affordable: boolean;
  /** Whether this character can start or work on it now. */
  readonly enabled: boolean;
  readonly cost: number;
}

/** Every unlock as the creature's drawer shows it, for this character. */
export function unlockOptions(game: GameStateView, characterId: string): UnlockOption[] {
  return UNLOCKS.map((unlock) => {
    const check = checkAction(game, characterId, { kind: 'build', unlock: unlock.id });
    const work = game.project?.unlock === unlock.id ? game.project.work : null;
    return {
      unlock,
      done: game.unlocks.includes(unlock.id),
      work,
      affordable:
        work !== null || unlock.cost.every((c) => (game.stores[c.material] ?? 0) >= c.amount),
      enabled: check.ok,
      cost: check.ok ? check.cost : game.config.buildCost,
    };
  });
}

/** An action with a material cost, as a button shows it: its cost in actions and the material it uses. */
export interface CostedAction {
  readonly kind: 'light-fire' | 'feed' | 'linger';
  readonly cost: number;
  readonly enabled: boolean;
  /** The material it takes (fuel from your pack, food from the stores), or null. */
  readonly uses: string | null;
  /** Feed: the stores hold no food. Drawn faded on the material. */
  readonly short?: boolean;
  /** Linger: already asked for today. */
  readonly done?: boolean;
}

const firstTagged = (tag: string, held: Readonly<Record<string, number>> = {}): string | null =>
  (
    MATERIALS.find((m) => m.tags.includes(tag) && (held[m.id] ?? 0) > 0) ??
    MATERIALS.find((m) => m.tags.includes(tag))
  )?.id ?? null;

/** The material tag the creature eats (the core's `FOOD_TAG`, not exported from its index). */
const FOOD_TAG = 'food';

/** The stimulus a fire is (tagged `fire`) and its fuel tag: content, read by tag. */
const FIRE = STIMULUS_TYPES.find((t) => t.tags.includes('fire')) ?? null;

/**
 * Lighting a fire where you stand, for your own hex's card: offered when you carry its fuel, faded when your
 * actions are spent. Not offered without fuel (so the card does not open on every hex), on water, on the
 * creature, or where a fire already burns.
 */
export function fireAction(game: GameStateView, characterId: string): CostedAction | null {
  if (!FIRE) return null;
  const check = checkAction(game, characterId, { kind: 'light-fire' });
  if (check.ok) {
    return {
      kind: 'light-fire',
      cost: check.cost,
      enabled: true,
      uses: check.uses[0]?.material ?? null,
    };
  }
  if (check.reason !== 'not-enough-actions') return null;
  const me = game.characters.find((c) => c.id === characterId);
  return {
    kind: 'light-fire',
    cost: game.config.lightFireCost,
    enabled: false,
    uses: firstTagged(FIRE.fuel.tag, me?.pack),
  };
}

/**
 * Feeding and lingering in the creature's hub. Feeding is for everyone (faded unless you ride, have the
 * actions and the stores hold food); lingering only for keepers (faded unless riding with the actions, and
 * not the day after a linger; marked done once asked for today).
 */
export function careOptions(game: GameStateView, characterId: string): CostedAction[] {
  const me = game.characters.find((c) => c.id === characterId);
  if (me?.status !== 'active') return [];
  const out: CostedAction[] = [];
  const feed = checkAction(game, characterId, { kind: 'feed' });
  out.push({
    kind: 'feed',
    cost: feed.ok ? feed.cost : game.config.feedCost,
    enabled: feed.ok,
    uses: feed.ok ? (feed.uses[0]?.material ?? null) : firstTagged(FOOD_TAG, game.stores),
    short: !feed.ok && feed.reason === 'no-food',
  });
  const linger = checkAction(game, characterId, { kind: 'linger' });
  if (linger.ok || linger.reason !== 'needs-keeper') {
    out.push({
      kind: 'linger',
      cost: linger.ok ? linger.cost : game.config.lingerCost,
      enabled: linger.ok,
      uses: null,
      done: game.creature.lingering,
    });
  }
  return out;
}
