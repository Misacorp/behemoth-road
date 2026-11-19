import { describe, expect, it } from 'vitest';
import {
  createGame,
  type GameState,
  hex,
  hexDistance,
  hexEquals,
  hexesInRange,
  type Hex,
  isAdjacent,
  isCreatureHex,
  isPassable,
  moveAlong,
  neighbours,
  planPath,
  reachableHexes,
  terrainAt,
} from '../src/index.ts';
import { findSeed, gameAt, nearP, P, withCharacter } from './helpers.ts';

const allPassable = (hexes: readonly Hex[]) => (s: number) =>
  hexes.every((h) => terrainAt(s, h).passable);

const keys = (hexes: readonly Hex[]) => hexes.map((h) => `${h.q},${h.r}`);

describe('planPath', () => {
  it('finds a shortest path of adjacent, enterable steps with its cost', () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = gameAt(seed);
      const to = nearP(1, -2);
      const plan = planPath(state, 'a', to);
      if (!plan.ok) {
        expect(['impassable', 'no-path', 'not-enough-actions']).toContain(plan.reason);
        continue;
      }
      expect(plan.steps.at(-1)?.hex).toEqual(to);
      expect(plan.cost).toBe(plan.steps.reduce((sum, s) => sum + s.cost, 0));
      expect(plan.steps.length).toBeGreaterThanOrEqual(hexDistance(P, to));
      let from: Hex = P;
      for (const step of plan.steps) {
        expect(isAdjacent(from, step.hex)).toBe(true);
        expect(isPassable(state, step.hex)).toBe(true);
        expect(step).toEqual({ hex: step.hex, cost: 1 }); // nothing sets `via` yet
        from = step.hex;
      }
    }
  });

  it('goes around a cliff', () => {
    const cliff = nearP(0, -2);
    const open = [nearP(1, -1), nearP(-1, 0), nearP(-1, -1), nearP(-1, -2), nearP(1, -2)];
    const target = nearP(0, -3);
    const seed = findSeed(
      (s) => !terrainAt(s, cliff).passable && allPassable([...open, nearP(1, -3), target])(s),
    );
    const plan = planPath(gameAt(seed, P, { config: { actionsPerDay: 4 } }), 'a', target);
    expect(plan).toMatchObject({ ok: true, cost: 4 });
    if (plan.ok) expect(keys(plan.steps.map((s) => s.hex))).not.toContain(keys([cliff])[0]);
  });

  it('goes around the creature, never through it', () => {
    // From west of the creature to east of it: the straight line crosses the footprint.
    const from = hex(-2, 1);
    const to = hex(2, -1);
    const ring = hexesInRange(hex(0, 0), 3).filter((h) => hexDistance(h, hex(0, 0)) >= 2);
    const seed = findSeed(allPassable(ring));
    const state = gameAt(seed, from, { config: { actionsPerDay: 10 } });
    const plan = planPath(state, 'a', to);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.steps.some((s) => isCreatureHex(state, s.hex))).toBe(false);
    expect(plan.cost).toBeGreaterThan(hexDistance(from, to));
    expect(planPath(state, 'a', hex(0, 0))).toEqual({ ok: false, reason: 'impassable' });
  });

  it('gives an empty path to where the character stands', () => {
    expect(planPath(gameAt(1), 'a', P)).toEqual({ ok: true, steps: [], cost: 0 });
  });

  it('says not-enough-actions when a path exists but costs too much', () => {
    const line = [nearP(0, -1), nearP(0, -2), nearP(0, -3), nearP(0, -4)];
    const seed = findSeed(allPassable(line));
    const state = gameAt(seed);
    expect(planPath(state, 'a', line[3]!)).toEqual({ ok: false, reason: 'not-enough-actions' });
    const rich = withCharacter(state, { ...state.characters[0]!, actionsLeft: 4 });
    expect(planPath(rich, 'a', line[3]!)).toMatchObject({ ok: true, cost: 4 });
  });

  it('says no-path when the target is walled off', () => {
    // A plain hex in the window whose every neighbour is a cliff.
    let found: { seed: number; target: Hex } | undefined;
    for (let seed = 0; seed < 5000 && !found; seed++) {
      for (const target of hexesInRange(hex(0, 0), 4)) {
        if (hexDistance(target, hex(0, 0)) < 3 || !terrainAt(seed, target).passable) continue;
        if (neighbours(target).every((n) => !terrainAt(seed, n).passable)) {
          found = { seed, target };
          break;
        }
      }
    }
    if (!found) throw new Error('no walled-in hex found');
    const state = createGame(found.seed, { characterIds: ['a'], config: { actionsPerDay: 20 } });
    expect(planPath(state, 'a', found.target)).toEqual({ ok: false, reason: 'no-path' });
  });

  it('refuses hidden, impassable and malformed targets, and unknown or lost characters', () => {
    const state = gameAt(1);
    const next = nearP(0, -1);
    expect(planPath(state, 'a', hex(0, -7))).toEqual({ ok: false, reason: 'unreachable' });
    expect(planPath(state, 'a', hex(0.5, 0))).toEqual({ ok: false, reason: 'invalid-hex' });
    expect(planPath(state, 'a', hex(Number.NaN, 0))).toEqual({ ok: false, reason: 'invalid-hex' });
    expect(planPath(state, 'b', next)).toEqual({ ok: false, reason: 'unknown-character' });
    const lost = withCharacter(state, { ...state.characters[0]!, status: 'lost' });
    expect(planPath(lost, 'a', next)).toEqual({ ok: false, reason: 'character-lost' });

    const seed = findSeed((s) => !terrainAt(s, nearP(0, -2)).passable);
    expect(planPath(gameAt(seed), 'a', nearP(0, -2))).toEqual({ ok: false, reason: 'impassable' });
  });
});

