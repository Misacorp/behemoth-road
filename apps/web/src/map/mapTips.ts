/**
 * Which tip a spot on the map has: a threat, a settlement, a struck or escorted character, a lure animal,
 * the cart, or a fire, in that order. Only what the player can already see; nothing about what is hidden.
 */
import {
  FEATURE_TYPES,
  type GameStateView,
  type Hex,
  hexKey,
  stranded,
  terrainOf,
} from '@behemoth-road/core';
import { escortedIds, struckToday } from '../game/season.ts';
import { burntKeys, isBrazierAt } from './cells.ts';
import type { TipId } from '../text/tips.ts';
import { tipFor } from '../ui/tip.ts';
import { titleOf } from '../ui/Tip.tsx';

const same = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export function mapTipAt(game: GameStateView, h: Hex): TipId | null {
  const threat = game.threats.find((t) => same(t.hex, h));
  if (threat) return tipFor('threat', threat.type);
  const settlement = game.settlements.find((s) => same(s.hex, h));
  if (settlement) return tipFor('settlement', settlement.attitude);
  // A lure animal and the cart: what they are (the figure's own tip; a character standing there wins below).
  const lure = game.lures.find((l) => same(l.hex, h));
  const cart = game.carts.find((c) => same(c.hex, h));
  const here = game.characters.filter(
    (c) => c.status === 'active' && c.at.kind === 'hex' && same(c.at.hex, h),
  );
  if (here.some((c) => c.pinnedDay !== undefined)) return 'map:pinned';
  if (here.some((c) => struckToday(c, game.day))) return 'map:struck';
  if (game.creature.tows.some((t) => here.some((c) => c.id === t.to))) return 'map:towline';
  if (here.some((c) => stranded(game, c.id))) return 'map:stranded';
  const escorted = escortedIds(game);
  if (here.some((c) => escorted.has(c.id))) return 'map:escort';
  if (lure) return lure.leadsLeft > 0 ? 'map:lure' : 'map:lure-settled';
  if (cart) return 'map:cart';
  if (game.stimuli.some((s) => hexKey(s.hex) === hexKey(h))) {
    return isBrazierAt(game, hexKey(h)) ? 'map:fire-brazier' : 'map:fire';
  }
  if (burntKeys(game).has(hexKey(h))) return 'map:burnt';
  return null;
}

/** What a known hex is, by name: its revealed feature ("Berry bushes"), else its ground ("Plains"). */
export function placeNoun(game: GameStateView, h: Hex): string | null {
  const f = game.features[hexKey(h)];
  if (f?.revealed) {
    const type = FEATURE_TYPES.find((t) => t.id === f.type);
    if (type) return type.name;
  }
  const terrain = terrainOf(game, h);
  const tip = terrain ? tipFor('terrain', terrain.id) : null;
  return tip ? titleOf(tip) : null;
}

/** The tip of a known hex's picture: its revealed feature's, else its ground's. */
export function tileTipAt(game: GameStateView, h: Hex): TipId | null {
  const f = game.features[hexKey(h)];
  if (f?.revealed) {
    const tip = tipFor('feature', f.type);
    if (tip) return tip;
  }
  return tipFor('terrain', terrainOf(game, h)?.id);
}
