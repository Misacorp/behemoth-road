/**
 * The move flow. A tap on a place picks your own character first (you can only move your own): tap your
 * character or its hex to select it, tap a lit place to plan, confirm to walk. The creature's seven
 * footprint hexes are one place and the party's hub: tapping it opens a bubble with the characters riding
 * it and a way into the hub (the creature card in Milestone 1); if you ride, the same tap also selects you.
 * Tapping elsewhere changes or cancels the plan before anything is spent; a tap on a hex it cannot reach
 * shows the out-of-reach mark, and a second tap there looks at it. Every rule check goes through the core.
 *
 * Two kinds of open state. A popover (`isPopover`: a hex's inspect card, the picker, a character, threat,
 * settlement or creature card, the bubble when it is only a look) is looked at: a tap anywhere else on the
 * map just closes it, and a second tap opens whatever it lands on. A selection in progress (`isSelecting`:
 * selected, planned, out-of-reach, and the bubble that also selected you) is a mode: the next tap goes on
 * through it (plan a destination, change it, let go). Taps inside a popover (its bubbles, back, buttons)
 * and the HUD and drawers never reach `tap`.
 */
import {
  findCharacter,
  type GameStateView,
  type Hex,
  hexEquals,
  moveAlong,
  type PathStep,
  type Place,
  placeAt,
  placeEquals,
  planPath,
} from '@behemoth-road/core';
import { revealedFeatureAt } from '@behemoth-road/core';
import { moveRefusalTip } from '../game/cart.ts';
import { canLeadTo, lureById } from '../game/lure.ts';
import { settlementAt, threatAt } from '../game/season.ts';
import type { TipId } from '../text/tips.ts';
import type { Target } from './pick.ts';

export type Flow =
  | { readonly kind: 'idle' }
  /** Looking at a hex: its popover shows what is known about it. `back` is the picker it was chosen from. */
  | { readonly kind: 'inspect'; readonly hex: Hex; readonly back?: Flow }
  /**
   * A tile with more than one thing to tap on it (characters, a threat, its feature or settlement): small
   * round bubbles, one per thing, to choose from. Tapping one opens that thing's card, with a back to here.
   */
  | { readonly kind: 'pick'; readonly hex: Hex }
  /**
   * Looking at another player's character: its card shows who it is. `back` is where it was opened from
   * (the bubble): the card then shows in that same popup, with a back button to it.
   */
  | { readonly kind: 'character'; readonly id: string; readonly back?: Flow }
  /** Looking at a threat: its card shows its name and strength, and the strike when you are near. */
  | { readonly kind: 'threat'; readonly id: string; readonly back?: Flow }
  /** Looking at a settlement from afar: its card shows its attitude and favour. */
  | { readonly kind: 'settlement'; readonly id: string; readonly back?: Flow }
  /** Looking at a lure animal: its card shows its leads left and, within reach, the lead button. */
  | { readonly kind: 'lure'; readonly id: string }
  /**
   * Leading a lure: the hexes it can be led onto are lit; a tap on one shows the arrow and the cost (`to`),
   * the confirm leads it. A tap anywhere else lets go.
   */
  | { readonly kind: 'lead'; readonly id: string; readonly to?: Hex }
  /** Looking at the cart: hitch, board, load and unload. */
  | { readonly kind: 'cart'; readonly id: string }
  /** Looking at the creature (the hub): its card shows it and its heading. */
  | { readonly kind: 'creature' }
  /**
   * The bubble by a place with characters (in Milestone 1, the creature): who is there and the way into
   * the hub. `selecting` when it also selected your character (you ride, with actions left).
   */
  | { readonly kind: 'bubble'; readonly selecting: boolean }
  /** Your character is selected: the places it can reach are lit. */
  | { readonly kind: 'selected' }
  /**
   * Selected, and a hex it cannot reach was tapped: the out-of-reach mark shows there for a moment. The
   * same hex tapped again is looked at.
   */
  | { readonly kind: 'out-of-reach'; readonly hex: Hex; readonly why?: TipId }
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
  flow.kind === 'selected' ||
  flow.kind === 'planned' ||
  flow.kind === 'out-of-reach' ||
  (flow.kind === 'bubble' && flow.selecting);

/** Whether a popover is open only to be looked at: the next map tap closes it and does nothing more. */
export const isPopover = (flow: Flow): boolean =>
  flow.kind !== 'idle' && flow.kind !== 'lead' && !isSelecting(flow);

/**
 * Looking at a hex: a settlement's card on a settlement, else the inspect card. The same tap again closes it.
 */
