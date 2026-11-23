/**
 * Skill trees, as data (docs/design/skill-trees.md). Each role has two branches (`a`
 * and `b`) of three tiers. A character earns XP by contributing (`ACTION_XP`) and
 * turns every `xpPerPick` XP into a pick, in their own tree or another role's tier 1.
 * Rules read a node's `effect` (a data hook with numbers and tags), never its id.
 * Only tier 1 is active in the first slice: tiers 2 and 3 are data, drawn veiled
 * and refused (`skill-veiled`). `icon` is `skill:<id>` for the art kit.
 */

export type SkillBranch = 'a' | 'b';
export type SkillTier = 1 | 2 | 3;

/** An action whose cost a skill can lower to a fixed number. */
export type SkillCostAction = 'work-site' | 'linger';

/** What a node does. Numbers are the node's own; base values come from the tuning config. */
export type SkillEffect =
  /** Entering a hidden trap's hex reveals it harmlessly (the same as surveying it). */
  | { readonly kind: 'trap-sense' }
  /** Unexplored hexes within `range` that hold a feature glint in this character's view only. */
  | { readonly kind: 'glints'; readonly range: number }
  /** The action costs `cost` (never more than its base cost). */
  | { readonly kind: 'action-cost'; readonly action: SkillCostAction; readonly cost: number }
  /** Working a site tagged `tag` has `bonus` more chance (for those who can work it at all). */
  | { readonly kind: 'site-chance'; readonly tag: string; readonly bonus: number }
  /** Gathering gives `amount` units (of materials tagged `tag`; any material when absent), within the pack's room. */
  | { readonly kind: 'gather-yield'; readonly amount: number; readonly tag?: string }
  /** A strike on a threat tagged `tag` takes `bonus` more off. */
  | { readonly kind: 'strike-bonus'; readonly tag: string; readonly bonus: number }
  /** Each strike on the creature is reduced by `amount` for this defender (not less than the base). */
  | { readonly kind: 'defend-reduction'; readonly amount: number }
  /** Each build action adds `amount` work. */
  | { readonly kind: 'build-work'; readonly amount: number }
  /** A parley gains `bonus` more favour. */
  | { readonly kind: 'parley-favour'; readonly bonus: number }
  /** A parley reaches a settlement up to `range` hexes away. */
  | { readonly kind: 'parley-range'; readonly range: number }
  /** A later tier: no rule reads it yet. */
  | { readonly kind: 'veiled' };

export interface SkillNode {
  /** `<role>-<branch><tier>`, for example `scout-a1`. */
  readonly id: string;
  /** Shown for active nodes; the interface keeps a veiled node's name hidden. */
  readonly name: string;
  /** A role id (`ROLES`). */
  readonly role: string;
  readonly branch: SkillBranch;
  readonly tier: SkillTier;
  /** `skill:<id>`. */
  readonly icon: string;
  /** Tiers 2 and 3 are not pickable yet. */
  readonly active: boolean;
  readonly effect: SkillEffect;
}

const node = (
  role: string,
  branch: SkillBranch,
  tier: SkillTier,
  name: string,
  effect: SkillEffect = { kind: 'veiled' },
): SkillNode => ({
  id: `${role}-${branch}${tier}`,
  name,
  role,
  branch,
  tier,
  icon: `skill:${role}-${branch}${tier}`,
  active: tier === 1,
  effect,
});

export const SKILL_NODES: readonly SkillNode[] = [
  node('scout', 'a', 1, 'Trap sense', { kind: 'trap-sense' }),
  node('scout', 'a', 2, 'Long survey'),
  node('scout', 'a', 3, 'Sweep'),
  node('scout', 'b', 1, 'Glints', { kind: 'glints', range: 2 }),
  node('scout', 'b', 2, 'Far sight'),
  node('scout', 'b', 3, 'Forecast'),

  node('scholar', 'a', 1, 'Field kit', { kind: 'action-cost', action: 'work-site', cost: 1 }),
  node('scholar', 'a', 2, 'Steady hands'),
  node('scholar', 'a', 3, 'Second chamber'),
  node('scholar', 'b', 1, 'Lamplight', { kind: 'site-chance', tag: 'dark', bonus: 0.2 }),
  node('scholar', 'b', 2, 'Relic sense'),
  node('scholar', 'b', 3, 'Old maps'),

  node('keeper', 'a', 1, 'Good forage', { kind: 'gather-yield', amount: 2, tag: 'food' }),
  node('keeper', 'a', 2, 'Soothing herbs'),
  node('keeper', 'a', 3, 'Contented'),
  node('keeper', 'b', 1, 'Quiet linger', { kind: 'action-cost', action: 'linger', cost: 1 }),
  node('keeper', 'b', 2, 'Hurry'),
  node('keeper', 'b', 3, 'Beacon'),

  node('engineer', 'a', 1, 'Double yield', { kind: 'gather-yield', amount: 2 }),
  node('engineer', 'a', 2, 'Pack mule'),
  node('engineer', 'a', 3, 'Monkey drone'),
  node('engineer', 'b', 1, 'Quick hands', { kind: 'build-work', amount: 2 }),
  node('engineer', 'b', 2, 'Thrift'),
  node('engineer', 'b', 3, 'Self-winding'),

  // Warden: shield (a, from the old guardian) or word (b, from the old envoy).
  node('warden', 'a', 1, 'Bulwark', { kind: 'defend-reduction', amount: 3 }),
  node('warden', 'a', 2, 'Wide guard'),
  node('warden', 'a', 3, 'Standing guard'),
  node('warden', 'b', 1, 'Silver tongue', { kind: 'parley-favour', bonus: 1 }),
  node('warden', 'b', 2, 'Ravens'),
  node('warden', 'b', 3, 'Allies'),
];

/**
 * The XP an action earns its actor, whoever does it and whatever the role: any act that contributes
 * counts. Moving is not listed (it earns nothing) and neither is `pick-skill`. A refused action earns
 * none. Scouts also earn for newly explored hexes (`Role.exploreXp`).
 */
export const ACTION_XP: Readonly<Record<string, number>> = {
  survey: 1,
  gather: 1,
  build: 1,
  'work-site': 1,
  feed: 1,
  linger: 1,
  'light-fire': 1,
  strike: 1,
  defend: 1,
  parley: 1,
  offer: 1,
  'ask-boon': 1,
};
