/**
 * The five roles, as data. A character declares one when joining. Rules read a
 * role's tags, never its id: `survey` (Scout: surveys for less), `build`
 * (Engineer: works on unlocks), `sites` (Scholar: better chances, tier 2), `defend` and `escort` (Warden: fights and
 * shields), `peoples` and `trade` (Warden: parleys for more, without risk).
 * `perks` lists abilities that come later as upgrades: they are data only and
 * have no effect while `requiresUpgrade` is true (trap sense, glints and double
 * yield became skill nodes in `skills.ts`; far sight waits for scout tier 2). `icon` names the emblem.
 */

import type { SkillEffect } from './skills.ts';

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
  /** XP earned for each hex this character newly explores (walking into it or surveying it). */
  readonly exploreXp: number;
  /** Effects the role has from the start, read like a skill node's (`effectsOf`). */
  readonly effects?: readonly SkillEffect[];
}

export const ROLES: readonly Role[] = [
  {
    id: 'scout',
    name: 'Scout',
    tags: ['explore', 'survey'],
    icon: 'spyglass',
    exploreXp: 1,
    perks: [
      // Sees threats beyond the window's edge, before they appear in it.
      { id: 'far-sight', name: 'Far sight', tags: ['sense', 'threats'], requiresUpgrade: true },
    ],
  },
  {
    id: 'scholar',
    name: 'Scholar',
    tags: ['sites', 'lore'],
    icon: 'book',
    perks: [],
    exploreXp: 0,
  },
  {
    id: 'keeper',
    name: 'Keeper',
    tags: ['creature', 'tend'],
    icon: 'crook',
    perks: [],
    exploreXp: 0,
  },
  {
    id: 'engineer',
    name: 'Engineer',
    tags: ['build', 'gather'],
    icon: 'hammer',
    perks: [],
    exploreXp: 0,
    // Stonework: half as likely as anyone to be caught by a falling slide.
    effects: [{ kind: 'sure-footed', tag: 'falls', factor: 0.5 }],
  },
  {
    id: 'warden',
    name: 'Warden',
    tags: ['defend', 'escort', 'peoples', 'trade'],
    icon: 'shield',
    perks: [],
    exploreXp: 0,
  },
];
