/**
 * How seasons end with simple scripted parties: for each seed, a new game is
 * played through the core with a party policy, and the outcome (safe, wounded,
 * lost) and the final peril are recorded.
 *
 * Policies (the sim reads the full state, as a keeper reads the creature's signs):
 * - `careful`: a warden strikes any threat it can reach this day (else rides and
 *   defends against one arriving tomorrow), then parleys with wary settlements and asks a
 *   boon (shelter when peril is 3 or more, mislead when pursuers are out, else the
 *   gift); anyone else strikes a threat arriving tomorrow when in reach; whoever rides feeds the creature when it is underfed; everyone else
 *   gathers forage within reach and brings it back.
 *   A careful player also spends every pick it earns, at once, on the first node it can take from
 *   its role's list in `SKILL_PREFERENCE` (the warden prefers bulwark; the rest their A1).
 * - `careless`: everyone rides; every third day one of them gathers forage within
 *   reach, and the creature is fed only when it is underfed at level 2 or more.
 *
 * Run: `node --experimental-transform-types packages/core/scripts/balance.ts [seeds]`.
 * `test/balance.test.ts` checks the script itself (it ends every season, deterministically).
 */

import {
  act,
  type Action,
  appetiteOf,
  type ConfigOverrides,
  createGame,
  featureType,
  hazardAt,
  type GameState,
  type Hex,
  hexDistance,
  keyToHex,
  moveAlong,
  neighbours,
  nextDayWithEvents,
  type GameEvent,
  ON_CREATURE,
  type Place,
  planPath,
  reachablePlaces,
  type SeasonOutcome,
  threatOutlook,
  threatType,
} from '../src/index.ts';
import { FOOD_TAG } from '../src/care.ts';

export type Policy = 'careful' | 'careless';

/** The staging and local season: mirrors `SERVER_CONFIG.devSeason` in apps/worker/src/server-config.ts. */
export const DEV_SEASON: ConfigOverrides = {
  routeLength: 12,
  settlementFirst: 3,
  settlementEvery: 6,
  threatsFromDay: 1,
  threatChanceBase: 0.6,
  xpPerPick: 5,
};

/** Roles of a party, by size: the first three are the core of any party; a sixth player is a second warden. */
const ROLE_ORDER = ['warden', 'keeper', 'scout', 'engineer', 'scholar'] as const;

export interface SeasonResult {
  readonly outcome: SeasonOutcome;
  readonly peril: number;
  readonly days: number;
  /** Strikes on the creature over the season. */
  readonly strikes: number;
  /** Picks earned per character over the season (XP / `xpPerPick`, spent or not). */
  readonly picks: number;
}

const character = (state: GameState, id: string) => state.characters.find((c) => c.id === id);

const actionsLeft = (state: GameState, id: string): number => {
  const c = character(state, id);
  return c?.status === 'active' ? c.actionsLeft : 0;
};

/** Does an action; returns the state unchanged when it is refused. */
const tryAct = (state: GameState, id: string, action: Action): GameState => {
  const result = act(state, id, action);
  return result.ok ? result.state : state;
};

/** Walks to a hex or onto the creature if the cheapest path fits within `budget`; unchanged otherwise. */
const walk = (state: GameState, id: string, to: Hex | Place, budget: number): GameState => {
  const plan = planPath(state, id, to);
  if (!plan.ok || plan.cost > budget) return state;
  const walked = moveAlong(state, id, plan.steps);
  return walked.ok ? walked.state : state;
};

/** The cheapest place among `targets` this character can reach within `budget`, with its cost. */
const nearest = (
  state: GameState,
  id: string,
  targets: readonly Hex[],
  budget: number,
): { readonly hex: Hex; readonly cost: number } | null => {
  let best: { hex: Hex; cost: number } | null = null;
  for (const h of targets) {
    const plan = planPath(state, id, h);
    if (plan.ok && plan.cost <= budget && (!best || plan.cost < best.cost)) {
      best = { hex: h, cost: plan.cost };
    }
  }
  return best;
};

