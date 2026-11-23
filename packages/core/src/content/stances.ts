/**
 * Idle stances, as data (docs/design/stances.md). At the tick a character's unspent actions go to
 * their stance. Rules read a stance's `tags`, never its id: `rest` (nothing), `ambush` (strikes
 * threats that reach the character's hex first), `gather` (gathers from the node on the hex). A
 * stance never beats a specialist's active action: it is the same activity, at most as strong. `needs` is what must hold where the character
 * is, or the stance falls back to the default. `icon` names the emblem.
 */

/** What a stance needs: nothing, to stand on a hex (not riding) or a node on the hex. */
export type StanceNeeds = 'none' | 'hex' | 'node';

export interface Stance {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly needs: StanceNeeds;
  readonly icon: string;
}

export const STANCES: readonly Stance[] = [
  { id: 'rest', name: 'Rest', tags: ['rest'], needs: 'none', icon: 'moon' },
  { id: 'lie-in-wait', name: 'Lie in wait', tags: ['ambush'], needs: 'hex', icon: 'grass' },
  { id: 'gather', name: 'Gather', tags: ['gather'], needs: 'node', icon: 'basket' },
];

/** What a character has until they choose, and what an unfit stance falls back to. */
export const DEFAULT_STANCE = 'rest';
