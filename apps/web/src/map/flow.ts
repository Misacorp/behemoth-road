/**
 * The move flow: tap your character, tap a reachable tile to plan, confirm to walk. Tapping elsewhere
 * changes or cancels the plan before anything is spent. Every rule check goes through the core.
 */
import {
  findCharacter,
  type GameState,
  type Hex,
  hexEquals,
  moveAlong,
  type PathStep,
  planPath,
} from '@behemoth-road/core';

export type Flow =
  | { readonly kind: 'idle' }
  /** Looking at a hex: its popover shows what is known about it. */
  | { readonly kind: 'inspect'; readonly hex: Hex }
  /** Your character is selected: the tiles it can reach are lit. */
  | { readonly kind: 'selected' }
  /** A path is planned and waits for confirmation. */
  | {
      readonly kind: 'planned';
      readonly to: Hex;
      readonly steps: readonly PathStep[];
      readonly cost: number;
    };

export const IDLE: Flow = { kind: 'idle' };

const isSelecting = (flow: Flow): boolean => flow.kind === 'selected' || flow.kind === 'planned';

/** What a tap on `hex` does. */
export function tapHex(flow: Flow, state: GameState, characterId: string, hex: Hex): Flow {
  const me = findCharacter(state, characterId);
  if (me?.status === 'active' && hexEquals(me.position, hex)) {
    return isSelecting(flow) ? IDLE : { kind: 'selected' };
  }
  if (isSelecting(flow)) {
    if (flow.kind === 'planned' && hexEquals(flow.to, hex)) return flow;
    const plan = planPath(state, characterId, hex);
    if (plan.ok && plan.steps.length > 0) {
      return { kind: 'planned', to: hex, steps: plan.steps, cost: plan.cost };
    }
  }
  if (flow.kind === 'inspect' && hexEquals(flow.hex, hex)) return IDLE;
  return { kind: 'inspect', hex };
}

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
