/**
 * Features on hexes and exploring: features are generated on the server as hexes
 * come into view, hidden until someone explores the hex (by entering or
 * surveying it). Packs go into the team stores on the creature. Roles are read
 * by their tags, never by id.
 */

import {
  FEATURE_TYPES,
  FEATURE_WEIGHT_SCALE,
  type FeatureType,
  ROLES,
  UNLOCKS,
} from './content/index.ts';
import { type Hex, hexKey, neighbours } from './hex.ts';
import { terrainAt, terrainById } from './map.ts';
import { hashString, hashToUnit, type Seed } from './random.ts';
import type {
  Character,
  FeatureState,
  GameState,
  GameStateView,
  Materials,
  TileKnowledge,
} from './state.ts';

const FEATURE_STREAM = hashString('feature');

/** Something that happened, for the interface's short visual moments. */
export type GameEvent =
  | { readonly kind: 'explore'; readonly hex: Hex }
  | { readonly kind: 'survey'; readonly hex: Hex; readonly characterId: string }
  | { readonly kind: 'reveal'; readonly hex: Hex; readonly feature: string }
  | { readonly kind: 'trap'; readonly hex: Hex; readonly characterId: string }
  | {
      readonly kind: 'gather';
      readonly hex: Hex;
      readonly characterId: string;
      readonly material: string;
      readonly amount: number;
    }
  | {
      readonly kind: 'find';
      readonly hex: Hex;
      readonly characterId: string;
      readonly material: string;
      readonly amount: number;
    }
  | { readonly kind: 'site-failed'; readonly hex: Hex; readonly characterId: string }
  | { readonly kind: 'deposit'; readonly characterId: string; readonly materials: Materials }
  | {
      readonly kind: 'unlock-progress';
      readonly unlock: string;
      readonly work: number;
      readonly needed: number;
    }
  | { readonly kind: 'unlock-done'; readonly unlock: string }
  | {
      readonly kind: 'fire-lit';
      readonly hex: Hex;
      readonly characterId: string;
      /** The stimulus's content id. */
      readonly stimulus: string;
    }
  | { readonly kind: 'fed'; readonly characterId: string; readonly material: string }
  | { readonly kind: 'linger'; readonly characterId: string };

export const featureType = (id: string): FeatureType => {
  const type = FEATURE_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`Unknown feature: ${id}`);
  return type;
};

/** Whether a character's role carries a tag (the scout's `survey`, the engineer's `build`…). Perks waiting on an upgrade never count. */
export const roleHas = (character: Character, tag: string): boolean =>
  ROLES.find((r) => r.id === character.role)?.tags.includes(tag) ?? false;

const keyToHex = (key: string): Hex => {
  const [q, r] = key.split(',').map(Number) as [number, number];
  return { q, r };
};

/** The sum of all placement weights: no hex can hold a feature with more than this. */
const MAX_WEIGHT = FEATURE_TYPES.reduce((sum, t) => sum + t.placement.weight, 0);

/**
 * The feature generated for a hex, or null (most hexes hold nothing). A pure
 * function of the seed and the hex. `terrainIdOf` may read known tiles first.
 */
export const generateFeature = (
  seed: Seed,
  h: Hex,
  chance: number,
  terrainIdOf: (h: Hex) => string = (x) => terrainAt(seed, x).id,
): FeatureType | null => {
  const roll = hashToUnit(seed, FEATURE_STREAM, h.q, h.r);
  // Cheap early exit: no feature can be this likely (most hexes stop here).
  const most = (chance * MAX_WEIGHT) / FEATURE_WEIGHT_SCALE;
  if (roll >= most) return null;
  const terrain = terrainById(terrainIdOf(h));
  if (!terrain.passable) return null;
  let nearTags: Set<string> | null = null;
  const fits = FEATURE_TYPES.filter((t) => {
    if (t.placement.on.some((tag) => terrain.tags.includes(tag))) return true;
    const near = t.placement.near;
    if (!near) return false;
    nearTags ??= new Set(neighbours(h).flatMap((n) => terrainById(terrainIdOf(n)).tags));
    return near.some((tag) => nearTags?.has(tag));
  });
  // Each feature that fits takes its own slice of the roll: `chance × weight / scale`.
  let upTo = 0;
  for (const t of fits) {
    upTo += (chance * t.placement.weight) / FEATURE_WEIGHT_SCALE;
    if (roll < upTo) return t;
  }
  return null;
};

/** A fresh feature state for a type. */
const freshFeature = (type: FeatureType): FeatureState => ({
  type: type.id,
  revealed: false,
  left: type.kind === 'node' ? type.charges : 1,
});

/**
 * Adds features for the given hexes that have none recorded yet (hexes newly in
 * view). Server only. Known tiles supply terrain; others are generated.
 */
