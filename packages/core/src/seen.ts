/**
 * What a player is shown once, ever (onboarding): the intro cards, the practice map and the first-encounter
 * hints. The server keeps the ids a player has seen, per Discord user, so they follow the account across
 * devices. Not a rule of the game: a list of names both the server and the web read.
 */
export const SEEN_IDS = [
  'intro',
  'practice',
  'hint:fog',
  'hint:trap',
  'hint:threat',
  'hint:settlement',
  'hint:hunger',
] as const;

export type SeenId = (typeof SEEN_IDS)[number];

/** The most ids a record can hold (each at most once). */
export const SEEN_MAX = SEEN_IDS.length;

export const isSeenId = (id: unknown): id is SeenId =>
  typeof id === 'string' && (SEEN_IDS as readonly string[]).includes(id);

/** A stored record read back: only known ids, each once, in the list's order (older or hand-made junk is dropped). */
export function readSeen(stored: unknown): SeenId[] {
  const list = Array.isArray(stored) ? stored : [];
  return SEEN_IDS.filter((id) => list.includes(id));
}

/** The record after adding ids: a union, in the list's order. */
export const addSeen = (record: readonly string[], add: readonly string[]): SeenId[] =>
  readSeen([...record, ...add]);
