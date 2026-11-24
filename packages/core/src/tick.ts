/**
 * The day tick: a pure function, the same whether a schedule or a
 * "next day" button calls it, and whether or not anyone has acted.
 *
 * Order: the creature steps (or lingers), carrying its riders, its step chosen
 * from the state before the tick (that day's fires, the current hunger); the
 * creature's care updates (cues for fires in range, hunger drains, a starving
 * creature eats from the stores, fires that have burnt out go, lingering ends);
 * the window and fog update;
 * anyone standing on a hex the creature stepped onto is now riding it (no cost);
 * anyone picked up empties their pack into the stores; anyone left out of
 * reach is lost, with their pack; actions reset; hexes new
 * in view get their (hidden) features; lost tiles far behind are
 * pruned. Server only: it needs the seed.
 *
 * Milestone 5 adds, after the care: threats move and strike (the creature,
 * with the day's defence, then characters); threats out of the window go; peril
 * changes; the season may end (peril first, then the route); if it goes on, a
 * settlement may appear, then a new threat; defenders clear. Struck characters
 * start the new day with `struckActions`. Once the season is over, the tick
 * changes nothing.
 */

import {
  appetiteOf,
  creatureType,
  MAX_SIGN_LEVEL,
  FOOD_TAG,
  firstWithTag,
  nourishment,
  reactionTo,
  stimulusType,
} from './care.ts';
import { chooseCreatureStep } from './creature.ts';
import { addFeatures, depositPack, type GameEvent, keyToHex, pruneFeatures } from './features.ts';
import { THREAT_TYPES } from './content/index.ts';
import { type Hex, hexDistance } from './hex.ts';
import { hashString, hashToUnit, pickWeighted } from './random.ts';
import { ON_CREATURE } from './places.ts';
import type {
  Care,
  Character,
  Creature,
  GameState,
  Materials,
  SeasonOutcome,
  Stimulus,
  Threat,
} from './state.ts';
import { keepSettlements, placeSettlement, settlementDue } from './settlements.ts';
import { withXp } from './skills.ts';
import { ambush, applyStances } from './stances.ts';
import { applySkillTicks, hungerEveryDays } from './skilltick.ts';
import { PERIL_CALM, PERIL_HUNGER, type PerilPart, perilThreat, recordEvents } from './stats.ts';
import {
  activeCount,
  approachHexes,
  canAppearOn,
  contactDistance,
  defence,
  PURSUER_TAG,
  struckBy,
  threatType,
  threatPath,
  threatStrength,
} from './threats.ts';
import { isCreatureHex, holdTiles, isReachable, pruneLostTiles, updateTiles } from './window.ts';

const EAT_STREAM = hashString('creature-eats');
const THREAT_STREAM = hashString('threat');

/** What a starving creature eats from the stores: food first, else a seeded pick. */
const starvingMeal = (state: GameState, stores: Materials): string | null => {
  const food = firstWithTag(stores, FOOD_TAG);
  if (food) return food;
  const held = Object.keys(stores)
    .filter((id) => (stores[id] ?? 0) > 0)
    .sort();
  if (held.length === 0) return null;
  return held[Math.floor(hashToUnit(state.seed, EAT_STREAM, state.day) * held.length)] ?? null;
};

/**
 * The creature's condition after a tick: cues for the stimuli in range, hunger
 * drained, and at underfed level 3 one unit eaten from the stores (food
 * nourishes as if fed). Reads the state before the tick.
 */
