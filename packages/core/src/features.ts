/**
 * Features on hexes: generated on the server as hexes come into view, hidden
 * until someone enters, sensed by scouts as a glint. Roles are read by their
 * tags (`reveal` for the scout's perks), never by id.
 */

import { FEATURE_TYPES, type FeatureType, ROLES } from './content/index.ts';
import { type Hex, hexDistance, hexesInRange, hexKey, neighbours } from './hex.ts';
import { terrainAt, terrainById } from './map.ts';
import { hashString, hashToUnit, pickWeighted, type Seed } from './random.ts';
import type { Character, FeatureState, GameState, GameStateView, TileKnowledge } from './state.ts';

const FEATURE_STREAM = hashString('feature');
const FEATURE_KIND_STREAM = hashString('feature-kind');

/** Something that happened, for the interface's short visual moments. */
export type GameEvent =
  | { readonly kind: 'reveal'; readonly hex: Hex; readonly feature: string }
  | { readonly kind: 'sense'; readonly hex: Hex }
  | { readonly kind: 'trap'; readonly hex: Hex; readonly characterId: string }
  | {
      readonly kind: 'gather';
      readonly hex: Hex;
      readonly material: string;
      readonly amount: number;
    }
  | { readonly kind: 'craft'; readonly item: string }
  | { readonly kind: 'find'; readonly hex: Hex; readonly material: string; readonly amount: number }
  | { readonly kind: 'site-failed'; readonly hex: Hex };

export const featureType = (id: string): FeatureType => {
  const type = FEATURE_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`Unknown feature: ${id}`);
  return type;
};

/** Whether a character's role carries a tag (the scout's `reveal`, the engineer's `craft`…). */
export const roleHas = (character: Character, tag: string): boolean =>
  ROLES.find((r) => r.id === character.role)?.tags.includes(tag) ?? false;

const keyToHex = (key: string): Hex => {
  const [q, r] = key.split(',').map(Number) as [number, number];
  return { q, r };
};

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
  if (hashToUnit(seed, FEATURE_STREAM, h.q, h.r) >= chance) return null;
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
  if (fits.length === 0) return null;
  return pickWeighted(
    fits,
    (t) => t.placement.weight,
    hashToUnit(seed, FEATURE_KIND_STREAM, h.q, h.r),
  );
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

/** Keeps only features and glints on hexes the state still has tiles for. */
export const pruneFeatures = <S extends GameStateView>(state: S): S => {
  const features: Record<string, FeatureState> = {};
  for (const [key, f] of Object.entries(state.features)) if (state.tiles[key]) features[key] = f;
  const glints: Record<string, true> = {};
  for (const key of Object.keys(state.glints)) if (state.tiles[key]) glints[key] = true;
  return { ...state, features, glints };
};

/** The revealed feature on a hex, if any (what a player can see). */
export const revealedFeatureAt = (state: GameStateView, h: Hex): FeatureState | null => {
  const f = state.features[hexKey(h)];
  return f?.revealed ? f : null;
};

export interface EnterResult<S extends GameStateView> {
  readonly state: S;
  readonly events: GameEvent[];
  /** A hidden trap caught the character: its day is over. */
  readonly trapped: boolean;
}

/**
 * What happens when a character enters a hex: its hidden feature is revealed for
 * everyone; a hidden trap catches anyone but a scout (role tag `reveal`); a
 * scout also senses hidden features nearby, which glint. On a player view there
 * are no hidden features, so nothing is revealed there.
 */
export const enterHex = <S extends GameStateView>(
  state: S,
  characterId: string,
  h: Hex,
): EnterResult<S> => {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return { state, events: [], trapped: false };
  const scout = roleHas(character, 'reveal');
  const events: GameEvent[] = [];
  const features: Record<string, FeatureState> = { ...state.features };
  const glints: Record<string, true> = { ...state.glints };
  let trapped = false;

  const key = hexKey(h);
  const here = features[key];
  if (here && !here.revealed) {
    features[key] = { ...here, revealed: true };
    delete glints[key];
    events.push({ kind: 'reveal', hex: h, feature: here.type });
    if (featureType(here.type).kind === 'trap' && !scout) {
      trapped = true;
      events.push({ kind: 'trap', hex: h, characterId });
    }
  }
  if (scout) {
    for (const n of hexesInRange(h, state.config.senseRadius)) {
      const nKey = hexKey(n);
      if (hexDistance(n, h) === 0 || glints[nKey]) continue;
      if (features[nKey] && !features[nKey].revealed) {
        glints[nKey] = true;
        events.push({ kind: 'sense', hex: n });
      }
    }
  }
  let next: S = { ...state, features, glints };
  if (trapped) {
    next = {
      ...next,
      characters: state.characters.map((c) =>
        c.id === characterId ? { ...c, actionsLeft: 0 } : c,
      ),
    };
  }
  return { state: next, events, trapped };
};

/** Hidden features generated so far (server only), for tests and tools. */
export const hiddenFeatureKeys = (state: GameState): string[] =>
  Object.entries(state.features)
    .filter(([, f]) => !f.revealed)
    .map(([key]) => key);

export { keyToHex };
