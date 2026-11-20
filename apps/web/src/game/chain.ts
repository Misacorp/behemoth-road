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
    if (check.ok) out.push({ kind: action.kind, cost: check.cost, enabled: true });
    else if (NOT_NOW.has(check.reason) && check.cost !== undefined)
      out.push({ kind: action.kind, cost: check.cost, enabled: false });
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
  if (check.reason !== 'not-enough-actions' || check.cost === undefined) return null;
  return { cost: check.cost, enabled: false };
}

export interface UnlockOption {
  readonly unlock: Unlock;
  readonly done: boolean;
  /** Work done, while it is the unlock in progress; null otherwise. */
  readonly work: number | null;
  /** Materials the stores lack to start it (the core's answer); empty when they hold its cost. */
  readonly missing: readonly { readonly material: string; readonly amount: number }[];
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
      missing: check.ok ? [] : (check.missing ?? []),
      enabled: check.ok,
      cost: check.cost ?? 0,
    };
  });
}

/** An action with a material cost, as a button shows it: its cost in actions and the material it uses. */
export interface CostedAction {
  readonly kind: 'light-fire' | 'feed' | 'linger' | 'defend';
  readonly cost: number;
  readonly enabled: boolean;
  /** The material it takes (fuel from your pack, food from the stores), or null. */
  readonly uses: string | null;
  /** The material is missing (no fuel, no food): drawn faded. */
  readonly short?: boolean;
  /** Linger or defend: already done today. */
  readonly done?: boolean;
}

/** The stimulus a fire is (tagged `fire`), for its fuel tag: content, read by tag. */
const FIRE = STIMULUS_TYPES.find((t) => t.tags.includes('fire')) ?? null;

/** Materials that nourish the creature (content `nourishes`), in content order. */
const FOODS: readonly string[] = MATERIALS.filter((m) => (m.nourishes ?? 0) > 0).map((m) => m.id);

/** The first material held with this tag (in content order), or null. */
const heldWith = (tag: string, held: Readonly<Record<string, number>>): string | null =>
  MATERIALS.find((m) => m.tags.includes(tag) && (held[m.id] ?? 0) > 0)?.id ?? null;

/**
 * The material a revealed node on this hex yields when it is fuel for a fire (tagged like the fire's fuel,
 * read by tag): a timber stand. Null for anything else.
 */
export function fuelNodeAt(game: GameStateView, h: Hex): string | null {
  const type = featureAt(game, h)?.type;
  if (!FIRE || type?.kind !== 'node') return null;
  const material = MATERIALS.find((m) => m.id === type.yields.material);
  return material?.tags.includes(FIRE.fuel.tag) ? material.id : null;
}

/**
 * The faded fire hint on the inspect card of a hex holding a fuel node: what a fire costs and the fuel it
 * takes, never actionable from there (a fire is lit where you stand).
 */
export function fireHintAt(
  game: GameStateView,
  h: Hex,
): { readonly cost: number; readonly uses: string } | null {
  const fuel = fuelNodeAt(game, h);
  return fuel ? { cost: game.config.lightFireCost, uses: fuel } : null;
}

/**
 * Lighting a fire where you stand, for your own hex's card, from the core's check and its refusal cost and
 * missing material. With fuel it is offered (faded when your actions are spent). Without fuel it is
 * offered faded, its timber faded too, only as a hint (`hint`: the card is open for something else and you
 * have seen a fire). Never on water, on the creature or where a fire already burns.
 */
export function fireAction(
  game: GameStateView,
  characterId: string,
  hint = false,
): CostedAction | null {
  const check = checkAction(game, characterId, { kind: 'light-fire' });
  if (check.ok) {
    return {
      kind: 'light-fire',
      cost: check.cost,
      enabled: true,
      uses: check.uses[0]?.material ?? null,
    };
  }
  if (check.cost === undefined) return null;
  if (check.reason === 'not-enough-actions') {
    const me = game.characters.find((c) => c.id === characterId);
    const fuel = FIRE && me ? heldWith(FIRE.fuel.tag, me.pack) : null;
    return { kind: 'light-fire', cost: check.cost, enabled: false, uses: fuel };
  }
  if (check.reason === 'no-fuel' && hint) {
    return {
      kind: 'light-fire',
      cost: check.cost,
      enabled: false,
      uses: check.missing?.[0]?.material ?? null,
      short: true,
    };
  }
  return null;
}

/**
 * Feeding and lingering in the creature's hub, from the core's checks and their refusal cost and missing
 * food. Feeding is for everyone (faded unless you ride, have the actions and the stores hold food; the food
 * faded when they do not); lingering only for keepers (faded unless riding with the actions, and not the
 * day after a linger; marked done once asked for today).
 */
export function careOptions(game: GameStateView, characterId: string): CostedAction[] {
  const me = game.characters.find((c) => c.id === characterId);
  if (me?.status !== 'active') return [];
  const out: CostedAction[] = [];
  const feed = checkAction(game, characterId, { kind: 'feed' });
  if (feed.ok) {
    out.push({
      kind: 'feed',
      cost: feed.cost,
      enabled: true,
      uses: feed.uses[0]?.material ?? null,
    });
  } else if (feed.cost !== undefined) {
    const missing = feed.missing?.[0]?.material ?? null;
    const food = FOODS.find((id) => (game.stores[id] ?? 0) > 0) ?? null;
    out.push({
      kind: 'feed',
      cost: feed.cost,
      enabled: false,
      uses: missing ?? food,
      short: missing !== null,
    });
  }
  const linger = checkAction(game, characterId, { kind: 'linger' });
  if (linger.ok || (linger.reason !== 'needs-keeper' && linger.cost !== undefined)) {
    out.push({
      kind: 'linger',
      cost: linger.cost ?? 0,
      enabled: linger.ok,
      uses: null,
      done: game.creature.lingering,
    });
  }
  return out;
}