const careAfter = (
  state: GameState,
  day: number,
): { readonly care: Care; readonly stores: Materials; readonly ate: string | null } => {
  const { hunger } = creatureType(state.nature.type);
  const list = state.stimuli
    .filter(
      (s) => hexDistance(state.creature.centre, s.hex) <= (s.range ?? state.config.stimulusRange),
    )
    .map((s) => ({ hex: s.hex, stimulus: s.type, reaction: reactionTo(state.nature, s) }));
  // Contented: while a keeper with the skill is in the game, hunger drains less often.
  const every = Math.max(hunger.drainEveryDays, hungerEveryDays(state));
  const drains = day % every === 0;
  let satiety = Math.max(0, state.care.satiety - (drains ? hunger.drainPerDay : 0));
  let stores = state.stores;
  let ate: string | null = null;
  const drained = appetiteOf({ ...state, care: { ...state.care, satiety } });
  if (drained?.kind === 'underfed' && drained.level === MAX_SIGN_LEVEL) {
    const meal = starvingMeal(state, stores);
    if (meal) {
      const left = (stores[meal] ?? 0) - 1;
      const next: Record<string, number> = { ...stores };
      if (left > 0) next[meal] = left;
      else delete next[meal];
      stores = next;
      satiety = Math.min(hunger.max, satiety + nourishment(meal));
      ate = meal;
    }
  }
  return { care: { satiety, cues: { day, list } }, stores, ate };
};

/** Whether a stimulus still burns after the tick that ends `day - 1`. */
const burnsOn = (s: Stimulus, day: number): boolean =>
  s.litDay + stimulusType(s.type).lastsTicks > day;

/**
 * Threats move toward the creature's (new) centre and strike: at contact the
 * creature (less the defence; the threat is spent), else every character it
 * may strike within 1. Reads the state after the creature's step.
 */
const threatsAct = (
  state: GameState,
): {
  readonly threats: Threat[];
  readonly damage: number;
  /** Peril from each strike on the creature, by threat type, in order. */
  readonly hits: PerilPart[];
  readonly struck: Set<string>;
  readonly events: GameEvent[];
  /** XP earned by characters lying in wait for their strikes. */
  readonly xp: ReadonlyMap<string, number>;
} => {
  const { centre } = state.creature;
  const events: GameEvent[] = [];
  const paths = new Map<string, Hex[]>();
  const walked = state.threats.map((t) => {
    const path = threatPath(state, t, centre);
    paths.set(t.id, path);
    const to = path.at(-1);
    if (!to) return t;
    events.push({ kind: 'threat-moves', id: t.id, from: t.hex, to });
    return { ...t, hex: to };
  });
  // Anyone lying in wait strikes first, on the hexes the threats cross.
  const ambushed = ambush(state, walked, paths);
  events.push(...ambushed.events);
  const moved = ambushed.threats;
  const guard = defence(state);
  let damage = 0;
  const hits: PerilPart[] = [];
  const left: Threat[] = [];
  for (const t of moved) {
    if (hexDistance(t.hex, centre) <= contactDistance(state, threatType(t.type))) {
      const hit = Math.max(0, t.strength - guard);
      damage += hit;
      if (hit > 0) hits.push({ source: perilThreat(t.type), amount: hit });
      events.push({
        kind: 'threat-strikes',
        id: t.id,
        type: t.type,
        damage: hit,
        held: t.strength - hit,
      });
    } else left.push(t);
  }
  const struck = new Set<string>();
  for (const t of left) {
    for (const c of struckBy(state, t.hex, threatType(t.type).reach)) {
      struck.add(c.id);
      events.push({ kind: 'struck', characterId: c.id, threat: t.id });
    }
  }
  const threats: Threat[] = [];
  for (const t of left) {
    if (hexDistance(t.hex, centre) > state.config.windowRadius) {
      events.push({ kind: 'threat-gone', id: t.id });
    } else threats.push(t);
  }
  return { threats, damage, hits, struck, events, xp: ambushed.xp };
};

/** How the season ends at a tick with this peril and these steps, or null if it goes on. */
const seasonEnd = (state: GameState): SeasonOutcome | null => {
  const { perilMax, perilWoundedAt, routeLength } = state.config;
  if (state.peril >= perilMax) return 'lost';
  if (state.creature.steps >= routeLength) {
    return state.peril < perilWoundedAt ? 'safe' : 'wounded';
  }
  return null;
};

