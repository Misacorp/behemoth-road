import { describe, expect, it } from 'vitest';
import {
  createGame,
  hex,
  hexDistance,
  hexEquals,
  hexesInRange,
  type Hex,
  isAdjacent,
  isPassable,
  moveAlong,
  neighbours,
  planPath,
  reachableHexes,
  terrainAt,
} from '../src/index.ts';
import { findSeed, placeCharacter, withCharacter } from './helpers.ts';

describe('planPath', () => {
  it('finds a shortest path of adjacent, passable steps with its cost', () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = createGame(seed, { characterIds: ['a'] });
      const to = hex(1, -3);
      const plan = planPath(state, 'a', to);
      if (!plan.ok) {
        expect(['impassable', 'no-path', 'not-enough-actions']).toContain(plan.reason);
        continue;
      }
      expect(plan.steps.at(-1)?.hex).toEqual(to);
      expect(plan.cost).toBe(plan.steps.reduce((sum, s) => sum + s.cost, 0));
      expect(plan.steps.length).toBeGreaterThanOrEqual(hexDistance(hex(0, 0), to));
      let from: Hex = hex(0, 0);
      for (const step of plan.steps) {
        expect(isAdjacent(from, step.hex)).toBe(true);
        expect(isPassable(state, step.hex)).toBe(true);
        expect(step).toEqual({ hex: step.hex, cost: 1 }); // nothing sets `via` yet
        from = step.hex;
      }
    }
  });

  it('goes around a cliff', () => {
    // A cliff straight ahead at distance 2, with open ground on either side of it.
    const open = [hex(-1, -1), hex(-1, -2), hex(1, -2), hex(1, -3), hex(0, -3)];
    const seed = findSeed(
      (s) => !terrainAt(s, hex(0, -2)).passable && open.every((h) => terrainAt(s, h).passable),
    );
    const state = createGame(seed, { characterIds: ['a'], config: { actionsPerDay: 4 } });
    const plan = planPath(state, 'a', hex(0, -3));
    expect(plan).toMatchObject({ ok: true, cost: 4 });
    if (plan.ok) expect(plan.steps.map((s) => `${s.hex.q},${s.hex.r}`)).not.toContain('0,-2');
  });

  it('gives an empty path to where the character stands', () => {
    const state = createGame(1, { characterIds: ['a'] });
    expect(planPath(state, 'a', hex(0, 0))).toEqual({ ok: true, steps: [], cost: 0 });
  });

  it('says not-enough-actions when a path exists but costs too much', () => {
    const line = [hex(0, 1), hex(0, 2), hex(0, 3), hex(0, 4)];
    const seed = findSeed((s) => line.every((h) => terrainAt(s, h).passable));
    const state = createGame(seed, { characterIds: ['a'] });
    expect(planPath(state, 'a', hex(0, 4))).toEqual({ ok: false, reason: 'not-enough-actions' });
    const rich = withCharacter(state, { ...state.characters[0]!, actionsLeft: 4 });
    expect(planPath(rich, 'a', hex(0, 4))).toMatchObject({ ok: true, cost: 4 });
  });

  it('says no-path when the target is walled off', () => {
    // A plain hex in the window whose every neighbour is a cliff outside the creature.
    let found: { seed: number; target: Hex } | undefined;
    for (let seed = 0; seed < 5000 && !found; seed++) {
      for (let r = -5; r <= -2 && !found; r++) {
        for (let q = -3; q <= 3 && !found; q++) {
          const target = hex(q, r);
          if (hexDistance(target, hex(0, 0)) > 4 || hexDistance(target, hex(0, 0)) < 3) continue;
          if (!terrainAt(seed, target).passable) continue;
          if (neighbours(target).every((n) => !terrainAt(seed, n).passable))
            found = { seed, target };
        }
      }
    }
    if (!found) throw new Error('no walled-in hex found');
    const state = createGame(found.seed, { characterIds: ['a'], config: { actionsPerDay: 20 } });
    expect(planPath(state, 'a', found.target)).toEqual({ ok: false, reason: 'no-path' });
  });

  it('refuses hidden, impassable and malformed targets, and unknown or lost characters', () => {
    const state = createGame(1, { characterIds: ['a'] });
    expect(planPath(state, 'a', hex(0, -7))).toEqual({ ok: false, reason: 'unreachable' });
    expect(planPath(state, 'a', hex(0.5, 0))).toEqual({ ok: false, reason: 'invalid-hex' });
    expect(planPath(state, 'a', hex(Number.NaN, 0))).toEqual({ ok: false, reason: 'invalid-hex' });
    expect(planPath(state, 'b', hex(0, -1))).toEqual({ ok: false, reason: 'unknown-character' });
    const lost = withCharacter(state, { ...state.characters[0]!, status: 'lost' });
    expect(planPath(lost, 'a', hex(0, -1))).toEqual({ ok: false, reason: 'character-lost' });

    const seed = findSeed((s) => !terrainAt(s, hex(0, -3)).passable);
    const cliffState = createGame(seed, { characterIds: ['a'] });
    expect(planPath(cliffState, 'a', hex(0, -3))).toEqual({ ok: false, reason: 'impassable' });
  });
});

