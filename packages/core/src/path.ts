/**
 * Multi-step movement: what a character can reach, the cheapest path to a
 * place, and walking a path. The creature is one place: a path may cross it by
 * boarding and stepping off. Every step follows the same rules as `move`.
 */

import {
  activeCharacter,
  type Entry,
  entryToPlace,
  isPlaceReachable,
  move,
  type MoveRefusal,
  stepOnly,
} from './actions.ts';
import type { GameEvent } from './features.ts';
import type { Hex } from './hex.ts';
import { placeEquals, placeKey, placeNeighbours, toPlace } from './places.ts';
import { type GameStateView, isSeasonOver, type Place } from './state.ts';

/** One step of a path: the place stepped onto, what it costs, and what makes it possible. */
export interface PathStep extends Entry {
  readonly place: Place;
}

export interface ReachablePlace {
  readonly place: Place;
  /** The cheapest total cost to get there. */
  readonly cost: number;
}

export type PathRefusal = Exclude<MoveRefusal, 'not-adjacent'> | 'no-path';

export type PathPlan =
  | {
      readonly ok: true;
      /** The steps in order, not including the start. Empty when already there. */
      readonly steps: readonly PathStep[];
      /** Total actions the path costs. */
      readonly cost: number;
    }
  | { readonly ok: false; readonly reason: PathRefusal };

export type PathResult<S extends GameStateView = GameStateView> =
  | {
      readonly ok: true;
      readonly state: S;
      /** What happened on the way: reveals, a scout's glints, a trap. */
      readonly events: readonly GameEvent[];
      /** Set when a hidden trap or a hazard stopped the walk at that step (the rest was not taken). */
      readonly stopped: { readonly step: number; readonly reason: 'trap' } | null;
    }
  | {
      readonly ok: false;
      readonly reason: MoveRefusal;
      /** Index in the path of the step that was refused. */
      readonly step: number;
    };

interface Visit {
  readonly place: Place;
  readonly cost: number;
  /** The step that arrived here (null for the start). */
  readonly step: PathStep | null;
  readonly from: string | null;
}

/**
 * Cheapest-cost search (Dijkstra) from `start` over places in reach that can be
 * entered, up to `budget` actions. Ties are broken by neighbour order, so the
 * result is the same every time. Visits come back in the order they were settled.
 */
const search = (state: GameStateView, start: Place, budget: number): Map<string, Visit> => {
  const settled = new Map<string, Visit>();
  const origin: Visit = { place: start, cost: 0, step: null, from: null };
  const best = new Map<string, Visit>([[placeKey(start), origin]]);
  // The reachable area is a few hundred places at most, so scanning the frontier
  // for its cheapest entry is plenty. The first of equal costs wins: ties are stable.
  const frontier: Visit[] = [origin];
  for (;;) {
    let next = -1;
    let current: Visit | undefined;
    for (const [i, visit] of frontier.entries()) {
      if (!current || visit.cost < current.cost) {
        current = visit;
        next = i;
      }
    }
    if (!current) break;
    frontier.splice(next, 1);
    const key = placeKey(current.place);
    if (settled.has(key)) continue;
    settled.set(key, current);
    for (const place of placeNeighbours(state, current.place)) {
      const nextKey = placeKey(place);
      if (settled.has(nextKey) || !isPlaceReachable(state, place)) continue;
      const entry = entryToPlace(state, place);
      if (!entry) continue;
      const cost = current.cost + entry.cost;
      if (cost > budget) continue;
      const known = best.get(nextKey);
      if (known && known.cost <= cost) continue;
      const visit: Visit = { place, cost, step: { ...entry, place }, from: key };
      best.set(nextKey, visit);
      frontier.push(visit);
    }
  }
  return settled;
};

/**
 * Every place a character can reach with the actions it has left (the creature
 * included), with the cheapest cost, nearest first. Excludes where it is. Empty
 * for an unknown or lost character.
 */
export const reachablePlaces = (state: GameStateView, characterId: string): ReachablePlace[] => {
  const found = activeCharacter(state, characterId);
  if (!found.ok || isSeasonOver(state)) return [];
  const { at, actionsLeft } = found.character;
  return [...search(state, at, actionsLeft).values()]
    .filter((v) => v.step !== null)
    .map((v) => ({ place: v.place, cost: v.cost }));
};

/**
 * The cheapest path for a character to a place (any footprint hex means the
 * creature), as steps with their costs. Refused if the target cannot be entered,
 * nothing connects to it, or the cheapest path costs more than the actions left.
 */
export const planPath = (state: GameStateView, characterId: string, to: Hex | Place): PathPlan => {
  if (isSeasonOver(state)) return { ok: false, reason: 'season-over' };
  const target = toPlace(state, to);
  if (!target) return { ok: false, reason: 'invalid-hex' };
  const found = activeCharacter(state, characterId);
  if (!found.ok) return found;
  const start = found.character.at;
  if (placeEquals(start, target)) return { ok: true, steps: [], cost: 0 };
  if (!isPlaceReachable(state, target)) return { ok: false, reason: 'unreachable' };
  if (!entryToPlace(state, target)) return { ok: false, reason: 'impassable' };

  const visits = search(state, start, Number.POSITIVE_INFINITY);
  const end = visits.get(placeKey(target));
  if (!end) return { ok: false, reason: 'no-path' };
  if (end.cost > found.character.actionsLeft) return { ok: false, reason: 'not-enough-actions' };
  const steps: PathStep[] = [];
  for (let v: Visit | undefined = end; v?.step; v = v.from ? visits.get(v.from) : undefined) {
    steps.unshift(v.step);
  }
  return { ok: true, steps, cost: end.cost };
};

const isStep = (item: Hex | Place | PathStep): item is PathStep =>
  typeof item === 'object' && item !== null && 'place' in item;

/**
 * Walks a path. The whole path is checked first, without what happens on
 * arrival: if any step is refused, nothing applies (all or nothing). Then the
 * steps are taken one by one, each revealing what it enters; a hidden trap that
 * catches the character stops the walk there, and the rest is not taken or
 * spent (`stopped`). Takes the steps from `planPath`, places, or bare hexes.
 */
export const moveAlong = <S extends GameStateView>(
  state: S,
  characterId: string,
  path: readonly (Hex | Place | PathStep)[],
): PathResult<S> => {
  if (isSeasonOver(state)) return { ok: false, reason: 'season-over', step: 0 };
  const found = activeCharacter(state, characterId);
  if (!found.ok) return { ok: false, reason: found.reason, step: 0 };
  const places = path.map((item) => (isStep(item) ? item.place : item));
  let check = state;
  for (const [step, to] of places.entries()) {
    const result = stepOnly(check, characterId, to);
    if (!result.ok) return { ok: false, reason: result.reason, step };
    check = result.state;
  }
  let current = state;
  const events: GameEvent[] = [];
  for (const [step, to] of places.entries()) {
    const result = move(current, characterId, to);
    // Checked above; a refusal here would mean a reveal changed the rules mid-walk.
    if (!result.ok) return { ok: false, reason: result.reason, step };
    current = result.state;
    events.push(...result.events);
    if (result.trapped) {
      return { ok: true, state: current, events, stopped: { step, reason: 'trap' } };
    }
  }
  return { ok: true, state: current, events, stopped: null };
};
