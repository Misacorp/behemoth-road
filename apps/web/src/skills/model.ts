/**
 * The skill tree's model, from the core's own helpers (`pickRefusal`, `picksAvailable`) run on the view: the
 * state of each node, the paths between them, the tabs for the other roles and the HUD emblem's ring (XP). Pure,
 * so every state is tested here; the drawer only draws it. There is no second copy of the rules.
 */
import type { BranchPathState, SkillState } from '@behemoth-road/art';
import {
  type Character,
  type GameStateView,
  type PickRefusal,
  pickRefusal,
  picksAvailable,
  ROLES,
  SKILL_NODES,
  type SkillNode,
} from '@behemoth-road/core';
import { whyOfPick } from '../game/why.ts';
import { press } from '../map/arm.ts';
import type { TipId } from '../text/tips.ts';
import { tipFor } from '../ui/tip.ts';

/** One node of a tree: how to draw it and why it cannot be taken (null when it can). */
export interface NodeView {
  readonly node: SkillNode;
  readonly state: SkillState;
  readonly refusal: PickRefusal | null;
}

/** One branch: its nodes by tier and the path leading into each. */
export interface BranchView {
  readonly branch: 'a' | 'b';
  readonly nodes: readonly NodeView[];
  /** `paths[i]` leads into `nodes[i]` (from the emblem for tier 1). */
  readonly paths: readonly BranchPathState[];
  /** The other branch was chosen: this one is faded, its path cut. */
  readonly closed: boolean;
}

/** The state a node draws in: taken, available, closed (the other branch), veiled (a later tier) or plain. */
export function nodeState(refusal: PickRefusal | null): SkillState {
  if (refusal === null) return 'available';
  if (refusal === 'already-have') return 'taken';
  if (refusal === 'branch-closed') return 'closed';
  if (refusal === 'skill-veiled') return 'veiled';
  return 'plain';
}

export function nodeView(state: GameStateView, me: Character, node: SkillNode): NodeView {
  const refusal = pickRefusal(state, me, node.id);
  return { node, state: nodeState(refusal), refusal };
}

const nodesOf = (role: string): readonly SkillNode[] => SKILL_NODES.filter((n) => n.role === role);

/** A role's tree as two branches. Another role's tree shows tier 1 only (`tier1Only`). */
export function treeOf(
  state: GameStateView,
  me: Character,
  role: string,
  tier1Only = false,
): readonly BranchView[] {
  return (['a', 'b'] as const).map((branch): BranchView => {
    const all = nodesOf(role)
      .filter((n) => n.branch === branch && (!tier1Only || n.tier === 1))
      .sort((x, y) => x.tier - y.tier)
      .map((n) => nodeView(state, me, n));
    const closed = all.some((n) => n.state === 'closed');
    const paths = all.map((n, i): BranchPathState => {
      if (closed) return 'closed';
      return n.state === 'taken' && (i === 0 || all[i - 1]?.state === 'taken') ? 'taken' : 'open';
    });
    return { branch, nodes: all, paths, closed };
  });
}

/** The tip a node shows: its own when it can be taken or is taken, else the reason it cannot. */
export function nodeTip(n: NodeView): TipId | null {
  if (n.state === 'available' || n.state === 'taken') return tipFor('skill', n.node.id);
  return n.refusal === null ? null : whyOfPick(n.refusal);
}

/**
 * What a tap on a node does, given the node armed before it: an available node arms on the first tap and is
 * sent on the second; any other node never arms and never sends (its tap shows its tip, in the press layer).
 */
export function tapNode(
  armed: string | null,
  n: NodeView,
): { readonly armed: string | null; readonly send: string | null } {
  const next = press(armed, n.node.id, n.state === 'available');
  return { armed: next.armed, send: next.run ? n.node.id : null };
}

/** A tab: one role's tree, and whether a node of it can be taken now. */
export interface TabView {
  readonly role: string;
  readonly mine: boolean;
  readonly ready: boolean;
}

export function tabsOf(state: GameStateView, me: Character): readonly TabView[] {
  return ROLES.map((r) => ({
    role: r.id,
    mine: r.id === me.role,
    ready: nodesOf(r.id).some((n) => pickRefusal(state, me, n.id) === null),
  }));
}

/** The tabs in drawing order: your own role first, then the rest in content order. */
export const orderedTabs = (state: GameStateView, me: Character): readonly TabView[] =>
  [...tabsOf(state, me)].sort((x, y) => Number(y.mine) - Number(x.mine));

/** A pick is ready: some node, in any tree, can be taken now. */
export const pickReady = (state: GameStateView, me: Character): boolean =>
  tabsOf(state, me).some((t) => t.ready);

/**
 * The ring on your emblem: XP toward the next pick (0 to `perPick`, which is `xpPerPick`; the field is
 * still `notches`, the marks of the ring). A full ring means a pick is ready; a pick that cannot be spent
 * (every open node taken) leaves it one short.
 */
export function ringOf(
  state: GameStateView,
  me: Character,
): { readonly notches: number; readonly perPick: number } {
  const per = state.config.xpPerPick;
  const toward = me.skills.xp - me.skills.taken.length * per;
  const spare = picksAvailable(state, me) > 0 && !pickReady(state, me);
  return { notches: Math.max(0, Math.min(spare ? per - 1 : per, toward)), perPick: per };
}
