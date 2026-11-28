/**
 * The small mark a tip shows beside its title, when the thing it is about carries a fire tag: a feature a
 * fire would burn, a threat that keeps clear of fire. Read from the content's tags, never by id, so new
 * content with the tag gets the mark. Pure, so it is tested.
 */
import { BURNABLE_TAG, FEARS_FIRE_TAG, FEATURE_TYPES, THREAT_TYPES } from '@behemoth-road/core';
import type { TipId } from '../text/tips.ts';

export type TipMark = 'burnable' | 'fears-fire';

export function tipMarkOf(id: TipId): TipMark | null {
  const [kind = '', key = ''] = id.split(':');
  if (kind === 'feature') {
    return FEATURE_TYPES.find((f) => f.id === key)?.tags.includes(BURNABLE_TAG) ? 'burnable' : null;
  }
  if (kind === 'threat') {
    return THREAT_TYPES.find((t) => t.id === key)?.tags.includes(FEARS_FIRE_TAG)
      ? 'fears-fire'
      : null;
  }
  return null;
}
