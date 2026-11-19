import { describe, expect, it } from 'vitest';
import {
  act,
  type Action,
  checkAction,
  createGame,
  featureType,
  type GameState,
  type Hex,
  hexDistance,
  keyToHex,
  moveAlong,
  nextDay,
  ON_CREATURE,
  planPath,
  type Place,
  reachablePlaces,
} from '../src/index.ts';

/**
 * A scripted party of three plays the chain: the scout explores (the script
 * knows where hidden features are, standing in for a player following glints),
 * the engineer gathers and crafts, the scholar works a deep tomb once there is a
 * lantern. Everyone else rides the creature when idle.
 */

const NEEDS = { iron: 3, timber: 2, stone: 1 } as const;
const ORDER = ['grappling-hook', 'lantern', 'climbing-spikes'] as const;

const has = (s: GameState, item: string) => (s.inventory.items[item] ?? 0) > 0;
const mat = (s: GameState, m: string) => s.inventory.materials[m] ?? 0;

/** Materials still to gather for the remaining recipes (ignoring finds). */
const wanted = (s: GameState): Set<string> => {
  const need: Record<string, number> = { ...NEEDS };
  if (has(s, 'grappling-hook')) {
    need.iron = (need.iron ?? 0) - 2;
    need.timber = (need.timber ?? 0) - 1;
  }
  if (has(s, 'lantern')) {
    need.stone = (need.stone ?? 0) - 1;
    need.timber = (need.timber ?? 0) - 1;
  }
  if (has(s, 'climbing-spikes')) need.iron = (need.iron ?? 0) - 1;
  return new Set(
    Object.entries(need)
      .filter(([m, n]) => mat(s, m) < n)
      .map(([m]) => m),
  );
};

const hexOf = (s: GameState, id: string): Hex | null => {
  const c = s.characters.find((x) => x.id === id)!;
  return c.at.kind === 'hex' ? c.at.hex : null;
};

/** Walks as close to `target` as the actions allow. */
const walkTowards = (s: GameState, id: string, target: Place): GameState => {
  const exact = planPath(s, id, target);
  let plan = exact;
  if (!exact.ok) {
    const goal = target.kind === 'hex' ? target.hex : s.creature.centre;
    const best = reachablePlaces(s, id)
      .filter((r) => r.place.kind === 'hex')
      .sort((a, b) => {
        const da = hexDistance((a.place as { hex: Hex }).hex, goal);
        const db = hexDistance((b.place as { hex: Hex }).hex, goal);
        return da - db || a.cost - b.cost;
      })[0];
    const here = hexOf(s, id);
    if (
      !best ||
      (here && hexDistance((best.place as { hex: Hex }).hex, goal) >= hexDistance(here, goal))
    ) {
      return s;
    }
    plan = planPath(s, id, best.place);
  }
  if (!plan.ok) return s;
  const walked = moveAlong(s, id, plan.steps);
  return walked.ok ? walked.state : s;
};

const tryAct = (s: GameState, id: string, action: Action): GameState => {
  if (!checkAction(s, id, action).ok) return s;
  const result = act(s, id, action);
  return result.ok ? result.state : s;
};

/** Nearest feature hex in the window matching `test`, by distance from the character. */
const nearest = (s: GameState, id: string, test: (key: string) => boolean): Hex | null => {
  const from = hexOf(s, id) ?? s.creature.centre;
  const window = s.config.windowRadius - 1;
  return (
    Object.keys(s.features)
      .filter(test)
      .map(keyToHex)
      .filter((h) => hexDistance(h, s.creature.centre) <= window)
      .sort((a, b) => hexDistance(a, from) - hexDistance(b, from))[0] ?? null
  );
};

const goHomeIfIdle = (s: GameState, id: string): GameState => {
  const here = hexOf(s, id);
  if (!here) return s;
  return walkTowards(s, id, ON_CREATURE);
};

/** An idle character gathers a wanted material nearby, or heads home. */
const helpGather = (s0: GameState, id: string): GameState => {
  let s = s0;
  const want = wanted(s);
  const node = nearest(s, id, (k) => {
    const f = s.features[k]!;
    const t = featureType(f.type);
    return f.revealed && t.kind === 'node' && f.left > 0 && want.has(t.yields.material);
  });
  if (!node) return goHomeIfIdle(s, id);
  s = walkTowards(s, id, { kind: 'hex', hex: node });
  while (checkAction(s, id, { kind: 'gather' }).ok && wanted(s).size > 0) {
    s = tryAct(s, id, { kind: 'gather' });
  }
  return s;
};

