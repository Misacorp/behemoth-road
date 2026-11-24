/**
 * Skill trees, as data (docs/design/skill-trees.md). Each role has two branches (`a`
 * and `b`) of three tiers. A character earns XP by contributing (`ACTION_XP`) and
 * turns every `xpPerPick` XP into a pick, in their own tree or another role's tier 1.
 * Rules read a node's `effect` (a data hook with numbers and tags), never its id.
 * Every node is active. A node with `active: false` (none now) would be drawn veiled and refused
 * (`skill-veiled`). `icon` is `skill:<id>` for the art kit.
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
  /** Working a site (tagged `tag`, any site when absent) has `bonus` more chance (for those who can work it at all). */
  | { readonly kind: 'site-chance'; readonly tag?: string; readonly bonus: number }
  /** Surveying reaches known hexes up to `range` away (not only the next ones). */
  | { readonly kind: 'survey-range'; readonly range: number }
  /** At each tick, up to `count` unexplored known hexes next to this character are explored for everyone (no XP). */
  | { readonly kind: 'sweep'; readonly count: number }
  /** A site this character opens gives `amount` more of its find (within the pack's room). */
  | { readonly kind: 'site-finds'; readonly amount: number }
  /** A find has this `chance` of one extra unit of a material tagged `tag` (a seeded pick among them). */
  | { readonly kind: 'find-bonus'; readonly tag: string; readonly chance: number }
  /** Each find reveals the nearest unexplored site within `range` of the finder, for everyone. */
  | { readonly kind: 'reveal-site'; readonly range: number }
  /** Feeding also lowers peril by `amount`, once a day. */
  | { readonly kind: 'feed-calm'; readonly amount: number }
  /** While this character is in the game, the creature's hunger drains only every `everyDays` days. */
  | { readonly kind: 'hunger-slow'; readonly everyDays: number }
  /** The day-after cooldown on lingering does not apply to this character. */
  | { readonly kind: 'linger-chain' }
  /** Fires this character lights reach `range` hexes and push `push` times as hard. */
  | { readonly kind: 'fire-boost'; readonly range: number; readonly push: number }
  /** While this character is in the game, threat trails show `days` ticks ahead, for everyone. */
  | { readonly kind: 'forecast'; readonly days: number }
  /** This character's pack holds `capacity` units (never fewer than the base). */
  | { readonly kind: 'pack-size'; readonly capacity: number }
  /** At each tick, `amount` unit gathered from a node beside the creature into the stores. */
  | { readonly kind: 'drone'; readonly amount: number }
  /** Starting an unlock costs `amount` less of its largest material (never to nothing). */
  | { readonly kind: 'build-discount'; readonly amount: number }
  /** At each tick the unlock in progress gains `amount` work. */
  | { readonly kind: 'build-tick'; readonly amount: number }
  /** A rider with this defends at every tick, with no action. */
  | { readonly kind: 'defend-tick' }
  /** A strike reaches threats up to `range` hexes away. */
  | { readonly kind: 'strike-range'; readonly range: number }
  /** An escorting character's cover reaches `range` hexes. */
  | { readonly kind: 'escort-range'; readonly range: number }
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
  /** A node no rule reads yet (kept for future tiers). */
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
  /** False: not pickable (drawn veiled). */
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
  active: effect.kind !== 'veiled',
  effect,
});

export const SKILL_NODES: readonly SkillNode[] = [
  node('scout', 'a', 1, 'Trap sense', { kind: 'trap-sense' }),
  node('scout', 'a', 2, 'Long survey', { kind: 'survey-range', range: 2 }),
  node('scout', 'a', 3, 'Sweep', { kind: 'sweep', count: 2 }),
  node('scout', 'b', 1, 'Glints', { kind: 'glints', range: 2 }),
  node('scout', 'b', 2, 'Far sight', { kind: 'glints', range: 4 }),
  node('scout', 'b', 3, 'Forecast', { kind: 'forecast', days: 2 }),

  node('scholar', 'a', 1, 'Field kit', { kind: 'action-cost', action: 'work-site', cost: 1 }),
  node('scholar', 'a', 2, 'Steady hands', { kind: 'site-chance', bonus: 0.15 }),
  node('scholar', 'a', 3, 'Second chamber', { kind: 'site-finds', amount: 1 }),
  node('scholar', 'b', 1, 'Lamplight', { kind: 'site-chance', tag: 'dark', bonus: 0.2 }),
  node('scholar', 'b', 2, 'Relic sense', { kind: 'find-bonus', tag: 'rare', chance: 1 / 3 }),
  node('scholar', 'b', 3, 'Old maps', { kind: 'reveal-site', range: 4 }),

  node('keeper', 'a', 1, 'Good forage', { kind: 'gather-yield', amount: 2, tag: 'food' }),
  node('keeper', 'a', 2, 'Soothing herbs', { kind: 'feed-calm', amount: 1 }),
  node('keeper', 'a', 3, 'Contented', { kind: 'hunger-slow', everyDays: 2 }),
  node('keeper', 'b', 1, 'Quiet linger', { kind: 'action-cost', action: 'linger', cost: 1 }),
  node('keeper', 'b', 2, 'Long rest', { kind: 'linger-chain' }),
  node('keeper', 'b', 3, 'Beacon', { kind: 'fire-boost', range: 5, push: 2 }),

  node('engineer', 'a', 1, 'Double yield', { kind: 'gather-yield', amount: 2 }),
  node('engineer', 'a', 2, 'Pack mule', { kind: 'pack-size', capacity: 10 }),
  node('engineer', 'a', 3, 'Monkey drone', { kind: 'drone', amount: 1 }),
  node('engineer', 'b', 1, 'Quick hands', { kind: 'build-work', amount: 2 }),
  node('engineer', 'b', 2, 'Thrift', { kind: 'build-discount', amount: 1 }),
  node('engineer', 'b', 3, 'Self-winding', { kind: 'build-tick', amount: 1 }),

  // Warden: stand fast (a: act on the spot) or range out (b: act at a distance). Each branch has
  // protection and diplomacy, so the fork is a style, not half the role. (Merged from guardian and envoy.)
  node('warden', 'a', 1, 'Bulwark', { kind: 'defend-reduction', amount: 3 }),
  node('warden', 'a', 2, 'Silver tongue', { kind: 'parley-favour', bonus: 1 }),
  node('warden', 'a', 3, 'Standing guard', { kind: 'defend-tick' }),
  node('warden', 'b', 1, 'Ravens', { kind: 'parley-range', range: 3 }),
  node('warden', 'b', 2, 'Long reach', { kind: 'strike-range', range: 2 }),
  node('warden', 'b', 3, 'Wide guard', { kind: 'escort-range', range: 2 }),
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
