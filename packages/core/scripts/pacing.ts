import {
  act,
  type Action,
  checkAction,
  type ConfigOverrides,
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
 * How fast a party completes the first chain (find materials, build the hook and
 * the lantern, work a deep tomb for alloy, build the climbing spikes). A scripted
 * party of three plays the chain: the scout explores (the script
 * knows where hidden features are, standing in for a curious player) and
 * surveys what it finds; everyone gathers what the unlocks still need and
 * carries it back to the creature's stores; the engineer, riding, builds the
 * hook, the lantern and then the spikes; the scholar works a deep tomb once the
 * lantern is done and brings the alloy home.
 */

/** A season that never ends and brings no threats or hazards: the chain is about roles, not peril. */
const CALM: ConfigOverrides = {
  routeLength: 100_000,
  threatsFromDay: 100_000,
  settlementFirst: 100_000,
  perilHungry: 0,
  hazardFirst: 100_000,
  lureFirstWithin: 100_000,
};

const ORDER = ['lantern', 'climbing-spikes', 'grappling-hook'] as const;

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

const scout = (s0: GameState, id = 'scout'): GameState => {
  let s = s0;
  const hidden = nearest(s, id, (k) => !s.features[k]!.revealed && !isCreatureHex(s, keyToHex(k)));
  if (!hidden) return gatherer(s, id);
  const here = hexOf(s, id);
  if (!here || !isAdjacent(here, hidden)) {
    // Walk next to it (not onto it: it might be a trap), then survey.
    const beside = reachablePlaces(s, id)
      .flatMap((r) => (r.place.kind === 'hex' && isAdjacent(r.place.hex, hidden) ? [r] : []))
      .sort((a, b) => a.cost - b.cost)[0];
    s = beside
      ? walkTowards(s, id, beside.place)
      : walkTowards(s, id, { kind: 'hex', hex: hidden });
  }
  s = tryAct(s, id, { kind: 'survey', hex: hidden });
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
  const seeking =
    done(s, 'lantern') &&
    !hasAlloy &&
    !done(s, 'climbing-spikes') &&
    (s.stores['ancient-alloy'] ?? 0) === 0 &&
    s.project?.unlock !== 'climbing-spikes';
  const tomb = seeking
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
  // No deep tomb known yet: a scholar looks for one too.
  if (seeking) return scout(s, 'scholar');
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

/** The chain is about roles, not hunger: the creature is kept fed (Milestone 4 feeds it for real). */
const keepFed = (s: GameState): GameState => ({ ...s, care: { ...s.care, satiety: 6 } });

const playDay = (s: GameState): GameState =>
  nextDay(keepFed(stayClose(scholar(engineer(scout(s))))));

export const playChain = (seed: number, maxDays: number) => {
  let s = createGame([seed, 0x5eed, 0xc4a1, 0x3], {
    characterIds: ['scout', 'engineer', 'scholar'],
    artSeed: 0,
    config: CALM,
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

/** Days to the climbing spikes (null: not within `maxDays`) for seeds 1..n. */
export const spikeDays = (n: number, maxDays: number): (number | null)[] =>
  Array.from(
    { length: n },
    (_, i) => playChain(i + 1, maxDays).milestones['climbing-spikes'] ?? null,
  );

/** Prints each stage's median day over seeds 1..n (default 12). */
export const report = (n: number, log: (line: string) => void): void => {
  const runs = Array.from({ length: n }, (_, i) => playChain(i + 1, 70).milestones);
  for (const stage of [
    'reveal',
    'deposit',
    'grappling-hook',
    'lantern',
    'alloy',
    'climbing-spikes',
  ]) {
    const days = runs
      .map((m) => m[stage])
      .filter((d): d is number => d !== undefined)
      .sort((a, b) => a - b);
    log(
      `${stage}: ${days.length}/${n} seeds, days ${days.join(' ')} (median ${days[Math.floor(days.length / 2)] ?? '-'})`,
    );
  }
};

// Run directly with Node (no Node types in this package, so `process` is read loosely).
const { process: proc, console: out } = globalThis as {
  process?: { argv: readonly string[] };
  console?: { log: (line: string) => void };
};
if (proc && out && (proc.argv[1] ?? '').endsWith('pacing.ts')) {
  report(Number(proc.argv[2] ?? 12), (line) => out.log(line));
}
