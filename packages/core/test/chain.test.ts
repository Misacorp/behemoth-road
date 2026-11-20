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
  isAdjacent,
  isCreatureHex,
  keyToHex,
  moveAlong,
  nextDay,
  ON_CREATURE,
  packSize,
  planPath,
  type Place,
  reachablePlaces,
  UNLOCKS,
} from '../src/index.ts';

/**
 * A scripted party of three plays the chain: the scout explores (the script
 * knows where hidden features are, standing in for a curious player) and
 * surveys what it finds; everyone gathers what the unlocks still need and
 * carries it back to the creature's stores; the engineer, riding, builds the
 * hook, the lantern and then the spikes; the scholar works a deep tomb once the
 * lantern is done and brings the alloy home.
 */

const ORDER = ['grappling-hook', 'lantern', 'climbing-spikes'] as const;

const done = (s: GameState, unlock: string) => s.unlocks.includes(unlock);

/** Materials the unfinished unlocks still need beyond what is in the stores and packs. */
const wanted = (s: GameState): Set<string> => {
  const need: Record<string, number> = {};
  for (const id of ORDER) {
    if (done(s, id) || s.project?.unlock === id) continue;
    for (const c of UNLOCKS.find((u) => u.id === id)!.cost) {
      need[c.material] = (need[c.material] ?? 0) + c.amount;
    }
  }
  const have: Record<string, number> = { ...s.stores };
  for (const c of s.characters) {
    for (const [m, n] of Object.entries(c.pack)) have[m] = (have[m] ?? 0) + n;
  }
  return new Set(
    Object.entries(need)
      .filter(([m, n]) => (have[m] ?? 0) < n)
      .map(([m]) => m),
  );
};

const me = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const hexOf = (s: GameState, id: string): Hex | null => {
  const at = me(s, id).at;
  return at.kind === 'hex' ? at.hex : null;
};

