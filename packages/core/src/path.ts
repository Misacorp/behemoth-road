/**
 * Multi-hex movement: what a character can reach, the cheapest path to a hex,
 * and walking a path. Every step follows the same rules as `move`.
 */

import { activeCharacter, type Entry, entryInto, move, type MoveRefusal } from './actions.ts';
import { type Hex, hexEquals, hexKey, isValidHex, neighbours } from './hex.ts';
import type { GameState } from './state.ts';
import { isReachable } from './window.ts';

/** One step of a path: the hex stepped onto, what it costs, and what makes it possible. */
export interface PathStep extends Entry {
  readonly hex: Hex;
}

export interface ReachableHex {
  readonly hex: Hex;
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

export type PathResult =
  | { readonly ok: true; readonly state: GameState }
  | {
      readonly ok: false;
      readonly reason: MoveRefusal;
      /** Index in the path of the step that was refused. */
      readonly step: number;
    };

interface Visit {
  readonly hex: Hex;
  readonly cost: number;
  /** The step that arrived here (null for the start). */
  readonly step: PathStep | null;
  readonly from: string | null;
}

/**
 * Cheapest-cost search (Dijkstra) from `start` over reachable hexes that can be
 * entered, up to `budget` actions. Ties are broken by direction order, so the
 * result is the same every time. Visits come back in the order they were settled.
 */
const search = (state: GameState, start: Hex, budget: number): Map<string, Visit> => {
  const settled = new Map<string, Visit>();
  const best = new Map<string, Visit>([
    [hexKey(start), { hex: start, cost: 0, step: null, from: null }],
  ]);
  // The reachable area is a few hundred hexes at most, so a sorted frontier is plenty.
  const frontier: Visit[] = [best.get(hexKey(start)) as Visit];
  while (frontier.length > 0) {
    let next = 0;
    for (let i = 1; i < frontier.length; i++) {
      if ((frontier[i] as Visit).cost < (frontier[next] as Visit).cost) next = i;
    }
    const current = frontier.splice(next, 1)[0] as Visit;
    const key = hexKey(current.hex);
    if (settled.has(key)) continue;
    settled.set(key, current);
    for (const h of neighbours(current.hex)) {
      const nextKey = hexKey(h);
      if (settled.has(nextKey) || !isReachable(state, h)) continue;
      const entry = entryInto(state, h);
      if (!entry) continue;
      const cost = current.cost + entry.cost;
      if (cost > budget) continue;
      const known = best.get(nextKey);
      if (known && known.cost <= cost) continue;
      const visit: Visit = { hex: h, cost, step: { ...entry, hex: h }, from: key };
      best.set(nextKey, visit);
      frontier.push(visit);
    }
  }
  return settled;
};

/**
 * Every hex a character can reach with the actions it has left, with the
 * cheapest cost, nearest first. Excludes where it stands. Empty for an unknown
 * or lost character.
 */
export const reachableHexes = (state: GameState, characterId: string): ReachableHex[] => {
  const found = activeCharacter(state, characterId);
  if (!found.ok) return [];
  const { position, actionsLeft } = found.character;
  return [...search(state, position, actionsLeft).values()]
    .filter((v) => v.step !== null)
    .map((v) => ({ hex: v.hex, cost: v.cost }));
};

/**
 * The cheapest path for a character to `to`, as steps with their costs. Refused
 * if the target cannot be entered, nothing connects to it, or the cheapest path
 * costs more than the actions left.
 */
export const planPath = (state: GameState, characterId: string, to: Hex): PathPlan => {
  if (!isValidHex(to)) return { ok: false, reason: 'invalid-hex' };
  const found = activeCharacter(state, characterId);
  if (!found.ok) return found;
  const start = found.character.position;
  if (hexEquals(start, to)) return { ok: true, steps: [], cost: 0 };
  if (!isReachable(state, to)) return { ok: false, reason: 'unreachable' };
  if (!entryInto(state, to)) return { ok: false, reason: 'impassable' };

  const visits = search(state, start, Number.POSITIVE_INFINITY);
  const end = visits.get(hexKey(to));
  if (!end) return { ok: false, reason: 'no-path' };
  if (end.cost > found.character.actionsLeft) return { ok: false, reason: 'not-enough-actions' };
  const steps: PathStep[] = [];
  for (let v: Visit | undefined = end; v?.step; v = v.from ? visits.get(v.from) : undefined) {
    steps.unshift(v.step);
  }
  return { ok: true, steps, cost: end.cost };
};

/**
 * Walks a path through `move`: every step applies, or none does. Takes the
 * steps from `planPath` or bare hexes.
 */
export const moveAlong = (
  state: GameState,
  characterId: string,
  path: readonly (Hex | PathStep)[],
): PathResult => {
  const found = activeCharacter(state, characterId);
  if (!found.ok) return { ok: false, reason: found.reason, step: 0 };
  let current = state;
  for (const [step, item] of path.entries()) {
    const h = typeof item === 'object' && item !== null && 'hex' in item ? item.hex : item;
    const result = move(current, characterId, h);
    if (!result.ok) return { ok: false, reason: result.reason, step };
    current = result.state;
  }
  return { ok: true, state: current };
};