describe('moveAlong', () => {
  it('walks a planned path and spends its cost', () => {
    const line = [nearP(0, -1), nearP(0, -2), nearP(0, -3)];
    const seed = findSeed(allPassable(line));
    const state = gameAt(seed);
    const plan = planPath(state, 'a', line[2]!);
    if (!plan.ok) throw new Error(plan.reason);
    const walked = moveAlong(state, 'a', plan.steps);
    expect(walked.ok).toBe(true);
    if (walked.ok) {
      expect(walked.state.characters[0]).toMatchObject({ position: line[2], actionsLeft: 0 });
    }
  });

  it('applies nothing when any step is refused, and says which', () => {
    const seed = findSeed((s) => terrainAt(s, hex(0, -5)).passable);
    const state = gameAt(seed, hex(0, -4));
    const result = moveAlong(state, 'a', [hex(0, -5), hex(0, -6)]);
    expect(result).toEqual({ ok: false, reason: 'unreachable', step: 1 });
    const gap = moveAlong(state, 'a', [hex(0, -2)]);
    expect(gap).toEqual({ ok: false, reason: 'not-adjacent', step: 0 });
  });

  it('accepts an empty path for an active character only, and bare hexes', () => {
    const seed = findSeed(allPassable([nearP(0, -1)]));
    const state = gameAt(seed);
    expect(moveAlong(state, 'a', [])).toEqual({ ok: true, state });
    expect(moveAlong(state, 'a', [nearP(0, -1)])).toMatchObject({ ok: true });
    expect(moveAlong(state, 'b', [])).toEqual({ ok: false, reason: 'unknown-character', step: 0 });
  });
});

describe('reachableHexes', () => {
  it('lists every hex within the actions left with its cheapest cost, nearest first', () => {
    for (const seed of [1, 2, 3, 4]) {
      const state = createGame(seed, { characterIds: ['a'] });
      const start = state.characters[0]!.position;
      const reach = reachableHexes(state, 'a');
      expect(reach.length).toBeGreaterThan(3);
      expect(reach.map((r) => r.cost)).toEqual(reach.map((r) => r.cost).sort((a, b) => a - b));
      expect(reach.some((r) => hexEquals(r.hex, start))).toBe(false);
      for (const r of reach) {
        expect(isCreatureHex(state, r.hex)).toBe(false);
        expect(r.cost).toBeLessThanOrEqual(3);
        expect(r.cost).toBeGreaterThanOrEqual(hexDistance(start, r.hex));
        // The same search as planPath: the plan to each hex costs exactly this.
        expect(planPath(state, 'a', r.hex)).toMatchObject({ ok: true, cost: r.cost });
      }
      // And nothing within three steps that planPath can reach is missing.
      const listed = new Set(keys(reach.map((r) => r.hex)));
      for (const h of hexesInRange(start, 3)) {
        if (hexEquals(h, start)) continue;
        expect(listed.has(keys([h])[0]!)).toBe(planPath(state, 'a', h).ok);
      }
    }
  });

  it('shrinks as actions are spent and is empty for unknown or lost characters', () => {
    const state = gameAt(1);
    const c = state.characters[0]!;
    expect(
      reachableHexes(withCharacter(state, { ...c, actionsLeft: 1 }), 'a').map((r) => r.hex),
    ).toEqual(neighbours(P).filter((h) => isPassable(state, h)));
    expect(reachableHexes(withCharacter(state, { ...c, actionsLeft: 0 }), 'a')).toEqual([]);
    expect(reachableHexes(state, 'nobody')).toEqual([]);
    expect(reachableHexes(withCharacter(state, { ...c, status: 'lost' }), 'a')).toEqual([]);
  });
});

describe('path edge cases', () => {
  it('plans equal-cost ties the same way every time, even from a copied state', () => {
    for (const seed of [1, 2, 3]) {
      const state = gameAt(seed);
      const copy = JSON.parse(JSON.stringify(state)) as GameState;
      // Two steps away along two equal routes when both middles are open.
      const target = nearP(1, -2);
      expect(planPath(copy, 'a', target)).toEqual(planPath(state, 'a', target));
      expect(reachableHexes(copy, 'a')).toEqual(reachableHexes(state, 'a'));
    }
  });

  it('reaches a hex costing exactly the actions left, and not one step more', () => {
    const line = [nearP(0, -1), nearP(0, -2), nearP(0, -3), nearP(0, -4)];
    const seed = findSeed(allPassable(line));
    const state = gameAt(seed);
    expect(planPath(state, 'a', line[2]!)).toMatchObject({ ok: true, cost: 3 });
    expect(planPath(state, 'a', line[3]!)).toEqual({ ok: false, reason: 'not-enough-actions' });
    const reach = reachableHexes(state, 'a');
    expect(reach).toContainEqual({ hex: line[2], cost: 3 });
    expect(reach.some((r) => hexEquals(r.hex, line[3]!))).toBe(false);
  });
});