const isRiding = (state: GameState, id: string): boolean =>
  character(state, id)?.at.kind === 'creature';

const hexOf = (state: GameState, id: string): Hex | null => {
  const at = character(state, id)?.at;
  return at?.kind === 'hex' ? at.hex : null;
};

/** Goes back onto the creature, or as close to it as this day's actions reach. */
const goHome = (state: GameState, id: string): GameState => {
  if (isRiding(state, id)) return state;
  const home = walk(state, id, ON_CREATURE, actionsLeft(state, id));
  if (home !== state) return home;
  const here = hexOf(state, id);
  if (!here) return state;
  const centre = state.creature.centre;
  let best: Hex = here;
  for (const r of reachablePlaces(state, id)) {
    if (r.place.kind === 'hex' && hexDistance(r.place.hex, centre) < hexDistance(best, centre)) {
      best = r.place.hex;
    }
  }
  return best === here ? state : walk(state, id, best, actionsLeft(state, id));
};

/** Strikes a threat until it is cleared or the actions run out, walking next to it first. */
const intercept = (state: GameState, id: string, threatId: string): GameState => {
  const threat = state.threats.find((t) => t.id === threatId);
  if (!threat) return state;
  // Strikes from beside it; never walks into a hazard (it ends the day before the blow).
  const spots = [threat.hex, ...neighbours(threat.hex)].filter((h) => !hazardAt(state, id, h));
  const here = hexOf(state, id);
  const target =
    here && hexDistance(here, threat.hex) <= 1
      ? { hex: here, cost: 0 }
      : nearest(state, id, spots, actionsLeft(state, id) - state.config.strikeCost);
  if (!target) return state;
  let s = target.cost > 0 ? walk(state, id, target.hex, target.cost) : state;
  while (s.threats.some((t) => t.id === threatId) && actionsLeft(s, id) > 0) {
    const next = tryAct(s, id, { kind: 'strike', threat: threatId });
    if (next === s) break;
    s = next;
  }
  return s;
};

/**
 * Threats by urgency: those arriving tomorrow first, then later, then never;
 * among those, moving ones before still ones, then the nearest.
 */
const byUrgency = (state: GameState) => {
  const rank = { tomorrow: 0, later: 1, never: 2 } as const;
  const info = (id: string) => {
    const t = state.threats.find((x) => x.id === id);
    return t
      ? { speed: threatType(t.type).speed, distance: hexDistance(t.hex, state.creature.centre) }
      : { speed: 0, distance: Infinity };
  };
  return threatOutlook(state)
    .map((o) => ({ ...o, ...info(o.id) }))
    .sort(
      (a, b) =>
        rank[a.arrives] - rank[b.arrives] ||
        Number(b.speed > 0) - Number(a.speed > 0) ||
        a.distance - b.distance,
    );
};

/** Feeds while the creature is underfed (at `level` or more) and there is food, riding. */
const feed = (state: GameState, id: string, level: number): GameState => {
  let s = state;
  for (;;) {
    const appetite = appetiteOf(s);
    if (!(appetite?.kind === 'underfed' && appetite.level >= level) || !isRiding(s, id)) return s;
    const next = tryAct(s, id, { kind: 'feed' });
    if (next === s) return s;
    s = next;
  }
};

/** Walks to the nearest forage node within reach, gathers, and comes back if it can. */
const forage = (state: GameState, id: string): GameState => {
  const budget = actionsLeft(state, id) - state.config.gatherCost;
  const nodes = Object.entries(state.features)
    .filter(([, f]) => {
      const t = featureType(f.type);
      return f.left > 0 && t.kind === 'node' && t.tags.includes(FOOD_TAG);
    })
    .map(([key]) => keyToHex(key));
  const target = nearest(state, id, nodes, budget);
  if (!target) return state;
  let s = walk(state, id, target.hex, target.cost);
  s = tryAct(s, id, { kind: 'gather' });
  return goHome(s, id);
};

