/**
 * The guided first day of the practice map, as pure rules over what the map already shows: where you
 * stand, what is planned, how many actions you have left. The coach never acts for you and never blocks
 * a tap (mistakes are free); it only says which step you are on and what to light.
 *
 * Steps: select yourself, tap the glowing tile, confirm the arrow (its cost shows with it), then one
 * action of your role (C1 to C5, C6 for the roles). Skipping is the player's, any time; there is no
 * failing: with no actions left and the day's step undone, the coach offers starting over.
 */
import {
  creatureHexes,
  type GameStateView,
  type Hex,
  onHex,
  ON_CREATURE,
  type Place,
  placeEquals,
} from '@behemoth-road/core';
import { type Flow, isSelecting } from '../map/flow.ts';
import { hexAt, type SpotName } from './sandbox.ts';

export type PracticeAction = 'survey' | 'gather' | 'work-site' | 'feed' | 'defend';

/** The five steps in order, as the dots show them (the first four are the same for everyone). */
export const STEPS = ['select', 'tile', 'confirm', 'act'] as const;
export type Step = (typeof STEPS)[number] | 'done' | 'stuck';

export interface PracticePlan {
  readonly role: string;
  /** Where the glowing tile is: a hex, or the creature (to board it). */
  readonly target: Place;
  /** A scout's veiled hex to look at once there. */
  readonly look: Hex | null;
  /** The role's first real action (C6). */
  readonly action: PracticeAction;
}

/** The role's glowing tile and first action (what the storyboard's C6 lists), on a practice map. */
export function planFor(state: GameStateView, role: string): PracticePlan {
  const spot = (name: SpotName): Place => onHex(hexAt(state, name));
  switch (role) {
    case 'scholar':
      return { role, target: spot('ruin'), look: null, action: 'work-site' };
    case 'engineer':
      return { role, target: spot('iron'), look: null, action: 'gather' };
    case 'keeper':
      return { role, target: ON_CREATURE, look: null, action: 'feed' };
    case 'warden':
      return { role, target: ON_CREATURE, look: null, action: 'defend' };
    default:
      return {
        role: 'scout',
        target: spot('lookout'),
        look: hexAt(state, 'iron'),
        action: 'survey',
      };
  }
}

export interface CoachInput {
  readonly flow: Flow;
  readonly state: GameStateView;
  readonly characterId: string;
  /** Your actions left when you first reached the glowing tile (null until you have). */
  readonly arrivalActions: number | null;
}

const arrived = (plan: PracticePlan, at: Place): boolean => placeEquals(at, plan.target);

/** Where your character is, as a place; null when it is not active. */
function myPlace(state: GameStateView, id: string): { at: Place; actionsLeft: number } | null {
  const me = state.characters.find((c) => c.id === id);
  if (me?.status !== 'active') return null;
  return {
    at: me.at.kind === 'creature' ? ON_CREATURE : onHex(me.at.hex),
    actionsLeft: me.actionsLeft,
  };
}

/** Whether you have reached the glowing tile (the coach then remembers the actions you had). */
export function hasArrived(plan: PracticePlan, state: GameStateView, id: string): boolean {
  const me = myPlace(state, id);
  return me !== null && arrived(plan, me.at);
}

export function coachStep(plan: PracticePlan, i: CoachInput): Step {
  const me = myPlace(i.state, i.characterId);
  if (me === null) return 'stuck';
  const here = arrived(plan, me.at);
  if (here && i.arrivalActions !== null && me.actionsLeft < i.arrivalActions) return 'done';
  if (me.actionsLeft === 0) return 'stuck';
  if (here) return 'act';
  if (!isSelecting(i.flow)) return 'select';
  const planned = i.flow.kind === 'planned' && placeEquals(i.flow.to, plan.target);
  return planned ? 'confirm' : 'tile';
}

/** What the map lights for a step. */
export interface CoachMap {
  readonly step: Step;
  /** Hexes that glow (the glowing tile, the veiled hex to look at, or the creature's footprint). */
  readonly glow: readonly Hex[];
  /** A ring around your own character. */
  readonly ringMe: boolean;
  /** Where the ghost hand taps, if anywhere. */
  readonly hand: Hex | null;
  /** The part of the interface to pulse: the arrow's confirm tick, or your action's button. */
  readonly mark: 'confirm' | 'act' | null;
}

const centreOf = (hexes: readonly Hex[]): Hex => {
  const q = hexes.reduce((s, h) => s + h.q, 0) / hexes.length;
  const r = hexes.reduce((s, h) => s + h.r, 0) / hexes.length;
  return { q: Math.round(q), r: Math.round(r) };
};

export function coachMap(plan: PracticePlan, i: CoachInput): CoachMap {
  const step = coachStep(plan, i);
  const me = i.state.characters.find((c) => c.id === i.characterId);
  const myHex = me?.status === 'active' && me.at.kind === 'hex' ? me.at.hex : null;
  const targetHexes: readonly Hex[] =
    plan.target.kind === 'hex' ? [plan.target.hex] : creatureHexes(i.state);
  const none: CoachMap = { step, glow: [], ringMe: false, hand: null, mark: null };
  switch (step) {
    case 'select':
      return { ...none, ringMe: true, hand: myHex ?? centreOf(creatureHexes(i.state)) };
    case 'tile':
      return { ...none, glow: targetHexes, hand: centreOf(targetHexes) };
    case 'confirm':
      return { ...none, glow: targetHexes, mark: 'confirm' };
    case 'act': {
      if (plan.look) {
        const looked = i.state.tiles[`${String(plan.look.q)},${String(plan.look.r)}`]?.explored;
        if (looked !== true) return { ...none, glow: [plan.look], hand: plan.look, mark: 'act' };
      }
      // Once the card or the hub is open the action's own button pulses; before it, your own character
      // (or the creature) is the thing to tap.
      const open = i.flow.kind === 'selected' || i.flow.kind === 'creature';
      if (open) return { ...none, mark: 'act' };
      return plan.target.kind === 'creature'
        ? { ...none, glow: targetHexes, hand: centreOf(targetHexes), mark: 'act' }
        : { ...none, ringMe: true, hand: myHex, mark: 'act' };
    }
    default:
      return none;
  }
}

/** The short line for a step (the storyboard's copy), or null. */
export function captionFor(step: Step, plan: PracticePlan): string | null {
  switch (step) {
    case 'select':
      return 'Tap yourself';
    case 'tile':
      return 'Tap the glowing tile';
    case 'confirm':
      return 'Tap ✓';
    case 'act':
      return ACTION_LINES[plan.action];
    default:
      return null;
  }
}

export const ACTION_LINES: Readonly<Record<PracticeAction, string>> = {
  survey: 'Look around',
  gather: 'Gather',
  'work-site': 'Study it',
  feed: 'Feed it',
  defend: 'Stand guard',
};

/** The dot (0-based) a step lights, or all of them once done. */
export const dotOf = (step: Step): number =>
  step === 'done' ? STEPS.length : step === 'stuck' ? 0 : STEPS.indexOf(step);
