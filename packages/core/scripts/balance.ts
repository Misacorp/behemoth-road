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
 *   A careful player also spends every pick it earns, at once, on the next node it can take from
 *   its list in `SKILL_PREFERENCE` (its own branch of three tiers, then other roles' tier 1).
 *   Static hazards (a rockslide ahead): a non-warden who can fetch wood and reach a brazier on the side
 *   that bends the creature clear (the sim reads the creature's nature, as a keeper learns it by trying)
 *   lights it instead of striking the hazard down; with no such brazier in reach it is struck down as
 *   before, at the risk of the slide falling on the striker. Anyone near a pinned character digs them out.
 *   `BALANCE_STEER=off` turns steering off, so hazards are always struck down.
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
  nightsLeft,
  type GameEvent,
  ON_CREATURE,
  type Place,
  planPath,
  reachablePlaces,
  reactionTo,
  sideOf,
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
  /** Characters pinned by a falling slide over the season. */
  readonly pinned: number;
  /** Fires lit over the season. */
  readonly lit: number;
  /** Picks earned per character over the season (XP / `xpPerPick`, spent or not). */
  readonly picks: number;
}

const character = (state: GameState, id: string) => state.characters.find((c) => c.id === id);

const actionsLeft = (state: GameState, id: string): number => {
  const c = character(state, id);
  return c?.status === 'active' ? c.actionsLeft : 0;
};

/** Characters pinned by a falling slide in the season being played (counted as they are struck). */
let pinnedCount = 0;
/** Fires lit (braziers, steering) in the season being played. */
let litCount = 0;

/** Does an action; returns the state unchanged when it is refused. */
const tryAct = (state: GameState, id: string, action: Action): GameState => {
  const result = act(state, id, action);
  if (result.ok) {
    pinnedCount += result.events.filter((e) => e.kind === 'pinned').length;
    litCount += result.events.filter((e) => e.kind === 'fire-lit').length;
  }
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

/**
 * The nodes a careful player of each role takes, in order: down one branch of its own tree, then the
 * tier 1 of other roles. With `BALANCE_SKILLS=tier1` the party takes only its own tier 1 (how the
 * sim ran before tiers 2 and 3 were active), for before and after runs.
 */
const OWN_TREE: Readonly<Record<string, readonly string[]>> = {
  warden: ['warden-a1', 'warden-a2', 'warden-a3'],
  keeper: ['keeper-a1', 'keeper-a2', 'keeper-a3'],
  scout: ['scout-a1', 'scout-a2', 'scout-a3'],
  engineer: ['engineer-a1', 'engineer-a2', 'engineer-a3'],
  scholar: ['scholar-a1', 'scholar-a2', 'scholar-a3'],
};
const OTHERS = ['warden-a1', 'keeper-a1', 'engineer-a1', 'scholar-a1', 'scout-a1'];
const TIER1_ONLY =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[
    'BALANCE_SKILLS'
  ] === 'tier1';
const SKILL_PREFERENCE: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(OWN_TREE).map(([role, own]) => [
    role,
    TIER1_ONLY ? own.slice(0, 1) : [...own, ...OTHERS],
  ]),
);

/** Spends every pick the character has earned, in the order above. */
const pickSkills = (state: GameState, id: string): GameState => {
  let s = state;
  for (const node of SKILL_PREFERENCE[character(s, id)?.role ?? ''] ?? []) {
    s = tryAct(s, id, { kind: 'pick-skill', node });
  }
  return s;
};

/** Nights of fire still burning anywhere on the map. */
const burning = (state: GameState): boolean => state.stimuli.some((s) => nightsLeft(state, s) >= 1);

/** The static hazard ahead that steering could clear: a threat that waits where it is, not yet at the creature. */
const staticHazard = (state: GameState) =>
  state.threats.find(
    (t) =>
      threatType(t.type).speed === 0 &&
      // On the line ahead (a hazard well off it needs no steering).
      Math.abs(t.hex.q - state.creature.centre.q) <= 1 &&
      hexDistance(t.hex, state.creature.centre) <= state.config.stimulusRange + 2,
  );

/**
 * The unlit brazier whose fire bends the creature's step away from the hazard's side (or either way
 * when the hazard lies straight ahead), within reach of the creature's range, nearest first.
 */
const steeringBrazier = (state: GameState, hazard: Hex, id: string): Hex | null => {
  const reaction = reactionTo(state.nature, { type: 'fire', hex: hazard, litDay: state.day });
  const sign = reaction === 'attracted' ? 1 : reaction === 'repelled' ? -1 : 0;
  const slideSide = sideOf(state, hazard);
  const lit = new Set(state.stimuli.map((x) => `${x.hex.q},${x.hex.r}`));
  const options = Object.entries(state.features)
    .filter(([key, f]) => {
      const t = featureType(f.type);
      return f.revealed && t.tags.includes('fire-site') && !lit.has(key);
    })
    .map(([key]) => keyToHex(key))
    .filter((h) => {
      const push = sign * sideOf(state, h);
      // A creature drawn to a fire settles beside it, so for it the brazier must stand two or more off the line.
      const wide = reaction !== 'attracted' || Math.abs(h.q - state.creature.centre.q) >= 2;
      return (
        wide &&
        push !== 0 &&
        Math.sign(push) !== slideSide &&
        hexDistance(h, state.creature.centre) <= 5
      );
    });
  return nearestAny(state, id, options);
};

/** The cheapest of these hexes to walk to, however far (null when none can be reached). */
const nearestAny = (state: GameState, id: string, targets: readonly Hex[]): Hex | null => {
  let best: { hex: Hex; cost: number } | null = null;
  for (const h of targets) {
    const plan = planPath(state, id, h);
    if (plan.ok && (!best || plan.cost < best.cost)) best = { hex: h, cost: plan.cost };
  }
  return best?.hex ?? null;
};

/** Walks toward a hex as far as `budget` actions allow, staying out when it is not reached today. */
const approach = (state: GameState, id: string, to: Hex, budget: number): GameState => {
  const plan = planPath(state, id, to);
  if (!plan.ok) return state;
  const steps: (typeof plan.steps)[number][] = [];
  let spent = 0;
  for (const step of plan.steps) {
    if (spent + step.cost > budget) break;
    spent += step.cost;
    steps.push(step);
  }
  if (steps.length === 0) return state;
  const walked = moveAlong(state, id, steps);
  return walked.ok ? walked.state : state;
};

/** With `BALANCE_STEER=off` the party never steers: it strikes hazards down (for before and after runs). */
const NO_STEERING =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[
    'BALANCE_STEER'
  ] === 'off';

/** The character on a steering errand (out fetching wood or walking to a brazier), if any, today. */
let errand: string | null = null;

/**
 * Steers around a static hazard, possibly over days: fetches wood (staying out where it was gathered),
 * walks to the brazier that bends the creature clear and lights it. Sets `errand` while it is under way.
 */
const steer = (state: GameState, id: string): GameState => {
  if (NO_STEERING) return state;
  const hazard = staticHazard(state);
  if (!hazard || burning(state)) return state;
  const brazier = steeringBrazier(state, hazard.hex, id);
  if (!brazier) return state;
  let s = state;
  const holds = () => (character(s, id)?.pack['timber'] ?? 0) > 0;
  if (!holds()) {
    const nodes = Object.entries(s.features)
      .filter(([, f]) => {
        const t = featureType(f.type);
        return f.left > 0 && t.kind === 'node' && t.tags.includes('wood');
      })
      .map(([key]) => keyToHex(key))
      .filter((h) => hexDistance(h, s.creature.centre) < s.config.windowRadius);
    const node = nearestAny(s, id, nodes);
    if (!node) return s;
    // Only an errand that fits in two days is worth it: the walk, the gather, the walk on and the light.
    const there = planPath(s, id, node);
    const rest = hexDistance(node, brazier);
    if (
      !there.ok ||
      there.cost + s.config.gatherCost + rest + s.config.lightFireCost > 2 * s.config.actionsPerDay
    ) {
      return s;
    }
    errand = id;
    const reserve = s.config.gatherCost;
    s = approach(s, id, node, actionsLeft(s, id) - reserve);
    const here = hexOf(s, id);
    if (here && hexDistance(here, node) === 0) s = tryAct(s, id, { kind: 'gather' });
    if (!holds()) return s;
  }
  errand = id;
  s = approach(s, id, brazier, actionsLeft(s, id) - s.config.lightFireCost);
  const there = hexOf(s, id);
  if (there && hexDistance(there, brazier) === 0) {
    s = tryAct(s, id, { kind: 'light-fire' });
    if (burning(s)) errand = null;
  }
  return s;
};

/** Digs out a pinned character who is within reach this day. */
const rescue = (state: GameState, id: string): GameState => {
  const pinnedOne = state.characters.find((c) => c.id !== id && c.pinnedDay !== undefined);
  const where = pinnedOne && hexOf(state, pinnedOne.id);
  if (!pinnedOne || !where) return state;
  const here = hexOf(state, id);
  const target =
    here && hexDistance(here, where) <= 1
      ? { hex: here, cost: 0 }
      : nearest(
          state,
          id,
          [where, ...neighbours(where)],
          actionsLeft(state, id) - state.config.digOutCost,
        );
  if (!target) return state;
  const s = target.cost > 0 ? walk(state, id, target.hex, target.cost) : state;
  return tryAct(s, id, { kind: 'dig-out', target: pinnedOne.id });
};

const carefulDay = (state: GameState, ids: readonly string[]): GameState => {
  let s = state;
  // Steering is set up first (by the first non-warden with actions), so nobody strikes the hazard needlessly.
  errand = null;
  const steerer =
    ids.find(
      (id) => character(s, id)?.role !== 'warden' && actionsLeft(s, id) > 0 && !isRiding(s, id),
    ) ?? ids.find((id) => character(s, id)?.role !== 'warden' && actionsLeft(s, id) > 0);
  if (steerer) s = steer(s, steerer);
  const underway = (): boolean => burning(s) || errand !== null;
  for (const id of ids) {
    s = pickSkills(s, id);
    const role = character(s, id)?.role;
    if (actionsLeft(s, id) === 0) continue;
    s = rescue(s, id);
    // Anyone carrying something comes home first, to put it in the stores.
    if (id !== errand && Object.keys(character(s, id)?.pack ?? {}).length > 0) s = goHome(s, id);
    if (role === 'warden') {
      for (const t of byUrgency(s)) {
        if (actionsLeft(s, id) === 0) break;
        // A hazard being steered clear of is left alone, unless it will still arrive tomorrow.
        if (underway() && t.speed === 0 && t.arrives !== 'tomorrow') continue;
        s = intercept(s, id, t.id);
      }
      if (byUrgency(s).some((t) => t.arrives === 'tomorrow')) {
        s = goHome(s, id);
        s = tryAct(s, id, { kind: 'defend' });
      }
    } else {
      // A hazard that waits (a rockslide ahead) is steered clear of when a brazier allows, else struck
      // down while it is still ahead, not only on the day it is reached.
      for (const t of byUrgency(s)) {
        if (underway() && t.speed === 0 && t.arrives !== 'tomorrow') continue;
        if (t.arrives === 'tomorrow' || (t.speed === 0 && t.arrives === 'later')) {
          s = intercept(s, id, t.id);
        }
      }
    }
    if (role === 'warden') s = parleyDay(s, id);
    s = feed(s, id, 1);
    if (id === errand) continue;
    if (role !== 'warden' && actionsLeft(s, id) >= 2) s = forage(s, id);
    // Never left behind: everyone ends the day as close to the creature as they can (but for an errand).
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
  pinnedCount = 0;
  litCount = 0;
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
    pinned: pinnedCount,
    lit: litCount,
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
  readonly pinned: number;
  readonly lit: number;
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
    pinned: mean((r) => r.pinned),
    lit: mean((r) => r.lit),
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
    '| season | policy | players | safe | wounded | lost | avg peril | avg strikes | pinned | fires lit | picks each |',
  );
  log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [label, season] of [
    ['dev (12)', { ...DEV_SEASON, ...extra }],
    ['full (40)', extra],
  ] as const) {
    for (const policy of ['careful', 'careless'] as const) {
      for (const players of [3, 6]) {
        const s = summarise(n, policy, players, season);
        log(
          `| ${label} | ${policy} | ${players} | ${pct(s.safe)} | ${pct(s.wounded)} | ${pct(s.lost)} | ${s.peril.toFixed(1)} | ${s.strikes.toFixed(1)} | ${s.pinned.toFixed(2)} | ${s.lit.toFixed(2)} | ${s.picks.toFixed(2)} |`,
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
