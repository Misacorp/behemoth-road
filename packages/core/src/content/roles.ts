/**
 * The six roles, as data. A character declares one when joining. Rules read a
 * role's tags, never its id: `survey` (Scout: surveys for less), `build`
 * (Engineer: works on unlocks), `sites` (Scholar: better chances, tier 2).
 * `perks` lists abilities that come later as upgrades: they are data only and
 * have no effect while `requiresUpgrade` is true (trap sense, glints and double
 * yield became skill nodes in `skills.ts`; far sight waits for scout tier 2). `icon` names the emblem.
 */

export interface Perk {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  /** Not active until the character earns the upgrade (a later milestone). */
  readonly requiresUpgrade: true;
}

export interface Role {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
  readonly perks: readonly Perk[];
}

export const ROLES: readonly Role[] = [
  {
    id: 'scout',
    name: 'Scout',
    tags: ['explore', 'survey'],
    icon: 'spyglass',
    perks: [
      // Sees threats beyond the window's edge, before they appear in it.
      { id: 'far-sight', name: 'Far sight', tags: ['sense', 'threats'], requiresUpgrade: true },
    ],
  },
  { id: 'scholar', name: 'Scholar', tags: ['sites', 'lore'], icon: 'book', perks: [] },
  { id: 'keeper', name: 'Keeper', tags: ['creature', 'tend'], icon: 'crook', perks: [] },
  { id: 'guardian', name: 'Guardian', tags: ['defend', 'escort'], icon: 'shield', perks: [] },
  {
    id: 'engineer',
    name: 'Engineer',
    tags: ['build', 'gather'],
    icon: 'hammer',
    perks: [],
  },
  { id: 'envoy', name: 'Envoy', tags: ['peoples', 'trade'], icon: 'banner', perks: [] },
];
