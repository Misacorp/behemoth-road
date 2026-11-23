/**
 * The wiki's build planner, as pure functions. Every rule comes from the core's own `pickRefusal` run on a
 * mock character (in planning mode, which also lets a node that is not active be picked); there is no second
 * copy of the rules. The plan is a list of picks in order, your own role, and a URL hash that carries both.
 */
import type { BranchPathState, SkillState } from '@behemoth-road/art';
import {
  type Character,
  DEFAULT_CONFIG,
  DEFAULT_STANCE,
  type GameStateView,
  ON_CREATURE,
  type PickRefusal,
  pickRefusal,
  ROLES,
  SKILL_NODES,
  type SkillNode,
} from '@behemoth-road/core';

/**
 * The planner's one assumption for the time estimate: XP an active player earns a day (about one XP for
 * each of the three actions a day, less the days spent moving, lingering or away). A guess, tuned by play.
 */
export const WIKI_XP_PER_DAY = 3;

/** XP for one pick on a full season (the game's own tuning). */
export const XP_PER_PICK = DEFAULT_CONFIG.xpPerPick;

export interface Plan {
  /** The role whose tree is yours (a role id). */
  readonly me: string;
  /** Node ids, in the order they were picked. */
  readonly picks: readonly string[];
}

export const roleIds = (): readonly string[] => ROLES.map((r) => r.id);

export const emptyPlan = (me: string = roleIds()[0] ?? ''): Plan => ({ me, picks: [] });

/** The nodes of one role, in tier order within each branch. */
export const nodesOf = (role: string): readonly SkillNode[] =>
  SKILL_NODES.filter((n) => n.role === role).sort(
    (x, y) => x.branch.localeCompare(y.branch) || x.tier - y.tier,
  );

// The core reads only the config (picksAvailable) and the character; the rest of a game is not needed.
const PLANNING_STATE = { config: DEFAULT_CONFIG } as unknown as GameStateView;

const mockCharacter = (role: string, taken: readonly string[]): Character => ({
  id: 'planner',
  userId: 'planner',
  name: 'Planner',
  trait: null,
  quirk: null,
  role,
  lookSeed: 0,
  joinedDay: 0,
  at: ON_CREATURE,
  actionsLeft: 0,
  pack: {},
  status: 'active',
  struckDay: null,
  stance: DEFAULT_STANCE,
  waiting: false,
  // Plenty of XP: the planner counts the cost, it does not limit the picks.
  skills: { xp: SKILL_NODES.length * XP_PER_PICK, taken: [...taken] },
});

/** Why the node cannot be added to these picks for this role, or null when it can. */
export const refusalOf = (me: string, picks: readonly string[], id: string): PickRefusal | null =>
  pickRefusal(PLANNING_STATE, mockCharacter(me, picks), id, true);

/** The picks that are valid in order, dropping any that are not (for example after changing role). */
export function validPicks(me: string, picks: readonly string[]): string[] {
  const kept: string[] = [];
  for (const id of picks) if (refusalOf(me, kept, id) === null) kept.push(id);
  return kept;
}

/** Take a node out of the plan, with every higher tier of its branch that depended on it. */
export function withoutPick(plan: Plan, id: string): Plan {
  const node = SKILL_NODES.find((n) => n.id === id);
  if (!node) return plan;
  const picks = plan.picks.filter((p) => {
    const other = SKILL_NODES.find((n) => n.id === p);
    return !(
      other &&
      other.role === node.role &&
      other.branch === node.branch &&
      other.tier >= node.tier
    );
  });
  return { ...plan, picks };
}

/** A tap on a node: a picked one comes out, a pickable one goes in, any other leaves the plan as it was. */
export function togglePick(plan: Plan, id: string): Plan {
  if (plan.picks.includes(id)) return withoutPick(plan, id);
  if (refusalOf(plan.me, plan.picks, id) !== null) return plan;
  return { ...plan, picks: [...plan.picks, id] };
}

/** Make another role's tree yours; picks that no longer fit (a deeper tier of another role) drop out. */
export const withRole = (plan: Plan, me: string): Plan =>
  roleIds().includes(me) ? { me, picks: validPicks(me, plan.picks) } : plan;

