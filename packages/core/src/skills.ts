/**
 * Skills: notches earned by working, picks, and what the taken nodes do. Rules
 * read a node's `effect` (`content/skills.ts`), never its id. A pick is free (no
 * actions), takes effect at once and lasts for the season.
 *
 * Picks available in a role = floor(notches / `notchesPerPick`) - nodes taken in
 * that role. The first node taken in a role's tree chooses its branch and closes
 * the other for good. Another role's tree is open to tier 1 only.
 */

import {
  FOOD_WORK,
  ROLES,
  SKILL_NODES,
  type SkillEffect,
  type SkillNode,
  WORK_TAGS,
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

/** The role (id) whose work carries this role tag, if any. */
export const roleWithTag = (tag: string): string | undefined =>
  ROLES.find((r) => r.tags.includes(tag))?.id;

/**
 * The role that owns the work of an action: the notch goes to it. `foodNode`: a gather at a
 * node whose material is food. Null for moving, picking and anything not listed.
 */
export const workRole = (kind: string, foodNode: boolean): string | null => {
  const tag = kind === 'gather' && foodNode ? FOOD_WORK.roleTag : WORK_TAGS[kind];
  return tag ? (roleWithTag(tag) ?? null) : null;
};

/** One more notch in a role. */
export const withNotch = <C extends Character>(c: C, role: string): C => ({
  ...c,
  skills: {
    ...c.skills,
    notches: { ...c.skills.notches, [role]: (c.skills.notches[role] ?? 0) + 1 },
  },
});

/** Picks a character could still make in a role's tree. */
export const picksAvailable = (state: GameStateView, c: Character, role: string): number => {
  const earned = Math.floor((c.skills.notches[role] ?? 0) / state.config.notchesPerPick);
  return earned - takenNodes(c).filter((n) => n.role === role).length;
};

/** Why a character cannot take a node now, or null if it can. */
export const pickRefusal = (
  state: GameStateView,
  c: Character,
  nodeId: string,
): PickRefusal | null => {
  const node = skillNode(nodeId);
  if (!node) return 'unknown-skill';
  if (!node.active) return 'skill-veiled';
  if (c.skills.taken.includes(node.id)) return 'already-have';
  const own = takenNodes(c).filter((n) => n.role === node.role);
  if (own.some((n) => n.branch !== node.branch)) return 'branch-closed';
  if (c.role !== node.role && node.tier > 1) return 'skill-tier-limit';
  // Each tier needs the one below it in the same branch.
  if (node.tier > 1 && !own.some((n) => n.branch === node.branch && n.tier === node.tier - 1)) {
    return 'skill-tier-order';
  }
  if (picksAvailable(state, c, node.role) < 1) return 'no-pick';
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