export const addFeatures = (
  features: Readonly<Record<string, FeatureState>>,
  tiles: Readonly<Record<string, TileKnowledge>>,
  hexes: readonly Hex[],
  seed: Seed,
  chance: number,
): Record<string, FeatureState> => {
  const next: Record<string, FeatureState> = { ...features };
  const terrainIdOf = (h: Hex) => tiles[hexKey(h)]?.terrain ?? terrainAt(seed, h).id;
  for (const h of hexes) {
    const key = hexKey(h);
    if (next[key]) continue;
    const type = generateFeature(seed, h, chance, terrainIdOf);
    if (type) next[key] = freshFeature(type);
  }
  return next;
};

/** Keeps only features on hexes the state still has tiles for. */
export const pruneFeatures = <S extends GameStateView>(state: S): S => {
  const features: Record<string, FeatureState> = {};
  for (const [key, f] of Object.entries(state.features)) if (state.tiles[key]) features[key] = f;
  return { ...state, features };
};

/** The revealed feature on a hex, if any (what a player can see). */
export const revealedFeatureAt = (state: GameStateView, h: Hex): FeatureState | null => {
  const f = state.features[hexKey(h)];
  return f?.revealed ? f : null;
};

/** Whether anyone has explored a hex (entered or surveyed it). */
export const isExplored = (state: GameStateView, h: Hex): boolean =>
  state.tiles[hexKey(h)]?.explored ?? false;

export interface ExploreResult<S extends GameStateView> {
  readonly state: S;
  readonly events: GameEvent[];
  /** The feature revealed here is a trap that was hidden until now. */
  readonly hiddenTrap: boolean;
}

/**
 * Explores a hex for everyone: marks it explored and reveals its feature. On a
 * player view there are no hidden features, so only the flag changes there.
 */
export const exploreHex = <S extends GameStateView>(state: S, h: Hex): ExploreResult<S> => {
  const key = hexKey(h);
  const tile = state.tiles[key];
  const events: GameEvent[] = [];
  let next: S = state;
  if (tile && !tile.explored) {
    next = { ...next, tiles: { ...next.tiles, [key]: { ...tile, explored: true } } };
    events.push({ kind: 'explore', hex: h });
  }
  const f = next.features[key];
  let hiddenTrap = false;
  if (f && !f.revealed) {
    next = { ...next, features: { ...next.features, [key]: { ...f, revealed: true } } };
    events.push({ kind: 'reveal', hex: h, feature: f.type });
    hiddenTrap = featureType(f.type).kind === 'trap';
  }
  return { state: next, events, hiddenTrap };
};

export interface EnterResult<S extends GameStateView> {
  readonly state: S;
  readonly events: GameEvent[];
  /** A hidden trap caught the character: its day is over. */
  readonly trapped: boolean;
}

/**
 * What happens when a character enters a hex: the hex is explored, revealing its
 * feature for everyone, and a hidden trap there catches the character (anyone,
 * scouts included, for now): its day ends. A revealed trap is harmless.
 */
export const enterHex = <S extends GameStateView>(
  state: S,
  characterId: string,
  h: Hex,
): EnterResult<S> => {
  const explored = exploreHex(state, h);
  const events = explored.events;
  if (!explored.hiddenTrap) return { state: explored.state, events, trapped: false };
  events.push({ kind: 'trap', hex: h, characterId });
  return {
    state: {
      ...explored.state,
      characters: explored.state.characters.map((c) =>
        c.id === characterId ? { ...c, actionsLeft: 0 } : c,
      ),
    },
    events,
    trapped: true,
  };
};

/** Adds materials to a count record. */
export const addMaterials = (into: Materials, more: Materials): Materials => {
  const out: Record<string, number> = { ...into };
  for (const [id, n] of Object.entries(more)) if (n > 0) out[id] = (out[id] ?? 0) + n;
  return out;
};

/** Units in a pack. */
export const packSize = (pack: Materials): number =>
  Object.values(pack).reduce((sum, n) => sum + n, 0);

/**
 * Empties a character's pack into the team stores, if the character is on the
 * creature and carries anything.
 */
export const depositPack = <S extends GameStateView>(
  state: S,
  characterId: string,
): { readonly state: S; readonly events: GameEvent[] } => {
  const c = state.characters.find((x) => x.id === characterId);
  if (!c || c.at.kind !== 'creature' || packSize(c.pack) === 0) return { state, events: [] };
  return {
    state: {
      ...state,
      stores: addMaterials(state.stores, c.pack),
      characters: state.characters.map((x) => (x.id === characterId ? { ...x, pack: {} } : x)),
    },
    events: [{ kind: 'deposit', characterId, materials: c.pack }],
  };
};

/** Tags of the unlocks the team has finished (the lantern gives `light`). */
export const unlockTags = (state: GameStateView): Set<string> =>
  new Set(UNLOCKS.filter((u) => state.unlocks.includes(u.id)).flatMap((u) => u.tags));

/** Hidden features generated so far (server only), for tests and tools. */
export const hiddenFeatureKeys = (state: GameState): string[] =>
  Object.entries(state.features)
    .filter(([, f]) => !f.revealed)
    .map(([key]) => key);

export { keyToHex };