function look(flow: Flow, state: GameStateView, hex: Hex): Flow {
  const settlement = settlementAt(state, hex);
  if (settlement !== null) {
    return flow.kind === 'settlement' && flow.id === settlement
      ? IDLE
      : { kind: 'settlement', id: settlement };
  }
  if (flow.kind === 'inspect' && hexEquals(flow.hex, hex)) return IDLE;
  return { kind: 'inspect', hex };
}

/** One thing on a tile to choose from in the picker. */
export type PickEntry =
  | { readonly kind: 'me' }
  | { readonly kind: 'character'; readonly id: string }
  | { readonly kind: 'threat'; readonly id: string }
  /** The tile's own settlement or revealed feature (when you are not standing there: then it is part of you). */
  | { readonly kind: 'tile' };

/** The key of a picker entry, for its bubble. */
export const entryKey = (e: PickEntry): string =>
  e.kind === 'me' ? 'me' : e.kind === 'tile' ? 'tile' : `${e.kind}:${e.id}`;

/**
 * What can be tapped on a hex: your character, other active characters, the threats, and the settlement or
 * revealed feature (which belongs to your own entry when you stand there: the here card).
 */
export function pickEntries(state: GameStateView, characterId: string, hex: Hex): PickEntry[] {
  const out: PickEntry[] = [];
  for (const c of state.characters) {
    if (c.status !== 'active' || c.at.kind !== 'hex' || !hexEquals(c.at.hex, hex)) continue;
    out.push(c.id === characterId ? { kind: 'me' } : { kind: 'character', id: c.id });
  }
  for (const t of state.threats) if (hexEquals(t.hex, hex)) out.push({ kind: 'threat', id: t.id });
  if (!out.some((e) => e.kind === 'me')) {
    if (settlementAt(state, hex) !== null || revealedFeatureAt(state, hex) !== null) {
      out.push({ kind: 'tile' });
    }
  }
  return out;
}

/** Your own character's tap: select it (with actions left), else look at its hex. */
function tapMe(flow: Flow, state: GameStateView, characterId: string, hex: Hex): Flow {
  const me = findCharacter(state, characterId);
  if (isSelecting(flow)) return IDLE;
  // Pinned, you still open your card: its actions show greyed, with why.
  if (me && (me.actionsLeft > 0 || me.pinnedDay !== undefined)) return { kind: 'selected' };
  return look(flow, state, hex);
}

/** Choosing a bubble in the picker: that thing's card, with a back to the picker. */
export function choose(
  state: GameStateView,
  characterId: string,
  pick: Flow,
  entry: PickEntry,
): Flow {
  if (pick.kind !== 'pick') return pick;
  switch (entry.kind) {
    case 'me':
      return tapMe(IDLE, state, characterId, pick.hex);
    case 'character':
      return openCharacter(entry.id, pick);
    case 'threat':
      return { kind: 'threat', id: entry.id, back: pick };
    case 'tile': {
      const settlement = settlementAt(state, pick.hex);
      return settlement !== null
        ? { kind: 'settlement', id: settlement, back: pick }
        : { kind: 'inspect', hex: pick.hex, back: pick };
    }
  }
}

