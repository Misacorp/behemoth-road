/**
 * The move flow: tap your character, tap a reachable place to plan, confirm to walk. The creature's seven
 * footprint hexes are one place: tapping any of them plans to board it (or, when not planning, shows the
 * creature). Tapping elsewhere changes or cancels the plan before anything is spent. Every rule check goes
 * through the core.
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
  /** Looking at the creature: its popover shows it and its heading. */
  | { readonly kind: 'creature' }
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

const isSelecting = (flow: Flow): boolean => flow.kind === 'selected' || flow.kind === 'planned';

/** Looking at a hex or, for a footprint hex, at the creature; looking again closes. */
function look(flow: Flow, state: GameState, hex: Hex): Flow {
  if (placeAt(state, hex).kind === 'creature')
    return flow.kind === 'creature' ? IDLE : { kind: 'creature' };
  if (flow.kind === 'inspect' && hexEquals(flow.hex, hex)) return IDLE;
  return { kind: 'inspect', hex };
}

/** What a tap does. */
export function tap(flow: Flow, state: GameState, characterId: string, target: Target): Flow {
  const me = findCharacter(state, characterId);
  if (target.kind === 'me') {
    if (me?.status !== 'active') return flow;
    if (me.actionsLeft > 0) return isSelecting(flow) ? IDLE : { kind: 'selected' };
    // With no actions left there is nothing to plan: your own place is looked at like any other.
    return me.at.kind === 'creature'
      ? look(flow, state, state.creature.centre)
      : look(flow, state, me.at.hex);
  }
  const { hex } = target;
  if (isSelecting(flow) && me) {
    const to = placeAt(state, hex);
    if (flow.kind === 'planned' && placeEquals(flow.to, to)) return flow;
    // Tapping where you already are (a footprint hex while riding) ends the selection.
    if (placeEquals(me.at, to)) return IDLE;
    const plan = planPath(state, characterId, to);
    if (plan.ok && plan.steps.length > 0) {
      return { kind: 'planned', to, steps: plan.steps, cost: plan.cost };
    }
  }
  return look(flow, state, hex);
}

/** Tapping a hex (a shorthand for tests and callers without picking). */
export const tapHex = (flow: Flow, state: GameState, characterId: string, hex: Hex): Flow =>
  tap(flow, state, characterId, { kind: 'hex', hex });

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
