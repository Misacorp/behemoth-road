/**
 * The cart (`docs/design/cart.md`): where it may roll, who pulls and rides it, where a new or displaced
 * one is put, and finishing a build. Rules read the vehicle data of the unlock (`Unlock.vehicle`), never
 * its id. Pure helpers over the state; the actions are in `act.ts` and `actions.ts`, the tick in `tick.ts`.
 */

import { type Unlock, UNLOCKS } from './content/index.ts';
import type { GameEvent } from './features.ts';
import { type Hex, hexEquals, hexRing } from './hex.ts';
import { terrainOf } from './map.ts';
import type { Cart, Character, GameState, GameStateView } from './state.ts';
import { isCreatureHex, isReachable } from './window.ts';

/** The unlock that makes a cart: the one with `vehicle` data. */
export const cartUnlock = (): Unlock | undefined => UNLOCKS.find((u) => u.vehicle !== undefined);

/** Whether an unlock builds a vehicle (finishing it places one instead of joining the team's unlocks). */
export const isVehicleUnlock = (unlock: Unlock): boolean => unlock.vehicle !== undefined;

/**
 * Whether a cart can roll onto a hex: its terrain has a tag the vehicle allows and none it refuses
 * (islets), and it is not under the creature or on a hex another cart holds.
 */
export const cartCanEnter = (state: GameStateView, h: Hex): boolean => {
  const spec = cartUnlock()?.vehicle;
  if (!spec || isCreatureHex(state, h)) return false;
  const terrain = terrainOf(state, h);
  if (!terrain || !terrain.passable) return false;
  if (spec.terrainNotTags?.some((t) => terrain.tags.includes(t))) return false;
  return (
    spec.terrainTags.some((t) => terrain.tags.includes(t)) && cartAtHex(state, h) === undefined
  );
};

export const cartAtHex = (state: GameStateView, h: Hex): Cart | undefined =>
  state.carts.find((c) => hexEquals(c.hex, h));

/** The cart a character has hitched, if any. */
export const cartPulledBy = (state: GameStateView, characterId: string): Cart | undefined =>
  state.carts.find((c) => c.puller === characterId);

/** The cart a character sits in, if any. */
export const cartRiddenBy = (state: GameStateView, characterId: string): Cart | undefined =>
  state.carts.find((c) => c.rider === characterId);

/** Units a cart still has room for. */
export const cartRoom = (state: GameStateView, cart: Cart): number =>
  state.config.cartCargo - Object.values(cart.cargo).reduce((sum, n) => sum + n, 0);

/**
 * The nearest hex a cart can be put on, from `from`: not under the creature, in view and in reach, and
 * rollable. Rings are searched outward and each in the same order, so the result is the same every time.
 * Null if there is none in the window.
 */
export const cartSpot = (state: GameStateView, from: Hex): Hex | null => {
  const most = state.config.windowRadius * 2 + state.config.creatureRadius + 1;
  for (let d = 0; d <= most; d++) {
    for (const h of d === 0 ? [from] : hexRing(from, d)) {
      if (cartCanEnter(state, h) && isReachable(state, h)) return h;
    }
  }
  return null;
};

const withCart = <S extends GameStateView>(state: S, cart: Cart): S => ({
  ...state,
  carts: state.carts.map((c) => (c.id === cart.id ? cart : c)),
});

/** Replaces a cart (by id). */
export const setCart = withCart;

/** Moves a cart to a hex, and whoever pulls or rides it with it. */
export const moveCart = <S extends GameStateView>(state: S, cart: Cart, to: Hex): S => {
  const moved = withCart(state, { ...cart, hex: to });
  const along = new Set([cart.puller, cart.rider].filter((x): x is string => x !== null));
  return {
    ...moved,
    characters: moved.characters.map((c: Character): Character =>
      along.has(c.id) && c.at.kind === 'hex' ? { ...c, at: { kind: 'hex', hex: to } } : c,
    ),
  };
};

/** The character no longer pulls or rides any cart (hauled aboard the creature, lost). */
export const releaseFromCart = <S extends GameStateView>(state: S, characterId: string): S => {
  if (!state.carts.some((c) => c.puller === characterId || c.rider === characterId)) return state;
  return {
    ...state,
    carts: state.carts.map((c) => ({
      ...c,
      puller: c.puller === characterId ? null : c.puller,
      rider: c.rider === characterId ? null : c.rider,
    })),
  };
};

/**
 * A finished vehicle unlock: puts a new cart on the nearest rollable hex to `from` (the finisher's hex,
 * or the creature's centre when they ride it, which puts it beside the footprint). Returns the state
 * unchanged when there is no room (the build is refused beforehand, so this is a guard).
 */
export const placeCart = (
  state: GameState,
  from: Hex,
  characterId: string | null,
): { readonly state: GameState; readonly events: GameEvent[] } => {
  const hex = cartSpot(state, from);
  if (!hex) return { state, events: [] };
  const count = state.cartCount + 1;
  const cart: Cart = { id: `cart${count}`, hex, cargo: {}, puller: null, rider: null };
  return {
    state: { ...state, carts: [...state.carts, cart], cartCount: count },
    events: [
      { kind: 'cart-built', cart: cart.id, hex, ...(characterId === null ? {} : { characterId }) },
    ],
  };
};

/**
 * Finishes an unlock: a vehicle is placed on the map (and counts as `unlock-done`, so the tallies and the
 * celebration still work); anything else joins the team's unlocks.
 */
export const finishUnlock = (
  state: GameState,
  unlock: Unlock,
  from: Hex,
  characterId: string | null,
): { readonly state: GameState; readonly events: GameEvent[] } => {
  const done: GameEvent = { kind: 'unlock-done', unlock: unlock.id };
  if (!isVehicleUnlock(unlock)) {
    return { state: { ...state, unlocks: [...state.unlocks, unlock.id] }, events: [done] };
  }
  const placed = placeCart(state, from, characterId);
  return { state: placed.state, events: [done, ...placed.events] };
};