const playDay = (s0: GameState): GameState => {
  let s = s0;
  // Scout: reveal the nearest hidden feature.
  const hidden = nearest(s, 'scout', (k) => !s.features[k]!.revealed);
  s = hidden ? walkTowards(s, 'scout', { kind: 'hex', hex: hidden }) : goHomeIfIdle(s, 'scout');

  // Engineer: craft what it can, else gather what is still wanted.
  for (const recipe of ORDER) s = tryAct(s, 'engineer', { kind: 'craft', recipe });
  const want = wanted(s);
  const node = nearest(s, 'engineer', (k) => {
    const f = s.features[k]!;
    const t = featureType(f.type);
    return f.revealed && t.kind === 'node' && f.left > 0 && want.has(t.yields.material);
  });
  if (node) {
    s = walkTowards(s, 'engineer', { kind: 'hex', hex: node });
    while (checkAction(s, 'engineer', { kind: 'gather' }).ok && wanted(s).size > 0) {
      s = tryAct(s, 'engineer', { kind: 'gather' });
    }
  } else {
    s = goHomeIfIdle(s, 'engineer');
  }

  // Scholar: once there is a lantern, work the nearest revealed deep tomb.
  const tomb = has(s, 'lantern')
    ? nearest(s, 'scholar', (k) => {
        const f = s.features[k]!;
        const t = featureType(f.type);
        return f.revealed && t.kind === 'site' && t.tier === 2 && f.left > 0;
      })
    : null;
  if (tomb && !has(s, 'climbing-spikes') && mat(s, 'ancient-alloy') === 0) {
    s = walkTowards(s, 'scholar', { kind: 'hex', hex: tomb });
    s = tryAct(s, 'scholar', { kind: 'work-site' });
  } else {
    s = helpGather(s, 'scholar');
  }
  s = helpGather(s, 'scout');
  return nextDay(s);
};

const playChain = (seed: number, maxDays: number) => {
  let s = createGame([seed, 0x5eed, 0xc4a1, 0x3], {
    characterIds: ['scout', 'engineer', 'scholar'],
    artSeed: 0,
  });
  s = { ...s, characters: s.characters.map((c) => ({ ...c, role: c.id })) };
  const milestones: Record<string, number> = {};
  for (let day = 1; day <= maxDays; day++) {
    s = playDay(s);
    for (const item of ORDER) if (has(s, item) && !milestones[item]) milestones[item] = day;
    if ((s.inventory.materials['ancient-alloy'] ?? 0) > 0 && !milestones.alloy)
      milestones.alloy = day;
    if (has(s, 'climbing-spikes')) break;
  }
  return { state: s, milestones };
};

describe('the first chain', () => {
  // Measured with this script (3 characters): the spikes come on days 21–45 on
  // 10 of 12 maps (median about 34); the hook takes 5–34 days, mostly waiting for
  // timber and iron to come into view. Real parties are larger.
  it('runs from scouting to climbing spikes within a few weeks', () => {
    const { state, milestones } = playChain(1, 40);
    expect(Object.keys(milestones).sort()).toEqual([
      'alloy',
      'climbing-spikes',
      'grappling-hook',
      'lantern',
    ]);
    expect(milestones['grappling-hook']!).toBeLessThan(milestones['climbing-spikes']!);
    expect(milestones.lantern!).toBeLessThanOrEqual(milestones.alloy!);
    expect(milestones['climbing-spikes']!).toBeLessThanOrEqual(40);
    expect(state.characters.every((c) => c.status === 'active')).toBe(true);
  });

  it('is reachable on most maps', () => {
    const days: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { milestones } = playChain(seed, 60);
      days.push(milestones['climbing-spikes'] ?? Infinity);
    }
    const done = days.filter((d) => d <= 60);
    expect(done.length).toBeGreaterThanOrEqual(9);
    expect(days.filter((d) => d <= 45).length).toBeGreaterThanOrEqual(9);
  });
});