/**
 * The tick's new threat, if any: from `threatsFromDay`, while fewer than
 * `threatsMax` are on the map, a seeded roll (seed, day) against the day's
 * chance; then a weighted seeded pick among the types (no pursuers while a mislead
 * lasts) that have a fitting hex on their approach, at its first one. Reads the state of the new day.
 */
const newThreat = (state: GameState): Threat | null => {
  const { config, day } = state;
  if (day < config.threatsFromDay || state.threats.length >= config.threatsMax) return null;
  const chance = Math.min(
    config.threatChanceMax,
    config.threatChanceBase +
      config.threatChancePerPlayer * activeCount(state) +
      config.threatChancePerDay * day,
  );
  if (hashToUnit(state.seed, THREAT_STREAM, day) >= chance) return null;
  const misled = state.misleadUntilDay !== null && day <= state.misleadUntilDay;
  const side = hashToUnit(state.seed, THREAT_STREAM, day, 2) < 0.5 ? -1 : 1;
  const fitting = THREAT_TYPES.flatMap((t) => {
    if (t.weight <= 0 || (misled && t.tags.includes(PURSUER_TAG))) return [];
    const at = approachHexes(state, t, side).find((h) => canAppearOn(state, h, t));
    return at ? [{ type: t, at }] : [];
  });
  if (fitting.length === 0) return null;
  const { type, at: hex } = pickWeighted(
    fitting,
    (f) => f.type.weight,
    hashToUnit(state.seed, THREAT_STREAM, day, 1),
  );
  return {
    id: `t${day}`,
    type: type.id,
    hex,
    strength: threatStrength(state, type, day),
    appearedDay: day,
  };
};

/**
 * The day tick, with what happened, in order: the creature's step (from equals
 * to when it lingered), what a starving creature ate, each fire that went out,
 * pick-up deposits, losses, the day. Events are public: none carries the
 * creature's reactions, hunger or cues.
 */
