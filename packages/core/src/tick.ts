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
  reactionToLure,
} from './care.ts';
import { cartSpot } from './cart.ts';
import { chooseCreatureStep } from './creature.ts';
import {
  addFeatures,
  depositPack,
  type GameEvent,
  keyToHex,
  lightAround,
  pruneFeatures,
} from './features.ts';
import { nightsOf, rangeOf } from './fire.ts';
import { extendHazards, spawnClusters, stepPeril } from './hazards.ts';
import { keepLures, placeLures } from './lures.ts';
import { LURE_TYPES, THREAT_TYPES } from './content/index.ts';
import { type Hex, hexDistance } from './hex.ts';
import { hashString, hashToUnit, pickWeighted } from './random.ts';
import { ON_CREATURE } from './places.ts';
import type {
  Care,
  Cart,
  Character,
  Creature,
  Cue,
  GameState,
  Materials,
  SeasonOutcome,
  Stimulus,
  Threat,
} from './state.ts';
import { unpinned } from './state.ts';
import { keepSettlements, placeSettlement, settlementDue } from './settlements.ts';
import { withXp } from './skills.ts';
import { ambush, applyStances } from './stances.ts';
import { applySkillTicks, hungerEveryDays } from './skilltick.ts';
import {
  PERIL_CALM,
  PERIL_HUNGER,
  type PerilPart,
  perilTerrain,
  perilThreat,
  recordEvents,
} from './stats.ts';
import { fireStory } from './story.ts';
import { pruneTraces, recordTraces } from './traces.ts';
import {
  activeCount,
  approachHexes,
  canAppearOn,
  contactDistance,
  defence,
  keepsClearOf,
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
  const list: Cue[] = state.stimuli
    .filter((s) => hexDistance(state.creature.centre, s.hex) <= rangeOf(state, s))
    .map((s) => ({ hex: s.hex, stimulus: s.type, reaction: reactionTo(state.nature, s) }));
  // A lure in reach shows the same cue, under its own type.
  for (const l of state.lures) {
    const range = LURE_TYPES.find((x) => x.id === l.type)?.range ?? 0;
    if (hexDistance(state.creature.centre, l.hex) <= range) {
      list.push({ hex: l.hex, stimulus: l.type, reaction: reactionToLure(state.nature, l) });
    }
  }
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
const burnsOn = (s: Stimulus, day: number): boolean => s.litDay + nightsOf(s) > day;

/**
 * Threats move toward the creature's (new) centre and strike: at contact the
 * creature (less the defence; the threat is spent), else every character it
 * may strike within 1. Reads the state after the creature's step.
 */
const threatsAct = (
  state: GameState,
  /** The state before the tick: the fires that burned through the night, and the day they burned on. */
  burning: GameState,
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
    const path = threatPath(burning, t, centre);
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
    const type = threatType(t.type);
    // A threat that fears fire strikes from nowhere in a burning fire's ring.
    if (
      hexDistance(t.hex, centre) <= contactDistance(state, type) &&
      !keepsClearOf(burning, type, t.hex)
    ) {
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
    const type = threatType(t.type);
    if (keepsClearOf(burning, type, t.hex)) continue;
    const reached = struckBy(state, t.hex, type.reach).filter(
      (c) => c.at.kind !== 'hex' || !keepsClearOf(burning, type, c.at.hex),
    );
    for (const c of reached) {
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
  // A scree field's rockslides are laid with it and do not count against the cap.
  const rolled = state.threats.filter((t) => t.patch === undefined).length;
  if (day < config.threatsFromDay || rolled >= config.threatsMax) return null;
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
  // Hazard patches now due are laid ahead (beyond the window) before the window moves onto them.
  const hazardPlan = step.stay
    ? state.hazardPlan
    : extendHazards(
        state.seed,
        state.config,
        creature,
        state.tiles,
        state.brazierPlan,
        state.hazardPlan,
      );
  const tiles = step.stay
    ? holdTiles(state.tiles)
    : updateTiles(state.tiles, creature.centre, day, state.config, state.seed, hazardPlan);
  const newHexes = Object.keys(tiles)
    .filter((key) => !state.tiles[key])
    .map(keyToHex);
  const features = addFeatures(
    state.features,
    tiles,
    newHexes,
    state.seed,
    state.config.featureChance,
    state.brazierPlan,
  );
  // Lures the footprint reached run off; those left behind leave the map; new ones come due along the route.
  const kept = keepLures(state, creature);
  const stepped0: GameState = {
    ...state,
    day,
    creature,
    tiles,
    features,
    care,
    stores,
    hazardPlan,
    lures: kept.lures,
    stimuli: state.stimuli.filter((s) => burnsOn(s, day)),
  };
  const stepped: GameState = step.stay ? stepped0 : placeLures(stepped0).state;
  const events: GameEvent[] = [
    ...staged.events,
    ...skilled.events,
    { kind: 'creature-step', from: state.creature.centre, to: creature.centre },
    ...kept.events,
  ];
  // Hazardous ground under the creature's new centre adds peril (defence does not reduce it).
  const ground = step.stay ? null : stepPeril(tiles, creature.centre);
  if (ground) {
    events.push({
      kind: 'hazard-step',
      hex: creature.centre,
      terrain: ground.terrain,
      damage: ground.amount,
    });
  }
  // A brazier that still burns shows the hexes around it, including any that came into view tonight.
  let lit: GameState = stepped;
  // (Through its last night too: every fire in the state before the tick burns through it.)
  for (const s of state.stimuli) {
    if (s.reveal === undefined) continue;
    const shown = lightAround(lit, s.hex, s.reveal);
    lit = shown.state;
    events.push(...shown.events);
  }
  if (ate) events.push({ kind: 'creature-ate', material: ate });
  for (const s of state.stimuli) {
    if (!burnsOn(s, day)) events.push({ kind: 'fire-out', hex: s.hex, stimulus: s.type });
  }

  // Threats, peril and the season's end.
  const fight = threatsAct(lit, state);
  events.push(...fight.events);
  const { config } = state;
  const appetite = appetiteOf(stepped);
  const hungry =
    appetite?.kind === 'underfed' && appetite.level >= config.perilHungryLevel
      ? config.perilHungry
      : 0;
  const rise = fight.damage + (ground?.amount ?? 0) + hungry;
  const peril =
    rise > 0
      ? Math.min(config.perilMax, state.peril + rise)
      : Math.max(0, state.peril - config.perilCalm);
  if (peril !== state.peril) {
    // Why it changed: each cause in order, the rise capped by the room left below the maximum.
    const parts: PerilPart[] = [
      ...fight.hits,
      ...(ground ? [{ source: perilTerrain(ground.terrain), amount: ground.amount }] : []),
      ...(hungry > 0 ? [{ source: PERIL_HUNGER, amount: hungry }] : []),
    ];
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
  let moved: GameState = { ...lit, threats: fight.threats, peril };
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
    // A scree field that has come within reach lays its rockslides.
    const laid = spawnClusters(moved);
    moved = laid.state;
    events.push(...laid.events);
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
  const freed: GameEvent[] = [];
  const characters = state.characters.map((c): Character => {
    if (c.status !== 'active') return { ...c, actionsLeft: 0, waiting: false };
    const struck = fight.struck.has(c.id);
    // Pinned on the day just ended: still pinned the next day, with its actions to struggle with. Pinned
    // earlier: the backstop, free on their own now.
    const stillPinned = c.pinnedDay !== undefined && c.pinnedDay >= state.day;
    // Free on their own now (unless they are lost below, which clears it with no event).
    const free = (): void => {
      if (c.pinnedDay !== undefined && !stillPinned) {
        freed.push({ kind: 'dug-out', characterId: c.id, by: null });
      }
    };
    const actionsLeft = struck
      ? Math.min(config.actionsPerDay, config.struckActions)
      : config.actionsPerDay;
    // Catch-up: whenever the route's steps reach a multiple, everyone still in the game earns XP
    // (a stay does not add a step, so it cannot repeat it).
    const boosted = withXp(catchUp ? withXp(c, config.catchUpXp) : c, fight.xp.get(c.id) ?? 0);
    const fresh = {
      ...(stillPinned ? boosted : unpinned(boosted)),
      waiting: false,
      actionsLeft,
      struckDay: struck ? day : c.struckDay,
    };
    if (c.at.kind === 'creature') {
      free();
      return fresh;
    }
    // Picked up by the creature: hauled aboard, free.
    if (isCreatureHex(moved, c.at.hex)) {
      if (c.pinnedDay !== undefined) freed.push({ kind: 'dug-out', characterId: c.id, by: null });
      return {
        ...unpinned(fresh),
        at: ON_CREATURE,
        actionsLeft: struck ? actionsLeft : config.actionsPerDay,
      };
    }
    if (isReachable(moved, c.at.hex)) {
      free();
      return fresh;
    }
    // Lost for good, and the pack with them.
    lost.push({ kind: 'lost', characterId: c.id, hex: c.at.hex });
    return { ...unpinned(c), status: 'lost', actionsLeft: 0, waiting: false, pack: {} };
  });
  // Carts: one under the creature's footprint is pushed to the nearest free rollable hex (its puller and
  // rider were picked up, so they let go); one left out of reach is lost with its cargo. Nothing else moves it.
  const carts: Cart[] = [];
  const cartEvents: GameEvent[] = [];
  for (const cart of moved.carts) {
    const spot = isCreatureHex(moved, cart.hex)
      ? cartSpot(moved, cart.hex)
      : isReachable(moved, cart.hex)
        ? cart.hex
        : null;
    if (spot === null) {
      cartEvents.push({ kind: 'cart-lost', cart: cart.id, hex: cart.hex, cargo: cart.cargo });
      continue;
    }
    const still = (id: string | null): string | null => {
      const c = characters.find((x) => x.id === id);
      return c && c.status === 'active' && c.at.kind === 'hex' ? c.id : null;
    };
    const puller = still(cart.puller);
    const rider = still(cart.rider);
    if (cart.puller !== null && puller === null) {
      cartEvents.push({ kind: 'unhitched', cart: cart.id, characterId: cart.puller, hex: spot });
    }
    if (cart.rider !== null && rider === null) {
      cartEvents.push({ kind: 'left-cart', cart: cart.id, characterId: cart.rider, hex: spot });
    }
    carts.push({ ...cart, hex: spot, puller, rider });
  }
  // Anyone now on the creature (picked up by it today) empties their pack into the stores.
  let settled: GameState = { ...moved, characters, carts };
  for (const c of characters) {
    const deposited = depositPack(settled, c.id);
    settled = deposited.state;
    events.push(...deposited.events);
  }
  events.push(...freed, ...lost, ...cartEvents);
  if (outcome) events.push({ kind: 'season-over', outcome });
  // Traces of what happened, then the story from the new state; both change nothing else.
  const recorded = recordTraces(
    before,
    recordEvents(pruneFeatures({ ...settled, tiles: pruneLostTiles(settled) }), events),
    events,
  );
  const told = fireStory(pruneTraces(recorded));
  events.push(...told.events, { kind: 'day', day });
  return { state: told.state, events };
};

/** The day tick (see `nextDayWithEvents` for what happened). */
export const nextDay = (state: GameState): GameState => nextDayWithEvents(state).state;
