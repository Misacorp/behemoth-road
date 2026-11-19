/**
 * Character traits and quirks, as tagged data. A trait is a plain strength. A
 * quirk helps the character in one way and hinders them in another, and touches
 * only that character. Neither has mechanics yet; rules will read the tags, never
 * the ids. Names are short; the interface shows `icon`, not prose.
 */

export interface Trait {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly icon: string;
}

export interface Quirk {
  readonly id: string;
  readonly name: string;
  /** What the quirk makes the character better at. */
  readonly helps: readonly string[];
  /** What it makes them worse at. */
  readonly hinders: readonly string[];
  readonly icon: string;
}

export const TRAITS: readonly Trait[] = [
  { id: 'sure-footed', name: 'Sure-footed', tags: ['move', 'terrain:steep'], icon: 'boot' },
  { id: 'sand-born', name: 'Sand-born', tags: ['move', 'terrain:dry'], icon: 'sun' },
  { id: 'river-wise', name: 'River-wise', tags: ['move', 'terrain:water'], icon: 'wave' },
  { id: 'woodwise', name: 'Woodwise', tags: ['move', 'terrain:wooded'], icon: 'leaf' },
  { id: 'keen-eyed', name: 'Keen-eyed', tags: ['reveal'], icon: 'eye' },
  { id: 'night-sighted', name: 'Night-sighted', tags: ['reveal', 'night'], icon: 'moon' },
  { id: 'broad-backed', name: 'Broad-backed', tags: ['carry'], icon: 'pack' },
  { id: 'deft-handed', name: 'Deft-handed', tags: ['craft'], icon: 'hand' },
  { id: 'herb-wise', name: 'Herb-wise', tags: ['gather', 'tend'], icon: 'sprig' },
  { id: 'lore-learned', name: 'Lore-learned', tags: ['lore', 'sites'], icon: 'scroll' },
  { id: 'fair-spoken', name: 'Fair-spoken', tags: ['peoples'], icon: 'quill' },
  { id: 'beast-friend', name: 'Beast-friend', tags: ['creature'], icon: 'paw' },
];

export const QUIRKS: readonly Quirk[] = [
  { id: 'restless', name: 'Restless', helps: ['move'], hinders: ['rest'], icon: 'feet' },
  { id: 'magpie', name: 'Magpie', helps: ['find'], hinders: ['carry'], icon: 'feather' },
  { id: 'night-owl', name: 'Night owl', helps: ['night'], hinders: ['morning'], icon: 'owl' },
  { id: 'stubborn', name: 'Stubborn', helps: ['defend'], hinders: ['peoples'], icon: 'boulder' },
  { id: 'curious', name: 'Curious', helps: ['reveal'], hinders: ['traps'], icon: 'key' },
  {
    id: 'superstitious',
    name: 'Superstitious',
    helps: ['lore'],
    hinders: ['sites'],
    icon: 'charm',
  },
  { id: 'hoarder', name: 'Hoarder', helps: ['carry'], hinders: ['craft'], icon: 'jar' },
  { id: 'loud', name: 'Loud', helps: ['creature'], hinders: ['stealth'], icon: 'horn' },
  { id: 'squeamish', name: 'Squeamish', helps: ['caution'], hinders: ['gather'], icon: 'drop' },
  { id: 'daydreamer', name: 'Daydreamer', helps: ['lore'], hinders: ['reveal'], icon: 'cloud' },
  { id: 'gourmand', name: 'Gourmand', helps: ['tend'], hinders: ['supplies'], icon: 'spoon' },
  { id: 'old-bones', name: 'Old bones', helps: ['lore'], hinders: ['move'], icon: 'cane' },
];