/** The warden's diplomacy: parley with a wary settlement, or ask a friendly one for a boon. */
const parleyDay = (state: GameState, id: string): GameState => {
  for (const settlement of state.settlements) {
    if (settlement.attitude === 'angry' || settlement.boon !== null) continue;
    const target = nearest(state, id, [settlement.hex], actionsLeft(state, id) - 1);
    if (!target) continue;
    let s = walk(state, id, settlement.hex, target.cost);
    while (actionsLeft(s, id) > 0) {
      const here = s.settlements.find((x) => x.id === settlement.id);
      if (!here) break;
      let action: Action;
      if (here.attitude === 'wary') action = { kind: 'parley' };
      else if (here.attitude === 'friendly' && here.boon === null) {
        const pursued = s.threats.some((t) => threatType(t.type).tags.includes('pursuer'));
        const boon = s.peril >= 3 ? 'shelter' : pursued ? 'mislead' : 'gift';
        action = { kind: 'ask-boon', boon };
      } else break;
      const next = tryAct(s, id, action);
      if (next === s) break;
      s = next;
    }
    return s;
  }
  return state;
};

/** The nodes a careful player of each role takes first. */
const SKILL_PREFERENCE: Readonly<Record<string, readonly string[]>> = {
  warden: ['warden-a1'],
  keeper: ['keeper-a1'],
  scout: ['scout-a1'],
  engineer: ['engineer-a1'],
  scholar: ['scholar-a1'],
};

/** Spends every pick the character has earned in its own role. */
const pickSkills = (state: GameState, id: string): GameState => {
  let s = state;
  for (const node of SKILL_PREFERENCE[character(s, id)?.role ?? ''] ?? []) {
    s = tryAct(s, id, { kind: 'pick-skill', node });
  }
  return s;
};

const carefulDay = (state: GameState, ids: readonly string[]): GameState => {
  let s = state;
  for (const id of ids) {
    s = pickSkills(s, id);
    const role = character(s, id)?.role;
    if (actionsLeft(s, id) === 0) continue;
    // Anyone carrying something comes home first, to put it in the stores.
    if (Object.keys(character(s, id)?.pack ?? {}).length > 0) s = goHome(s, id);
    if (role === 'warden') {
      for (const t of byUrgency(s)) {
        if (actionsLeft(s, id) === 0) break;
        s = intercept(s, id, t.id);
      }
      if (byUrgency(s).some((t) => t.arrives === 'tomorrow')) {
        s = goHome(s, id);
        s = tryAct(s, id, { kind: 'defend' });
      }
    } else {
      // A hazard that waits (a rockslide ahead) is struck down while it is still ahead, not only on the day it is reached.
      for (const t of byUrgency(s)) {
        if (t.arrives === 'tomorrow' || (t.speed === 0 && t.arrives === 'later')) {
          s = intercept(s, id, t.id);
        }
      }
    }
    if (role === 'warden') s = parleyDay(s, id);
    s = feed(s, id, 1);
    if (role !== 'warden' && actionsLeft(s, id) >= 2) s = forage(s, id);
    // Never left behind: everyone ends the day as close to the creature as they can.
    s = goHome(s, id);
    s = feed(s, id, 1);
  }
  return s;
};

const carelessDay = (state: GameState, ids: readonly string[]): GameState => {
  let s = state;
  for (const id of ids) s = goHome(s, id);
  if (state.day % 3 === 0 && ids[0]) s = forage(s, ids[0]);
  for (const id of ids) s = feed(s, id, 2);
  return s;
};