/** A tap on the creature. */
function tapCreature(flow: Flow, state: GameStateView, characterId: string): Flow {
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

/** The picker for a tile with more than one thing on it (or closing it), else null. */
function shareOf(flow: Flow, state: GameStateView, characterId: string, hex: Hex): Flow | null {
  if (flow.kind === 'pick' && hexEquals(flow.hex, hex)) return IDLE;
  if (pickEntries(state, characterId, hex).length < 2) return null;
  // Walking onto a tile with characters is a plan, unless a threat stands on it (no one walks onto one).
  if (isSelecting(flow) && threatAt(state, hex) === null) return null;
  return { kind: 'pick', hex: { q: hex.q, r: hex.r } };
}

/**
 * A tap while leading a lure: on a hex it can be led onto, that is the target (the arrow and the cost show,
 * the confirm leads it); anywhere else lets go.
 */
function tapLead(
  flow: Extract<Flow, { kind: 'lead' }>,
  state: GameStateView,
  target: Target,
): Flow {
  const lure = lureById(state, flow.id);
  if (!lure || target.kind !== 'hex' || !canLeadTo(state, lure, target.hex)) return IDLE;
  return { kind: 'lead', id: flow.id, to: { q: target.hex.q, r: target.hex.r } };
}

/** The button on a lure's card: lead mode, with the targets lit (a tap on the same button again lets go). */
export const startLead = (flow: Flow): Flow =>
  flow.kind === 'lure' ? { kind: 'lead', id: flow.id } : flow;

/** What a tap does. */
export function tap(flow: Flow, state: GameStateView, characterId: string, target: Target): Flow {
  if (flow.kind === 'lead') return tapLead(flow, state, target);
  // A popover being looked at: the tap closes it and nothing more (a second tap opens what it lands on).
  if (isPopover(flow)) return IDLE;
  const me = findCharacter(state, characterId);
  const active = me?.status === 'active';
  const mine: Place | null = active ? me.at : null;
  if (target.kind === 'lure' || target.kind === 'cart') {
    const thing =
      target.kind === 'lure'
        ? state.lures.find((l) => l.id === target.id)
        : state.carts.find((c) => c.id === target.id);
    if (!thing) return flow;
    // Selected, a lure or cart on another hex is a place to walk to, like the hex under it.
    if (isSelecting(flow) && !(mine?.kind === 'hex' && hexEquals(mine.hex, thing.hex))) {
      return tap(flow, state, characterId, { kind: 'hex', hex: thing.hex });
    }
    return { kind: target.kind, id: target.id };
  }
  if (target.kind === 'character') {
    // Another player's character on a tile shared with something else: the picker; else its card (you
    // can only move your own). Again closes.
    const who = findCharacter(state, target.id);
    if (who?.status === 'active' && who.at.kind === 'hex') {
      const shared = shareOf(flow, state, characterId, who.at.hex);
      if (shared) return shared;
    }
    return flow.kind === 'character' && flow.id === target.id ? IDLE : openCharacter(target.id);
  }
  const hex = target.kind === 'hex' ? target.hex : null;
  const to = hex ? placeAt(state, hex) : mine;
  if (!to) return flow;
  if (to.kind === 'creature') return tapCreature(flow, state, characterId);
  // A tile with several things to tap: the picker (a plan in progress still plans a walk to a tile that
  // holds no threat; the same tile again closes it).
  const shared = shareOf(flow, state, characterId, to.hex);
  if (shared) return shared;
  const onMe = mine !== null && placeEquals(mine, to);
  if (onMe && active) {
    // Your own character first: select it, or let go of it.
    if (isSelecting(flow)) return IDLE;
    if (me.actionsLeft > 0 || me.pinnedDay !== undefined) return { kind: 'selected' };
    return look(flow, state, to.hex);
  }
  // A threat's hex opens its card (its strike, when you are near), even while selected: no one plans a walk
  // onto a threat, and the card is the way to strike it.
  const threat = threatAt(state, to.hex);
  if (threat !== null) {
    return flow.kind === 'threat' && flow.id === threat ? IDLE : { kind: 'threat', id: threat };
  }
  if (isSelecting(flow)) {
    if (flow.kind === 'planned' && placeEquals(flow.to, to)) return flow;
    const plan = planPath(state, characterId, to);
    if (plan.ok && plan.steps.length > 0) {
      return { kind: 'planned', to, steps: plan.steps, cost: plan.cost };
    }
    // Out of reach: the mark first (a settlement still opens its card); the same hex again is looked at.
    // A refusal the cart gives (you sit in it, it cannot roll there) says why, with a tip.
    const again = flow.kind === 'out-of-reach' && hexEquals(flow.hex, to.hex);
    const why = plan.ok ? null : moveRefusalTip(plan.reason);
    if (!again && settlementAt(state, to.hex) === null)
      return { kind: 'out-of-reach', hex: to.hex, ...(why ? { why } : {}) };
  }
  return look(flow, state, to.hex);
}

/** Tapping a hex (a shorthand for tests and callers without picking). */
export const tapHex = (flow: Flow, state: GameStateView, characterId: string, hex: Hex): Flow =>
  tap(flow, state, characterId, { kind: 'hex', hex });

/** Another player's character card (from its figure or from the bubble). */
export const openCharacter = (id: string, back?: Flow): Flow =>
  back ? { kind: 'character', id, back } : { kind: 'character', id };

/** The back button of a card opened inside another popup: back to it (else closed). */
export const goBack = (flow: Flow): Flow => ('back' in flow && flow.back ? flow.back : IDLE);

/** The bubble's way into the hub: the creature card. */
export const openHub = (): Flow => ({ kind: 'creature' });

/**
 * Walks the planned path through the core. On success the character stays selected while it has actions
 * left; a refusal (the state changed under the plan) spends nothing and clears the plan.
 */
export function confirmMove<S extends GameStateView>(
  flow: Flow,
  state: S,
  characterId: string,
): { readonly flow: Flow; readonly state: S } {
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