/** What the plan costs: picks, XP and days of play at `xpPerDay` (the one assumption, `WIKI_XP_PER_DAY`). */
export function costOf(
  plan: Plan,
  xpPerDay: number = WIKI_XP_PER_DAY,
): { readonly picks: number; readonly xp: number; readonly days: number } {
  const picks = plan.picks.length;
  const xp = picks * XP_PER_PICK;
  return { picks, xp, days: Math.ceil(xp / xpPerDay) };
}

/** One node as the page draws it. Planned tiers draw as plain, available or taken like active ones. */
export interface WikiNode {
  readonly node: SkillNode;
  readonly state: SkillState;
}

export interface WikiBranch {
  readonly branch: 'a' | 'b';
  readonly nodes: readonly WikiNode[];
  /** `paths[i]` leads into `nodes[i]`. */
  readonly paths: readonly BranchPathState[];
  readonly closed: boolean;
}

export function stateOf(plan: Plan, node: SkillNode): SkillState {
  const refusal = refusalOf(plan.me, plan.picks, node.id);
  if (refusal === null) return 'available';
  if (refusal === 'already-have') return 'taken';
  if (refusal === 'branch-closed') return 'closed';
  return 'plain';
}

/** A role's tree as two branches, with the plan applied. */
export function treeOf(plan: Plan, role: string): readonly WikiBranch[] {
  return (['a', 'b'] as const).map((branch): WikiBranch => {
    const nodes = nodesOf(role)
      .filter((n) => n.branch === branch)
      .map((node): WikiNode => ({ node, state: stateOf(plan, node) }));
    const closed = nodes.some((n) => n.state === 'closed');
    const paths = nodes.map((n, i): BranchPathState => {
      if (closed) return 'closed';
      return n.state === 'taken' && (i === 0 || nodes[i - 1]?.state === 'taken') ? 'taken' : 'open';
    });
    return { branch, nodes, paths, closed };
  });
}

const ID_PART = /^[ab][123]$/;

/**
 * The hash for a plan: `#me=keeper;scout:a1,a2;keeper:a1` (`me=` only when your role is not the first, a
 * role's picks in order). Empty for an empty plan on the first role.
 */
export function formatHash(plan: Plan): string {
  const parts: string[] = [];
  if (plan.me !== roleIds()[0]) parts.push(`me=${plan.me}`);
  for (const role of roleIds()) {
    const own = plan.picks.filter((id) => SKILL_NODES.find((n) => n.id === id)?.role === role);
    if (own.length > 0) {
      parts.push(`${role}:${own.map((id) => id.slice(role.length + 1)).join(',')}`);
    }
  }
  return parts.length === 0 ? '' : `#${parts.join(';')}`;
}

/**
 * Reads a hash strictly: anything unknown, repeated, out of order or against the rules makes the whole hash
 * invalid (null), so a mangled link shows an empty plan rather than half of one. An empty hash is an empty plan.
 */
export function parseHash(hash: string): Plan | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (text === '') return emptyPlan();
  if (text.length > 400) return null;
  const roles = roleIds();
  let me = roles[0] ?? '';
  const seen = new Set<string>();
  const picks: string[] = [];
  for (const [i, part] of text.split(';').entries()) {
    if (part.startsWith('me=')) {
      const role = part.slice(3);
      if (i !== 0 || !roles.includes(role)) return null;
      me = role;
      continue;
    }
    const [role, list, ...rest] = part.split(':');
    if (rest.length > 0 || role === undefined || list === undefined) return null;
    if (!roles.includes(role) || seen.has(role)) return null;
    seen.add(role);
    for (const piece of list.split(',')) {
      if (!ID_PART.test(piece)) return null;
      picks.push(`${role}-${piece}`);
    }
  }
  if (new Set(picks).size !== picks.length) return null;
  // Every pick must be allowed in order: the core's rules decide.
  const kept: string[] = [];
  for (const id of picks) {
    if (refusalOf(me, kept, id) !== null) return null;
    kept.push(id);
  }
  return { me, picks: kept };
}
