/**
 * The hand cart as the web reads it from the player view: how it looks (empty, loaded, a rider, hitched),
 * how full it is, what you can do with it from its card (hitch, board, load and unload, each the core's own
 * check with its cost and refusal), and the tips for a move the cart refuses. Nothing here knows a rule.
 */
import {
  type Cart,
  cartAtHex,
  cartPulledBy,
  cartRiddenBy,
  checkAction,
  type GameStateView,
  type Hex,
  type PathRefusal,
} from '@behemoth-road/core';
import type { TipId } from '../text/tips.ts';
import { whyTip } from './why.ts';

/** The art kit's cart states. */
export type CartLook = 'empty' | 'loaded' | 'rider' | 'hitched';

export const cartById = (state: GameStateView, id: string): Cart | undefined =>
  state.carts.find((c) => c.id === id);

export const cartAt = (state: GameStateView, h: Hex): Cart | undefined => cartAtHex(state, h);

/** Units in the cart. */
export const cargoUnits = (cart: Cart): number =>
  Object.values(cart.cargo).reduce((sum, n) => sum + n, 0);

/** How the cart is drawn: a rider wins over a puller, and either over what it carries. */
export function cartLook(cart: Cart): CartLook {
  if (cart.rider !== null) return 'rider';
  if (cart.puller !== null) return 'hitched';
  return cargoUnits(cart) > 0 ? 'loaded' : 'empty';
}

/** How full the cart is, 0 to 1 (its cargo over what it holds). */
export const cargoFill = (state: GameStateView, cart: Cart): number =>
  state.config.cartCargo > 0 ? Math.min(1, cargoUnits(cart) / state.config.cartCargo) : 0;

/** Whether this character is hitched to a cart (their steps cost more and the cart goes with them). */
export const isPulling = (state: GameStateView, characterId: string): boolean =>
  cartPulledBy(state, characterId) !== undefined;

/** Whether this character sits in a cart (they cannot walk). */
export const isRiding = (state: GameStateView, characterId: string): boolean =>
  cartRiddenBy(state, characterId) !== undefined;

/** One of the card's four toggles: hitch or let go, board or leave. */
export interface CartToggle {
  readonly kind: 'hitch' | 'unhitch' | 'board-cart' | 'leave-cart';
  readonly cost: number;
  readonly enabled: boolean;
  /** The state is on now: you pull, or you ride (the button undoes it). */
  readonly done: boolean;
  readonly why?: TipId;
}

/** Refusals that mean the button is not for you here at all (you are not at the cart). */
const NOT_OFFERED: ReadonlySet<string> = new Set([
  'no-cart',
  'invalid-action',
  'unknown-character',
  'character-lost',
  'season-over',
  'waiting',
]);

function toggle(
  game: GameStateView,
  characterId: string,
  kind: CartToggle['kind'],
  done: boolean,
): CartToggle | null {
  const check = checkAction(game, characterId, { kind });
  if (check.ok) return { kind, cost: check.cost, enabled: true, done };
  if (NOT_OFFERED.has(check.reason) || check.cost === undefined) return null;
  return { kind, cost: check.cost, enabled: false, done, why: whyTip(check.reason) };
}

/**
 * The toggles for a cart's card: hitch (or let go, when you pull it) and board (or leave, when you ride it).
 * Only for a character standing on the cart's hex; elsewhere none (they are for the hex's own card).
 */
export function cartToggles(game: GameStateView, characterId: string): CartToggle[] {
  const pulling = cartPulledBy(game, characterId) !== undefined;
  const riding = cartRiddenBy(game, characterId) !== undefined;
  const out = [
    toggle(game, characterId, pulling ? 'unhitch' : 'hitch', pulling),
    toggle(game, characterId, riding ? 'leave-cart' : 'board-cart', riding),
  ];
  return out.flatMap((t) => (t ? [t] : []));
}

/** One material a tap moves a unit of: into the cart (from your pack) or out of it. */
export interface CartMove {
  readonly material: string;
  /** How many the source holds. */
  readonly count: number;
  readonly enabled: boolean;
  readonly why?: TipId;
}

/** The materials in your pack (tap one to load a unit) and in the cart (tap one to unload a unit). */
export function cartMoves(
  game: GameStateView,
  characterId: string,
  cart: Cart,
  pack: Readonly<Record<string, number>>,
): { readonly load: CartMove[]; readonly unload: CartMove[] } {
  const move = (kind: 'load' | 'unload', material: string, count: number): CartMove => {
    const check = checkAction(game, characterId, { kind, material, amount: 1 });
    return check.ok
      ? { material, count, enabled: true }
      : { material, count, enabled: false, why: whyTip(check.reason) };
  };
  const held = (m: Readonly<Record<string, number>>): [string, number][] =>
    Object.entries(m).filter(([, n]) => n > 0);
  return {
    load: held(pack).map(([m, n]) => move('load', m, n)),
    unload: held(cart.cargo).map(([m, n]) => move('unload', m, n)),
  };
}

/** The tip for a move the core refuses because of the cart: sitting in it, or ground it cannot roll over. */
export function moveRefusalTip(reason: PathRefusal): TipId | null {
  if (reason === 'aboard') return 'why:aboard';
  if (reason === 'cart-terrain') return 'why:cart-terrain';
  return null;
}