/** Plays one season to its end. */
export const playSeason = (
  seed: number,
  policy: Policy,
  players: number,
  config: ConfigOverrides = {},
  /** Called with each day's state after the party has acted, and the tick's events. */
  onDay?: (planned: GameState, events: readonly GameEvent[]) => void,
): SeasonResult => {
  const ids = Array.from({ length: players }, (_, i) => `p${i}`);
  let state = createGame(seed, { characterIds: ids, config, artSeed: 0 });
  state = {
    ...state,
    characters: state.characters.map((c, i) => ({
      ...c,
      role: ROLE_ORDER[i % ROLE_ORDER.length] as string,
    })),
  };
  let strikes = 0;
  // A season ends by its route; the bound only guards against a creature that never steps.
  for (let guard = 0; guard < 400 && state.season.status === 'on'; guard++) {
    state = policy === 'careful' ? carefulDay(state, ids) : carelessDay(state, ids);
    const before = new Set(state.threats.map((t) => t.id));
    const { state: next, events } = nextDayWithEvents(state);
    onDay?.(state, events);
    // A threat gone without being out of the window or cleared struck the creature.
    for (const id of before) {
      const t = state.threats.find((x) => x.id === id);
      if (
        t &&
        !next.threats.some((x) => x.id === id) &&
        hexDistance(t.hex, next.creature.centre) <= next.config.windowRadius
      ) {
        strikes++;
      }
    }
    state = next;
  }
  if (state.season.status !== 'over') throw new Error(`season ${seed} did not end`);
  return {
    outcome: state.season.outcome,
    peril: state.peril,
    days: state.day,
    strikes,
    picks:
      state.characters.reduce((n, c) => n + Math.floor(c.skills.xp / state.config.xpPerPick), 0) /
      players,
  };
};

export interface Summary {
  readonly safe: number;
  readonly wounded: number;
  readonly lost: number;
  readonly peril: number;
  readonly strikes: number;
  readonly picks: number;
}

/** Outcome rates (0..1) and average final peril and strikes over seeds 1..n. */
export const summarise = (
  n: number,
  policy: Policy,
  players: number,
  config: ConfigOverrides = {},
): Summary => {
  const rows = Array.from({ length: n }, (_, i) => playSeason(i + 1, policy, players, config));
  const rate = (o: SeasonOutcome) => rows.filter((r) => r.outcome === o).length / n;
  const mean = (f: (r: SeasonResult) => number) => rows.reduce((a, r) => a + f(r), 0) / n;
  return {
    safe: rate('safe'),
    wounded: rate('wounded'),
    lost: rate('lost'),
    peril: mean((r) => r.peril),
    strikes: mean((r) => r.strikes),
    picks: mean((r) => r.picks),
  };
};

/** Prints a Markdown table for seeds 1..n (default 200). */
export const report = (
  n: number,
  log: (line: string) => void,
  extra: ConfigOverrides = {},
): void => {
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  log(`Seeds 1-${n}.`);
  log(
    '| season | policy | players | safe | wounded | lost | avg peril | avg strikes | picks each |',
  );
  log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [label, season] of [
    ['dev (12)', { ...DEV_SEASON, ...extra }],
    ['full (40)', extra],
  ] as const) {
    for (const policy of ['careful', 'careless'] as const) {
      for (const players of [3, 6]) {
        const s = summarise(n, policy, players, season);
        log(
          `| ${label} | ${policy} | ${players} | ${pct(s.safe)} | ${pct(s.wounded)} | ${pct(s.lost)} | ${s.peril.toFixed(1)} | ${s.strikes.toFixed(1)} | ${s.picks.toFixed(2)} |`,
        );
      }
    }
  }
};

// Run directly with Node (no Node types in this package, so `process` is read loosely).
const { process: proc, console: out } = globalThis as {
  process?: { argv: readonly string[] };
  console?: { log: (line: string) => void };
};
if (proc && out && (proc.argv[1] ?? '').endsWith('balance.ts')) {
  const extra = proc.argv[3] ? (JSON.parse(proc.argv[3]) as ConfigOverrides) : {};
  report(Number(proc.argv[2] ?? 200), (line) => out.log(line), extra);
}
