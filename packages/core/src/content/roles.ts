/**
 * The six roles, as data. A character declares one when joining. Rules read a
 * role's tags, never its id: `survey` (Scout: surveys for less), `build`
 * (Engineer: works on unlocks), `sites` (Scholar: better chances, tier 2).
 * `perks` lists abilities that come later as upgrades: they are data only and
 * have no effect while `requiresUpgrade` is true. `icon` names the emblem.
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
      { id: 'trap-sense', name: 'Trap sense', tags: ['traps', 'immune'], requiresUpgrade: true },
      { id: 'glints', name: 'Glints', tags: ['sense', 'nearby'], requiresUpgrade: true },
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
    perks: [
      {
        id: 'double-yield',
        name: 'Double yield',
        tags: ['gather', 'yield'],
        requiresUpgrade: true,
      },
    ],
  },
  { id: 'envoy', name: 'Envoy', tags: ['peoples', 'trade'], icon: 'banner', perks: [] },
];