describe('moveAlong', () => {
  it('walks a planned path and spends its cost', () => {
    const line = [hex(0, -1), hex(0, -2), hex(0, -3)];
    const seed = findSeed((s) => line.every((h) => terrainAt(s, h).passable));
    const state = createGame(seed, { characterIds: ['a'] });
    const plan = planPath(state, 'a', hex(0, -3));
    if (!plan.ok) throw new Error(plan.reason);
    const walked = moveAlong(state, 'a', plan.steps);
    expect(walked.ok).toBe(true);
    if (walked.ok) {
      expect(walked.state.characters[0]).toMatchObject({ position: hex(0, -3), actionsLeft: 0 });
    }
  });

  it('applies nothing when any step is refused, and says which', () => {
    const seed = findSeed((s) => terrainAt(s, hex(0, -5)).passable);
    const state = placeCharacter(createGame(seed, { characterIds: ['a'] }), 'a', hex(0, -4));
    const result = moveAlong(state, 'a', [hex(0, -5), hex(0, -6)]);
    expect(result).toEqual({ ok: false, reason: 'unreachable', step: 1 });
    const gap = moveAlong(state, 'a', [hex(0, -2)]);
    expect(gap).toEqual({ ok: false, reason: 'not-adjacent', step: 0 });
  });

  it('accepts an empty path for an active character only', () => {
    const state = createGame(1, { characterIds: ['a'] });
    expect(moveAlong(state, 'a', [])).toEqual({ ok: true, state });
    expect(moveAlong(state, 'a', [hex(0, -1)])).toMatchObject({ ok: true }); // bare hexes work too
    expect(moveAlong(state, 'b', [])).toEqual({ ok: false, reason: 'unknown-character', step: 0 });
  });
});

describe('reachableHexes', () => {
  it('lists every hex within the actions left with its cheapest cost, nearest first', () => {
    for (const seed of [1, 2, 3, 4]) {
      const state = createGame(seed, { characterIds: ['a'] });
      const reach = reachableHexes(state, 'a');
      expect(reach.length).toBeGreaterThan(6);
      expect(reach.map((r) => r.cost)).toEqual(reach.map((r) => r.cost).sort((a, b) => a - b));
      expect(reach.some((r) => hexEquals(r.hex, hex(0, 0)))).toBe(false);
      for (const r of reach) {
        expect(r.cost).toBeLessThanOrEqual(3);
        expect(r.cost).toBeGreaterThanOrEqual(hexDistance(hex(0, 0), r.hex));
        // The same search as planPath: the plan to each hex costs exactly this.
        expect(planPath(state, 'a', r.hex)).toMatchObject({ ok: true, cost: r.cost });
      }
      // And nothing within three steps that planPath can reach is missing.
      const listed = new Set(reach.map((r) => `${r.hex.q},${r.hex.r}`));
      for (const h of hexesInRange(hex(0, 0), 3)) {
        if (hexEquals(h, hex(0, 0))) continue;
        expect(listed.has(`${h.q},${h.r}`)).toBe(planPath(state, 'a', h).ok);
      }
    }
  });

  it('shrinks as actions are spent and is empty for unknown or lost characters', () => {
    const state = createGame(1, { characterIds: ['a'] });
    const tired = withCharacter(state, { ...state.characters[0]!, actionsLeft: 1 });
    expect(reachableHexes(tired, 'a').map((r) => r.hex)).toEqual(
      neighbours(hex(0, 0)).filter((h) => isPassable(state, h)),
    );
    expect(
      reachableHexes(withCharacter(state, { ...state.characters[0]!, actionsLeft: 0 }), 'a'),
    ).toEqual([]);
    expect(reachableHexes(state, 'nobody')).toEqual([]);
    expect(
      reachableHexes(withCharacter(state, { ...state.characters[0]!, status: 'lost' }), 'a'),
    ).toEqual([]);
  });
});

describe('path edge cases', () => {
  it('plans equal-cost ties the same way every time, even from a copied state', () => {
    for (const seed of [1, 2, 3]) {
      const state = createGame(seed, { characterIds: ['a'] });
      const copy = JSON.parse(JSON.stringify(state)) as typeof state;
      // (2, -2) is two steps away by two equal routes when both middles are open.
      const plans = [planPath(state, 'a', hex(2, -2)), planPath(copy, 'a', hex(2, -2))];
      expect(plans[1]).toEqual(plans[0]);
      expect(reachableHexes(copy, 'a')).toEqual(reachableHexes(state, 'a'));
    }
  });

  it('reaches a hex costing exactly the actions left, and not one step more', () => {
    const line = [hex(0, -1), hex(0, -2), hex(0, -3), hex(0, -4)];
    const seed = findSeed((s) => line.every((h) => terrainAt(s, h).passable));
    const state = createGame(seed, { characterIds: ['a'] });
    expect(planPath(state, 'a', hex(0, -3))).toMatchObject({ ok: true, cost: 3 });
    expect(planPath(state, 'a', hex(0, -4))).toEqual({ ok: false, reason: 'not-enough-actions' });
    const reach = reachableHexes(state, 'a');
    expect(reach).toContainEqual({ hex: hex(0, -3), cost: 3 });
    expect(reach.some((r) => hexEquals(r.hex, hex(0, -4)))).toBe(false);
  });

  it('plans and reaches onto a creature hex that lies over a cliff', () => {
    const ring = neighbours(hex(0, 0));
    const seed = findSeed((s) => ring.some((h) => !terrainAt(s, h).passable));
    const state = createGame(seed, { characterIds: ['a'] });
    const cliff = ring.find((h) => !terrainAt(seed, h).passable)!;
    expect(planPath(state, 'a', cliff)).toEqual({
      ok: true,
      steps: [{ hex: cliff, cost: 1 }],
      cost: 1,
    });
    expect(reachableHexes(state, 'a')).toContainEqual({ hex: cliff, cost: 1 });
  });
});