export const nextDayWithEvents = (
  before: GameState,
): { readonly state: GameState; readonly events: readonly GameEvent[] } => {
  if (before.season.status === 'over') return { state: before, events: [] };
  // Unspent actions go to stances first (a watcher's reveals count for today's step and window).
  const staged = applyStances(before);
  const skilled = applySkillTicks(staged.state);
  const state = skilled.state;
  const day = state.day + 1;
  const step = chooseCreatureStep(state);
  const creature: Creature = {
    ...state.creature,
    centre: step.centre,
    lingering: false,
    lingeredDay: state.creature.lingering ? state.day : state.creature.lingeredDay,
    lingerStreak: state.creature.lingering
      ? state.creature.lingeredDay === state.day - 1
        ? (state.creature.lingerStreak ?? 1) + 1
        : 1
      : 0,
    steps: state.creature.steps + (step.stay ? 0 : 1),
  };
  const { care, stores, ate } = careAfter(state, day);
  const tiles = step.stay
    ? holdTiles(state.tiles)
    : updateTiles(state.tiles, creature.centre, day, state.config, state.seed);
  const newHexes = Object.keys(tiles)
    .filter((key) => !state.tiles[key])
    .map(keyToHex);
  const features = addFeatures(
    state.features,
    tiles,
    newHexes,
    state.seed,
    state.config.featureChance,
  );
  const stepped: GameState = {
    ...state,
    day,
    creature,
    tiles,
    features,
    care,
    stores,
    stimuli: state.stimuli.filter((s) => burnsOn(s, day)),
  };
  const events: GameEvent[] = [
    ...staged.events,
    ...skilled.events,
    { kind: 'creature-step', from: state.creature.centre, to: creature.centre },
  ];
  if (ate) events.push({ kind: 'creature-ate', material: ate });
  for (const s of state.stimuli) {
    if (!burnsOn(s, day)) events.push({ kind: 'fire-out', hex: s.hex, stimulus: s.type });
  }

  // Threats, peril and the season's end.
  const fight = threatsAct(stepped);
  events.push(...fight.events);
  const { config } = state;
  const appetite = appetiteOf(stepped);
  const hungry =
    appetite?.kind === 'underfed' && appetite.level >= config.perilHungryLevel
      ? config.perilHungry
      : 0;
  const rise = fight.damage + hungry;
  const peril =
    rise > 0
      ? Math.min(config.perilMax, state.peril + rise)
      : Math.max(0, state.peril - config.perilCalm);
  if (peril !== state.peril) {
    // Why it changed: each cause in order, the rise capped by the room left below the maximum.
    const parts =
      hungry > 0 ? [...fight.hits, { source: PERIL_HUNGER, amount: hungry }] : fight.hits;
    let room = config.perilMax - state.peril;
    const sources: PerilPart[] =
      rise > 0
        ? parts.flatMap((p) => {
            const amount = Math.min(p.amount, room);
            room -= amount;
            return amount > 0 ? [{ source: p.source, amount }] : [];
          })
        : [{ source: PERIL_CALM, amount: peril - state.peril }];
    events.push({ kind: 'peril', from: state.peril, to: peril, sources });
  }
  let moved: GameState = { ...stepped, threats: fight.threats, peril };
  const outcome = seasonEnd(moved);
  if (outcome) {
    moved = { ...moved, season: { status: 'over', outcome, day } };
  } else {
    if (!step.stay && settlementDue(moved, creature.steps)) {
      const settlement = placeSettlement(moved);
      if (settlement) {
        moved = { ...moved, settlements: [...moved.settlements, settlement] };
        events.push({ kind: 'settlement-appears', id: settlement.id, hex: settlement.hex });
      }
    }
    const threat = newThreat(moved);
    if (threat) {
      moved = { ...moved, threats: [...moved.threats, threat] };
      events.push({ kind: 'threat-appears', id: threat.id, type: threat.type, hex: threat.hex });
    }
  }
  moved = {
    ...moved,
    creature: { ...moved.creature, defenders: [], tows: [] },
    settlements: keepSettlements(moved),
    misleadUntilDay:
      moved.misleadUntilDay !== null && day >= moved.misleadUntilDay ? null : moved.misleadUntilDay,
  };

  const catchUp =
    !step.stay && creature.steps > 0 && creature.steps % config.catchUpEverySteps === 0;
  const lost: GameEvent[] = [];
  const characters = state.characters.map((c): Character => {
    if (c.status !== 'active') return { ...c, actionsLeft: 0, waiting: false };
    const struck = fight.struck.has(c.id);
    const actionsLeft = struck
      ? Math.min(config.actionsPerDay, config.struckActions)
      : config.actionsPerDay;
    // Catch-up: whenever the route's steps reach a multiple, everyone still in the game earns XP
    // (a stay does not add a step, so it cannot repeat it).
    const boosted = withXp(catchUp ? withXp(c, config.catchUpXp) : c, fight.xp.get(c.id) ?? 0);
    const fresh = {
      ...boosted,
      waiting: false,
      actionsLeft,
      struckDay: struck ? day : c.struckDay,
    };
    if (c.at.kind === 'creature') return fresh;
    if (isCreatureHex(moved, c.at.hex)) return { ...fresh, at: ON_CREATURE };
    if (isReachable(moved, c.at.hex)) return fresh;
    // Lost for good, and the pack with them.
    lost.push({ kind: 'lost', characterId: c.id, hex: c.at.hex });
    return { ...c, status: 'lost', actionsLeft: 0, waiting: false, pack: {} };
  });
  // Anyone now on the creature (picked up by it today) empties their pack into the stores.
  let settled: GameState = { ...moved, characters };
  for (const c of characters) {
    const deposited = depositPack(settled, c.id);
    settled = deposited.state;
    events.push(...deposited.events);
  }
  events.push(...lost);
  if (outcome) events.push({ kind: 'season-over', outcome });
  events.push({ kind: 'day', day });
  return {
    state: recordEvents(pruneFeatures({ ...settled, tiles: pruneLostTiles(settled) }), events),
    events,
  };
};

/** The day tick (see `nextDayWithEvents` for what happened). */
export const nextDay = (state: GameState): GameState => nextDayWithEvents(state).state;
