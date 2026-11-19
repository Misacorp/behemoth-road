/**
 * The six roles, as data. A character declares one when joining; roles have no
 * mechanics yet (Milestone 3 adds them). `icon` names the emblem the interface draws.
 */

export interface Role {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
}

export const ROLES: readonly Role[] = [
  { id: 'scout', name: 'Scout', tags: ['explore', 'reveal'], icon: 'spyglass' },
  { id: 'scholar', name: 'Scholar', tags: ['sites', 'lore'], icon: 'book' },
  { id: 'keeper', name: 'Keeper', tags: ['creature', 'tend'], icon: 'crook' },
  { id: 'guardian', name: 'Guardian', tags: ['defend', 'escort'], icon: 'shield' },
  { id: 'engineer', name: 'Engineer', tags: ['gather', 'craft'], icon: 'hammer' },
  { id: 'envoy', name: 'Envoy', tags: ['peoples', 'trade'], icon: 'banner' },
];
