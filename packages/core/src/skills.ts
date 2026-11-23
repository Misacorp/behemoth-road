/**
 * Skills: XP earned by contributing, picks, and what the taken nodes do. Rules
 * read a node's `effect` (`content/skills.ts`), never its id. A pick is free (no
 * actions), takes effect at once and lasts for the season.
 *
 * Picks available = floor(xp / `xpPerPick`) - nodes taken. The first node taken in a
 * role's tree chooses its branch and closes the other for good. Another role's tree
 * is open to tier 1 only.
 */

import {
  ACTION_XP,
  ROLES,
  SKILL_NODES,
  type SkillEffect,
  type SkillNode,
} from './content/index.ts';
import { type Hex, hexDistance, hexesInRange, hexKey } from './hex.ts';
import type { Character, GameState, GameStateView } from './state.ts';

/** Why a pick is refused (a subset of the core's action refusals). */
export type PickRefusal =
  | 'unknown-skill'
  | 'skill-veiled'
  | 'already-have'
  | 'no-pick'
  | 'branch-closed'
  | 'skill-tier-order'
  | 'skill-tier-limit';

export const skillNode = (id: string): SkillNode | undefined =>
  SKILL_NODES.find((n) => n.id === id);

/** The nodes a character has taken. */
export const takenNodes = (c: Character): SkillNode[] =>
  c.skills.taken.flatMap((id) => {
    const n = skillNode(id);
    return n ? [n] : [];
  });

/** The effects of one kind among a character's taken nodes. */
export const effectsOf = <K extends SkillEffect['kind']>(
  c: Character,
  kind: K,
): Extract<SkillEffect, { kind: K }>[] =>
  takenNodes(c).flatMap((n) =>
    n.effect.kind === kind ? [n.effect as Extract<SkillEffect, { kind: K }>] : [],
  );

/** The largest `pick(effect)` over a character's effects of a kind, or null when it has none. */
export const bestOf = <K extends SkillEffect['kind']>(
  c: Character,
  kind: K,
  pick: (effect: Extract<SkillEffect, { kind: K }>) => number,
): number | null => {
  const values = effectsOf(c, kind).map(pick);
  return values.length > 0 ? Math.max(...values) : null;
};

/** XP an action earns its actor (0 for moving, picking and anything not listed). */
export const actionXp = (kind: string): number => ACTION_XP[kind] ?? 0;

/** XP for the hexes an actor newly explored: their role's `exploreXp` each. */
export const exploreXpFor = (role: string, explored: number): number =>
  (ROLES.find((r) => r.id === role)?.exploreXp ?? 0) * explored;

/** More XP for a character (none when `amount` is 0). */
export const withXp = <C extends Character>(c: C, amount: number): C =>
  amount === 0 ? c : { ...c, skills: { ...c.skills, xp: c.skills.xp + amount } };

/**
 * The state with the actor's XP for an action (`kind` null for a move) and for the hexes the events
 * show newly explored (scouts only). Callers have checked the action was allowed.
 */
export const earnXp = <S extends GameStateView>(
  state: S,
  characterId: string,
  kind: string | null,
  events: readonly { readonly kind: string }[],
): S => {
  const actor = state.characters.find((c) => c.id === characterId);
  if (!actor) return state;
  const explored = events.filter((e) => e.kind === 'explore').length;
  const amount = (kind === null ? 0 : actionXp(kind)) + exploreXpFor(actor.role, explored);
  if (amount === 0) return state;
  return {
    ...state,
    characters: state.characters.map((c) => (c.id === characterId ? withXp(c, amount) : c)),
  };
};

/** Picks a character has earned and not yet spent (XP / `xpPerPick`, less the nodes taken). */
export const picksAvailable = (state: GameStateView, c: Character): number =>
  Math.floor(c.skills.xp / state.config.xpPerPick) - c.skills.taken.length;

/**
 * Why a character cannot take a node now, or null if it can. `planning` (the out-of-game wiki's build
 * planner, never the game) treats a node that is not active yet as pickable by the same rules.
 */
export const pickRefusal = (
  state: GameStateView,
  c: Character,
  nodeId: string,
  planning = false,
): PickRefusal | null => {
  const node = skillNode(nodeId);
  if (!node) return 'unknown-skill';
  if (!node.active && !planning) return 'skill-veiled';
  if (c.skills.taken.includes(node.id)) return 'already-have';
  const own = takenNodes(c).filter((n) => n.role === node.role);
  if (own.some((n) => n.branch !== node.branch)) return 'branch-closed';
  if (c.role !== node.role && node.tier > 1) return 'skill-tier-limit';
  // Each tier needs the one below it in the same branch.
  if (node.tier > 1 && !own.some((n) => n.branch === node.branch && n.tier === node.tier - 1)) {
    return 'skill-tier-order';
  }
  if (picksAvailable(state, c) < 1) return 'no-pick';
  return null;
};

/** A character with the node taken. Callers check `pickRefusal` first. */
export const withSkill = <C extends Character>(c: C, nodeId: string): C => ({
  ...c,
  skills: { ...c.skills, taken: [...c.skills.taken, nodeId] },
});

/**
 * Hexes from a character's place: the hex itself, or for a rider the distance to the creature's
 * footprint (0 under it).
 */
export const distanceFrom = (state: GameStateView, c: Character, h: Hex): number =>
  c.at.kind === 'hex'
    ? hexDistance(c.at.hex, h)
    : Math.max(0, hexDistance(state.creature.centre, h) - state.config.creatureRadius);

/**
 * Hexes that glint for one viewer: unexplored known hexes within a glints node's range of their
 * character that hold a feature (hidden or not, never which). Server only: it reads hidden
 * features. Never part of the shared view.
 */
export const glintsFor = (state: GameState, characterId: string | null): Hex[] => {
  const c = characterId === null ? undefined : state.characters.find((x) => x.id === characterId);
  if (!c || c.status !== 'active') return [];
  const range = bestOf(c, 'glints', (e) => e.range);
  if (range === null) return [];
  const centre = c.at.kind === 'hex' ? c.at.hex : state.creature.centre;
  const reach = c.at.kind === 'hex' ? range : range + state.config.creatureRadius;
  return hexesInRange(centre, reach)
    .filter((h) => {
      const key = hexKey(h);
      const tile = state.tiles[key];
      return tile !== undefined && !tile.explored && state.features[key] !== undefined;
    })
    .sort((a, b) => a.q - b.q || a.r - b.r);
};
