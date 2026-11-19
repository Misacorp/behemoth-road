/**
 * The move flow. A tap on a place picks your own character first (you can only move your own): tap your
 * character or its hex to select it, tap a lit place to plan, confirm to walk. The creature's seven
 * footprint hexes are one place and the party's hub: tapping it opens a bubble with the characters riding
 * it and a way into the hub (the creature card in Milestone 1); if you ride, the same tap also selects you.
 * Tapping elsewhere changes or cancels the plan before anything is spent. Every rule check goes through
 * the core.
 */
import {
  findCharacter,
  type GameState,
  type Hex,
  hexEquals,
  moveAlong,
  type PathStep,
  type Place,
  placeAt,
  placeEquals,
  planPath,
} from '@behemoth-road/core';
import type { Target } from './pick.ts';

export type Flow =
  | { readonly kind: 'idle' }
  /** Looking at a hex: its popover shows what is known about it. */
  | { readonly kind: 'inspect'; readonly hex: Hex }
  /** Looking at the creature (the hub): its card shows it and its heading. */
  | { readonly kind: 'creature' }
  /**
   * The bubble by a place with characters (in Milestone 1, the creature): who is there and the way into
   * the hub. `selecting` when it also selected your character (you ride, with actions left).
   */
  | { readonly kind: 'bubble'; readonly selecting: boolean }
  /** Your character is selected: the places it can reach are lit. */
  | { readonly kind: 'selected' }
  /** A path is planned and waits for confirmation. */
  | {
      readonly kind: 'planned';
      readonly to: Place;
      readonly steps: readonly PathStep[];
      readonly cost: number;
    };

export const IDLE: Flow = { kind: 'idle' };

/** Whether your character is selected, so reachable places are lit and a tap on one plans a move. */
export const isSelecting = (flow: Flow): boolean =>
  flow.kind === 'selected' || flow.kind === 'planned' || (flow.kind === 'bubble' && flow.selecting);

function look(flow: Flow, hex: Hex): Flow {
  if (flow.kind === 'inspect' && hexEquals(flow.hex, hex)) return IDLE;
  return { kind: 'inspect', hex };
}

/** A tap on the creature. */
function tapCreature(flow: Flow, state: GameState, characterId: string): Flow {
  const me = findCharacter(state, characterId);
  const active = me?.status === 'active';
  if (active && me.at.kind === 'creature') {
    // You ride: the tap selects you and opens the bubble (also from a selection or a plan). Only a tap
    // while the bubble or the hub card is open closes everything.
    if (flow.kind === 'bubble' || flow.kind === 'creature') return IDLE;
    return { kind: 'bubble', selecting: me.actionsLeft > 0 };
  }
  if (active && isSelecting(flow)) {
    // You stand beside it, selected: the tap plans boarding.
    if (flow.kind === 'planned' && flow.to.kind === 'creature') return flow;
    const plan = planPath(state, characterId, { kind: 'creature' });
    if (plan.ok && plan.steps.length > 0) {
      return { kind: 'planned', to: { kind: 'creature' }, steps: plan.steps, cost: plan.cost };
    }
  }
  if (flow.kind === 'bubble' || flow.kind === 'creature') return IDLE;
  return { kind: 'bubble', selecting: false };
}

/** What a tap does. */
export function tap(flow: Flow, state: GameState, characterId: string, target: Target): Flow {
  const me = findCharacter(state, characterId);
  const active = me?.status === 'active';
  const mine: Place | null = active ? me.at : null;
  const hex = target.kind === 'hex' ? target.hex : null;
  const to = hex ? placeAt(state, hex) : mine;
  if (!to) return flow;
  if (to.kind === 'creature') return tapCreature(flow, state, characterId);
  const onMe = mine !== null && placeEquals(mine, to);
  if (onMe && active) {
    // Your own character first: select it, or let go of it.
    if (isSelecting(flow)) return IDLE;
    if (me.actionsLeft > 0) return { kind: 'selected' };
    return look(flow, to.hex);
  }
  if (isSelecting(flow)) {
    if (flow.kind === 'planned' && placeEquals(flow.to, to)) return flow;
    const plan = planPath(state, characterId, to);
    if (plan.ok && plan.steps.length > 0) {
      return { kind: 'planned', to, steps: plan.steps, cost: plan.cost };
    }
  }
  return look(flow, to.hex);
}

/** Tapping a hex (a shorthand for tests and callers without picking). */
export const tapHex = (flow: Flow, state: GameState, characterId: string, hex: Hex): Flow =>
  tap(flow, state, characterId, { kind: 'hex', hex });

/** The bubble's way into the hub: the creature card. */
export const openHub = (): Flow => ({ kind: 'creature' });

/**
 * Walks the planned path through the core. On success the character stays selected while it has actions
 * left; a refusal (the state changed under the plan) spends nothing and clears the plan.
 */
export function confirmMove(
  flow: Flow,
  state: GameState,
  characterId: string,
): { readonly flow: Flow; readonly state: GameState } {
  if (flow.kind !== 'planned') return { flow, state };
  const result = moveAlong(state, characterId, flow.steps);
  if (!result.ok) return { flow: IDLE, state };
  const me = findCharacter(result.state, characterId);
  return { flow: me && me.actionsLeft > 0 ? { kind: 'selected' } : IDLE, state: result.state };
}

/** Escape closes the open popover, bubble or card and cancels a plan or selection. Other keys do nothing. */
export const keyDown = (flow: Flow, key: string): Flow => (key === 'Escape' ? IDLE : flow);

/** A right-click on the map closes everything the same way, when the player's setting allows it. */
export const rightClick = (flow: Flow, settings: { readonly closeOnRightClick: boolean }): Flow =>
  settings.closeOnRightClick ? IDLE : flow;