/** Walks as close to `target` as the actions allow. */
const walkTowards = (s: GameState, id: string, target: Place): GameState => {
  let plan = planPath(s, id, target);
  if (!plan.ok) {
    const goal = target.kind === 'hex' ? target.hex : s.creature.centre;
    const here = hexOf(s, id);
    const best = reachablePlaces(s, id)
      .flatMap((r) => (r.place.kind === 'hex' ? [{ hex: r.place.hex, cost: r.cost }] : []))
      .sort((a, b) => hexDistance(a.hex, goal) - hexDistance(b.hex, goal) || a.cost - b.cost)[0];
    if (!best || (here && hexDistance(best.hex, goal) >= hexDistance(here, goal))) return s;
    plan = planPath(s, id, { kind: 'hex', hex: best.hex });
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

/** Nearest feature hex well inside the window matching `test`. */
const nearest = (s: GameState, id: string, test: (key: string) => boolean): Hex | null => {
  const from = hexOf(s, id) ?? s.creature.centre;
  return (
    Object.keys(s.features)
      .filter(test)
      .map(keyToHex)
      .filter((h) => hexDistance(h, s.creature.centre) <= s.config.windowRadius - 2)
      .sort((a, b) => hexDistance(a, from) - hexDistance(b, from))[0] ?? null
  );
};

const wantedNode = (s: GameState, id: string) => {
  const want = wanted(s);
  return nearest(s, id, (k) => {
    const f = s.features[k]!;
    const t = featureType(f.type);
    return f.revealed && t.kind === 'node' && f.left > 0 && want.has(t.yields.material);
  });
};

/** Gather what is wanted; carry it home when full or when nothing more is wanted nearby. */
const gatherer = (s0: GameState, id: string): GameState => {
  let s = s0;
  const node = wantedNode(s, id);
  const full = packSize(me(s, id).pack) >= s.config.packCapacity;
  if (node && !full) {
    s = walkTowards(s, id, { kind: 'hex', hex: node });
    while (checkAction(s, id, { kind: 'gather' }).ok && wanted(s).size > 0) {
      s = tryAct(s, id, { kind: 'gather' });
    }
    return s;
  }
  return walkTowards(s, id, ON_CREATURE);
};

const scout = (s0: GameState): GameState => {
  let s = s0;
  const hidden = nearest(
    s,
    'scout',
    (k) => !s.features[k]!.revealed && !isCreatureHex(s, keyToHex(k)),
  );
  if (!hidden) return gatherer(s, 'scout');
  const here = hexOf(s, 'scout');
  if (!here || !isAdjacent(here, hidden)) {
    // Walk next to it (not onto it: it might be a trap), then survey.
    const beside = reachablePlaces(s, 'scout')
      .flatMap((r) => (r.place.kind === 'hex' && isAdjacent(r.place.hex, hidden) ? [r] : []))
      .sort((a, b) => a.cost - b.cost)[0];
    s = beside
      ? walkTowards(s, 'scout', beside.place)
      : walkTowards(s, 'scout', { kind: 'hex', hex: hidden });
  }
  s = tryAct(s, 'scout', { kind: 'survey', hex: hidden });
  return s;
};

const engineer = (s0: GameState): GameState => {
  let s = s0;
  const next =
    s.project?.unlock ??
    ORDER.find(
      (id) => !done(s, id) && checkAction(s, 'engineer', { kind: 'build', unlock: id }).ok,
    );
  if (next && me(s, 'engineer').at.kind === 'creature') {
    while (checkAction(s, 'engineer', { kind: 'build', unlock: next }).ok) {
      s = tryAct(s, 'engineer', { kind: 'build', unlock: next });
    }
    return s;
  }
  // Nothing to build: help gather, and come home once there is something to build.
  return gatherer(s, 'engineer');
};

const scholar = (s0: GameState): GameState => {
  let s = s0;
  const hasAlloy = (me(s, 'scholar').pack['ancient-alloy'] ?? 0) > 0;
  const tomb =
    done(s, 'lantern') &&
    !hasAlloy &&
    !done(s, 'climbing-spikes') &&
    (s.stores['ancient-alloy'] ?? 0) === 0
      ? nearest(s, 'scholar', (k) => {
          const f = s.features[k]!;
          const t = featureType(f.type);
          return f.revealed && t.kind === 'site' && t.tier === 2 && f.left > 0;
        })
      : null;
  if (tomb) {
    s = walkTowards(s, 'scholar', { kind: 'hex', hex: tomb });
    return tryAct(s, 'scholar', { kind: 'work-site' });
  }
  if (hasAlloy) return walkTowards(s, 'scholar', ON_CREATURE);
  return gatherer(s, 'scholar');
};

/** Whoever has strayed far from the creature heads back before nightfall. */
const stayClose = (s0: GameState): GameState => {
  let s = s0;
  for (const c of s.characters) {
    const h = hexOf(s, c.id);
    if (h && hexDistance(h, s.creature.centre) > 3) s = walkTowards(s, c.id, ON_CREATURE);
  }
  return s;
};

const playDay = (s: GameState): GameState => nextDay(stayClose(scholar(engineer(scout(s)))));

const playChain = (seed: number, maxDays: number) => {
  let s = createGame([seed, 0x5eed, 0xc4a1, 0x3], {
    characterIds: ['scout', 'engineer', 'scholar'],
    artSeed: 0,
  });
  s = { ...s, characters: s.characters.map((c) => ({ ...c, role: c.id })) };
  const milestones: Record<string, number> = {};
  const mark = (stage: string, day: number, reached: boolean) => {
    if (reached && !milestones[stage]) milestones[stage] = day;
  };
  for (let day = 1; day <= maxDays; day++) {
    s = playDay(s);
    mark(
      'reveal',
      day,
      Object.values(s.features).some((f) => f.revealed),
    );
    mark('deposit', day, Object.values(s.stores).some((n) => n > 0) || s.unlocks.length > 0);
    for (const id of ORDER) mark(id, day, done(s, id));
    const alloy =
      (s.stores['ancient-alloy'] ?? 0) > 0 ||
      s.characters.some((c) => (c.pack['ancient-alloy'] ?? 0) > 0) ||
      s.project?.unlock === 'climbing-spikes';
    mark('alloy', day, alloy || done(s, 'climbing-spikes'));
    if (done(s, 'climbing-spikes')) break;
  }
  return { state: s, milestones };
};

// Measured with this script (3 characters): the spikes come on days 25–46 on 9 of
// 12 maps (median about 37); the wait is mostly for timber and iron to come into
// view, then for a deep tomb once the lantern is done. Real parties are larger.
describe('the first chain, stage by stage (seed 1)', () => {
  const { state, milestones } = playChain(1, 60);
  const day = (stage: string) => milestones[stage] ?? Infinity;

  it('reveals features', () => {
    expect(day('reveal')).toBeLessThanOrEqual(5);
  });

  it('gathers and deposits materials in the stores', () => {
    expect(day('deposit')).toBeGreaterThanOrEqual(day('reveal'));
    expect(day('deposit')).toBeLessThan(60);
  });

  it('builds the grappling hook and the lantern', () => {
    expect(day('grappling-hook')).toBeGreaterThanOrEqual(day('deposit'));
    expect(day('lantern')).toBeLessThan(60);
  });

  it('works a deep tomb for ancient alloy once the lantern is done', () => {
    expect(day('alloy')).toBeGreaterThanOrEqual(day('lantern'));
    expect(day('alloy')).toBeLessThan(60);
  });

  it('builds the climbing spikes, with everyone still in the game', () => {
    expect(day('climbing-spikes')).toBeGreaterThanOrEqual(day('alloy'));
    expect(day('climbing-spikes')).toBeLessThanOrEqual(60);
    expect(state.characters.every((c) => c.status === 'active')).toBe(true);
  });
});

describe('the first chain on many maps', () => {
  it('is reachable on most maps', () => {
    const days: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      days.push(playChain(seed, 60).milestones['climbing-spikes'] ?? Infinity);
    }
    expect(days.filter((d) => d <= 60).length).toBeGreaterThanOrEqual(9);
  });
});
