/**
 * Which tip a spot on the map has: a threat, a settlement, a struck or escorted character, or a fire, in
 * that order. Only what the player can already see; nothing about what is hidden.
 */
import { type GameStateView, type Hex, hexKey } from '@behemoth-road/core';
import { escortedIds, struckToday } from '../game/season.ts';
import type { TipId } from '../text/tips.ts';
import { tipFor } from '../ui/tip.ts';

const same = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export function mapTipAt(game: GameStateView, h: Hex): TipId | null {
  const threat = game.threats.find((t) => same(t.hex, h));
  if (threat) return tipFor('threat', threat.type);
  const settlement = game.settlements.find((s) => same(s.hex, h));
  if (settlement) return tipFor('settlement', settlement.attitude);
  const here = game.characters.filter(
    (c) => c.status === 'active' && c.at.kind === 'hex' && same(c.at.hex, h),
  );
  if (here.some((c) => struckToday(c, game.day))) return 'map:struck';
  const escorted = escortedIds(game);
  if (here.some((c) => escorted.has(c.id))) return 'map:escort';
  if (game.stimuli.some((s) => hexKey(s.hex) === hexKey(h))) return 'map:fire';
  return null;
}
