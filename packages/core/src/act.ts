/**
 * Actions beyond moving: survey an adjacent hex, gather at a node, work a site,
 * build an unlock, tend the creature, fight threats and deal with settlements.
 * Roles are read by their tags: `survey` (surveys for less), `sites` (better
 * chances, tier 2), `build` (works on unlocks), `tend` (lingers), `defend`
 * (strikes harder, defends the creature), `peoples` (parleys for more, without
 * risk). Every number is in the tuning config or content. Once the season is
 * over, every action is refused.
 */

import {
  BOONS,
  MATERIALS,
  PEOPLE_TYPES,
  STIMULUS_TYPES,
  UNLOCKS,
  type NodeType,
  type SiteType,
  type Unlock,
} from './content/index.ts';
import { creatureType, FOOD_TAG, firstWithTag, isKeeper, nourishment } from './care.ts';
import { activeCharacter, isPlaceReachable } from './actions.ts';
import {
  addMaterials,
  depositPack,
  exploreHex,
  featureType,
  type GameEvent,
  isExplored,
  keyToHex,
  packSize,
  roleHas,
  unlockTags,
} from './features.ts';
import { type Hex, hexDistance, hexesInRange, hexKey, isValidHex } from './hex.ts';
import { terrainOf } from './map.ts';
import { arePlacesAdjacent, ON_CREATURE, onHex, placeNeighbours } from './places.ts';
import { hashString, hashToUnit } from './random.ts';
import {
  type Character,
  type FeatureState,
  type GameState,
  type GameStateView,
  hasSeed,
  isSeasonOver,
  type Materials,
  type Settlement,
  type Stimulus,
} from './state.ts';
import { isCreatureHex, isInWindow } from './window.ts';
import { DEFEND_TAG, PURSUER_TAG, threatType } from './threats.ts';
import {
  addFavour,
  anger,
  PEOPLES_TAG,
  peopleType,
  settlementAt,
  TRADE_TAG,
} from './settlements.ts';

import { isStance } from './stances.ts';
import { PERIL_CALM, PERIL_SHELTER, recordEvents } from './stats.ts';
import { fireStory } from './story.ts';
import { recordTraces } from './traces.ts';
import {
  bestOf,
  distanceFrom,
  effectsOf,
  pickRefusal,
  type PickRefusal,
  earnXp,
  withSkill,
} from './skills.ts';

export type Action =
  | { readonly kind: 'survey'; readonly hex: Hex }
  | { readonly kind: 'gather' }
  | { readonly kind: 'work-site' }
  | { readonly kind: 'build'; readonly unlock: string }
  | { readonly kind: 'light-fire' }
  | { readonly kind: 'feed' }
  | { readonly kind: 'linger' }
  /** A rider throws the tow line to a character cut off within reach of the creature (needs the tow line). */
  | { readonly kind: 'throw-line'; readonly to: string }
  /** The target of a thrown line grabs it and is hauled onto the creature: their own action, never forced. */
  | { readonly kind: 'grab-line' }
  | { readonly kind: 'strike'; readonly threat: string }
  | { readonly kind: 'defend' }
  | { readonly kind: 'parley' }
  | { readonly kind: 'offer'; readonly material: string }
  | { readonly kind: 'ask-boon'; readonly boon: string }
  /** Takes a skill node with a pick the character has earned (`docs/design/skill-trees.md`). Free. */
  | { readonly kind: 'pick-skill'; readonly node: string }
  /** Sets the stance the unspent actions go to at the tick (`docs/design/stances.md`). Free, any time. */
  | { readonly kind: 'set-stance'; readonly stance: string }
  /** Ends the character's day: what is left goes to the stance at the tick. Free; no acting or moving after. */
  | { readonly kind: 'wait' };

export type ActRefusal =
  | 'invalid-action'
  | 'invalid-hex'
  | 'unknown-character'
  | 'character-lost'
  | 'not-adjacent'
  | 'unreachable'
  | 'already-explored'
  | 'not-on-hex'
  | 'nothing-here'
  | 'depleted'
  | 'pack-full'
  | 'not-enough-actions'
  | 'cannot-work'
  | 'needs-unlock'
  | 'needs-specialist'
  | 'not-riding'
  | 'unknown-unlock'
  | 'already-have'
  | 'busy'
  | 'missing-materials'
  | 'cannot-burn'
  | 'fire-here'
  | 'no-fuel'
  | 'no-food'
  | 'needs-keeper'
  | 'lingered-yesterday'
  /** The tow line: the target is out of reach, or no line was thrown to this character. */
  | 'no-line'
  | 'on-creature'
  | 'season-over'
  | 'no-threat'
  | 'not-near'
  /** A tow line to someone inside the window: they can walk. */
  | 'in-window'
  | 'needs-warden'
  | 'no-settlement'
  | 'not-wary'
  | 'not-friendly'
  | 'boon-taken'
  | 'unknown-boon'
  | 'no-trade-good'
  | 'unknown-stance'
  /** The character ended their day (wait): only the stance and picks can change. */
  | 'waiting'
  /** Picks: see `PickRefusal` in `skills.ts` (`already-have` is shared). */
  | PickRefusal;

type Uses = readonly { readonly material: string; readonly amount: number }[];

/**
 * What an action would cost, or why it cannot be done now. A refusal still says
 * what the action costs this character (`cost`) wherever that is known, and for
 * an unlock the materials the stores lack (`missing`), so the interface needs no
 * rules or config of its own.
 */
export type ActCheck =
  | {
      readonly ok: true;
      /** Actions it costs. */
      readonly cost: number;
      /** Materials taken from the stores (starting an unlock, feeding) or the pack (fuel). */
      readonly uses: Uses;
      /** The published chance of success (working a site, a parley); 1 for everything else. */
      readonly chance: number;
    }
  | {
      readonly ok: false;
      readonly reason: ActRefusal;
      readonly cost?: number;
      readonly missing?: Uses;
    };

export type ActResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly reason: ActRefusal };

/** The tag of the unlock that lets riders throw a line. */
export const TOW_TAG = 'towline';

const SITE_STREAM = hashString('site');
const PARLEY_STREAM = hashString('parley');

/** The stimulus a fire is (the one tagged `fire`): content, read by tag. */
const FIRE = STIMULUS_TYPES.find((t) => t.tags.includes('fire'));

/** A fire as lit by a character: a beacon skill widens its reach and strengthens its push. */
const litFire = (c: Character, type: string, hex: Hex, litDay: number): Stimulus => {
  const range = bestOf(c, 'fire-boost', (e) => e.range);
  const push = bestOf(c, 'fire-boost', (e) => e.push);
  return {
    type,
    hex,
    litDay,
    ...(range === null ? {} : { range }),
    ...(push === null ? {} : { push }),
  };
};

const hexOf = (c: Character): Hex | null => (c.at.kind === 'hex' ? c.at.hex : null);

const baseSiteChance = (state: GameStateView, c: Character, site: SiteType): number => {
  const { config } = state;
  const specialist = roleHas(c, 'sites');
  if (site.tier === 1) {
    return specialist ? config.siteChanceSpecialistTier1 : config.siteChanceOtherTier1;
  }
  return specialist ? config.siteChanceSpecialistTier2 : config.siteChanceOtherTier2;
};

/** The chance to work a site: skills add to it only where the character could work it at all. */
const siteChance = (state: GameStateView, c: Character, site: SiteType): number => {
  const base = baseSiteChance(state, c, site);
  if (base <= 0) return base;
  const bonus = effectsOf(c, 'site-chance')
    .filter((e) => e.tag === undefined || site.tags.includes(e.tag))
    .reduce((sum, e) => sum + e.bonus, 0);
  return Math.min(1, base + bonus);
};

/** An action's cost: its base, or lower where a skill sets it. */
const skillCost = (c: Character, action: 'work-site' | 'linger', base: number): number =>
  Math.min(
    base,
    ...effectsOf(c, 'action-cost')
      .filter((e) => e.action === action)
      .map((e) => e.cost),
  );

/** The revealed feature where the character stands, if any. */
const featureHere = (state: GameStateView, c: Character): FeatureState | null => {
  const h = hexOf(c);
  if (!h) return null;
  const f = state.features[hexKey(h)];
  return f?.revealed ? f : null;
};

/** The settlement on the hex the character stands on, if any. */
const settlementHere = (state: GameStateView, c: Character): Settlement | undefined => {
  const h = hexOf(c);
  return h ? settlementAt(state, h) : undefined;
};

/**
 * The settlement a parley reaches: the one on the character's hex, or with a ravens-style skill the
 * nearest within its range (ties by id). Offers and boons still need the character's own hex.
 */
const parleyTarget = (state: GameStateView, c: Character): Settlement | undefined => {
  const here = settlementHere(state, c);
  if (here) return here;
  const range = bestOf(c, 'parley-range', (e) => e.range) ?? 0;
  if (range <= 0) return undefined;
  return state.settlements
    .map((s) => ({ s, d: distanceFrom(state, c, s.hex) }))
    .filter((x) => x.d <= range)
    .sort((a, b) => a.d - b.d || (a.s.id < b.s.id ? -1 : 1))[0]?.s;
};

/** A parley's chance of gaining favour rather than angering the settlement. */
const parleyChance = (state: GameStateView, c: Character): number =>
  roleHas(c, PEOPLES_TAG) ? 1 : 1 - state.config.parleyAngerChanceOther;

/** Units a character's pack holds: the base, or more where a skill says so. */
export const packCapacityOf = (state: GameStateView, c: Character): number =>
  Math.max(state.config.packCapacity, bestOf(c, 'pack-size', (e) => e.capacity) ?? 0);

const free = (state: GameStateView, c: Character): number =>
  packCapacityOf(state, c) - packSize(c.pack);

/** How far a survey reaches: 1 (the next hexes), or more where a skill says so. */
const surveyReach = (c: Character): number =>
  Math.max(1, bestOf(c, 'survey-range', (e) => e.range) ?? 0);

/** How far a strike reaches: 1, or more where a skill says so. */
const strikeReach = (c: Character): number =>
  Math.max(1, bestOf(c, 'strike-range', (e) => e.range) ?? 0);

/** Whether a hex lies within a survey's reach of the character (the next hexes, or further with a skill). */
const withinSurvey = (state: GameStateView, c: Character, target: Hex): boolean => {
  const reach = surveyReach(c);
  if (reach <= 1) return arePlacesAdjacent(state, c.at, onHex(target));
  const d = distanceFrom(state, c, target);
  return d >= 1 && d <= reach && state.tiles[hexKey(target)] !== undefined;
};

/** The unlock's cost for this character: a thrift skill takes `amount` off its largest material. */
const unlockCost = (c: Character, unlock: Unlock): Unlock['cost'] => {
  const off = bestOf(c, 'build-discount', (e) => e.amount) ?? 0;
  if (off <= 0 || unlock.cost.length === 0) return unlock.cost;
  const largest = unlock.cost.reduce((a, b) => (b.amount > a.amount ? b : a));
  return unlock.cost.map((u) =>
    u === largest ? { ...u, amount: Math.max(1, u.amount - off) } : u,
  );
};

/**
 * Units a gather yields: the node's own, or more where a skill says so, but never more than the
 * pack has room for (the node's own amount is checked first, so the action is refused when even that
 * does not fit).
 */
const gatherYield = (state: GameStateView, c: Character, type: NodeType): number => {
  const tags = MATERIALS.find((m) => m.id === type.yields.material)?.tags ?? [];
  const boosted = bestOf(c, 'gather-yield', (e) =>
    e.tag === undefined || tags.includes(e.tag) ? e.amount : 0,
  );
  return Math.min(
    Math.max(type.yields.amount, boosted ?? 0),
    Math.max(type.yields.amount, free(state, c)),
  );
};

const done = (cost: number, uses: Uses = []): ActCheck => ({
  ok: true,
  cost,
  uses,
  chance: 1,
});

/**
 * Whether a character can do an action now, and what it costs. Works on a player
 * view, so the interface can show what is possible; `act` applies it on the server.
 */
export const checkAction = (
  state: GameStateView,
  characterId: string,
  action: Action,
): ActCheck => {
  if (isSeasonOver(state)) return { ok: false, reason: 'season-over' };
  const found = activeCharacter(state, characterId);
  if (!found.ok) return found;
  const c = found.character;
  const { config } = state;
  if (c.waiting && action?.kind !== 'set-stance' && action?.kind !== 'pick-skill') {
    return { ok: false, reason: 'waiting' };
  }

  switch (action?.kind) {
    case 'set-stance':
      return isStance(action.stance) ? done(0) : { ok: false, reason: 'unknown-stance', cost: 0 };
    case 'wait':
      return c.actionsLeft > 0 ? done(0) : { ok: false, reason: 'not-enough-actions', cost: 0 };
    case 'survey': {
      const cost = roleHas(c, 'survey') ? config.surveyCostSpecialist : config.surveyCostOther;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      const target = action.hex;
      if (!isValidHex(target)) return no('invalid-hex');
      if (isCreatureHex(state, target)) return no('not-adjacent');
      if (!withinSurvey(state, c, target)) return no('not-adjacent');
      if (!isPlaceReachable(state, onHex(target))) return no('unreachable');
      if (isExplored(state, target)) return no('already-explored');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'gather': {
      const cost = config.gatherCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (!hexOf(c)) return no('not-on-hex');
      const f = featureHere(state, c);
      const type = f ? featureType(f.type) : null;
      if (!f || type?.kind !== 'node') return no('nothing-here');
      if (f.left <= 0) return no('depleted');
      if (free(state, c) < type.yields.amount) return no('pack-full');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'work-site': {
      const cost = skillCost(c, 'work-site', config.workSiteCost);
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (!hexOf(c)) return no('not-on-hex');
      const f = featureHere(state, c);
      const type = f ? featureType(f.type) : null;
      if (!f || type?.kind !== 'site') return no('nothing-here');
      if (f.left <= 0) return no('depleted');
      // Whether this character could ever work it comes before what the team lacks.
      const chance = siteChance(state, c, type);
      if (chance <= 0) return no('cannot-work');
      const tags = unlockTags(state);
      if (!type.needs.every((tag) => tags.has(tag))) return no('needs-unlock');
      if (free(state, c) < type.finds.amount) return no('pack-full');
      if (c.actionsLeft < cost) return no('not-enough-actions');
      return { ok: true, cost, uses: [], chance };
    }
    case 'build': {
      const unlock = UNLOCKS.find((u) => u.id === action.unlock);
      if (!unlock) return { ok: false, reason: 'unknown-unlock' };
      const cost = config.buildCost;
      // Materials are taken only when the work starts.
      const project = state.project;
      const uses = project?.unlock === unlock.id ? [] : unlockCost(c, unlock);
      const missing = uses.flatMap((u) => {
        const short = u.amount - (state.stores[u.material] ?? 0);
        return short > 0 ? [{ material: u.material, amount: short }] : [];
      });
      const no = (reason: ActRefusal): ActCheck =>
        missing.length > 0 ? { ok: false, reason, cost, missing } : { ok: false, reason, cost };
      if (!roleHas(c, 'build')) return no('needs-specialist');
      if (c.at.kind !== 'creature') return no('not-riding');
      if (state.unlocks.includes(unlock.id)) return { ok: false, reason: 'already-have', cost };
      if (project && project.unlock !== unlock.id) return no('busy');
      if (missing.length > 0) return no('missing-materials');
      return c.actionsLeft >= cost ? done(cost, uses) : no('not-enough-actions');
    }
    case 'light-fire': {
      if (!FIRE) return { ok: false, reason: 'invalid-action' };
      const cost = config.lightFireCost;
      const no = (reason: ActRefusal, missing?: Uses): ActCheck =>
        missing ? { ok: false, reason, cost, missing } : { ok: false, reason, cost };
      const h = hexOf(c);
      if (!h || isCreatureHex(state, h)) return no('on-creature');
      const terrain = terrainOf(state, h);
      if (!terrain || FIRE.notOn.some((tag) => terrain.tags.includes(tag))) {
        return no('cannot-burn');
      }
      if (state.stimuli.some((s) => hexKey(s.hex) === hexKey(h))) return no('fire-here');
      const fuel = firstWithTag(c.pack, FIRE.fuel.tag, FIRE.fuel.amount);
      if (!fuel) {
        const kind = MATERIALS.find((m) => m.tags.includes(FIRE.fuel.tag));
        return no('no-fuel', kind ? [{ material: kind.id, amount: FIRE.fuel.amount }] : undefined);
      }
      return c.actionsLeft >= cost
        ? done(cost, [{ material: fuel, amount: FIRE.fuel.amount }])
        : no('not-enough-actions');
    }
    case 'feed': {
      const cost = config.feedCost;
      const no = (reason: ActRefusal, missing?: Uses): ActCheck =>
        missing ? { ok: false, reason, cost, missing } : { ok: false, reason, cost };
      if (c.at.kind !== 'creature') return no('not-riding');
      const food = firstWithTag(state.stores, FOOD_TAG);
      if (!food) {
        const kind = MATERIALS.find((m) => m.tags.includes(FOOD_TAG));
        return no('no-food', kind ? [{ material: kind.id, amount: 1 }] : undefined);
      }
      return c.actionsLeft >= cost
        ? done(cost, [{ material: food, amount: 1 }])
        : no('not-enough-actions');
    }
    case 'linger': {
      const cost = skillCost(c, 'linger', config.lingerCost);
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (!isKeeper(state, c.id)) return no('needs-keeper');
      if (c.at.kind !== 'creature') return no('not-riding');
      // Already asked today: a second linger would change nothing.
      if (state.creature.lingering) return no('already-have');
      if (
        state.creature.lingeredDay === state.day - 1 &&
        !(
          effectsOf(c, 'linger-chain').length > 0 &&
          (state.creature.lingerStreak ?? 1) < config.lingerChainMax
        )
      ) {
        return no('lingered-yesterday');
      }
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'throw-line': {
      const cost = config.towThrowCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (!unlockTags(state).has(TOW_TAG)) return no('needs-unlock');
      if (c.at.kind !== 'creature') return no('not-riding');
      if (typeof action.to !== 'string' || action.to === c.id) return no('invalid-action');
      const target = state.characters.find((x) => x.id === action.to);
      if (!target) return no('unknown-character');
      if (target.status !== 'active') return no('character-lost');
      if (target.at.kind !== 'hex') return no('on-creature');
      if (state.creature.tows.some((t) => t.from === c.id)) return no('already-have');
      if (state.creature.tows.some((t) => t.to === target.id)) return no('already-have');
      if (
        hexDistance(target.at.hex, state.creature.centre) >
        config.windowRadius + config.towReach
      ) {
        return no('not-near');
      }
      if (isCreatureHex(state, target.at.hex)) return no('on-creature');
      // Someone inside the window can walk to the creature: the line is for those cut off outside it.
      if (isInWindow(state, target.at.hex)) return no('in-window');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'grab-line': {
      const cost = config.towGrabCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (c.at.kind !== 'hex') return no('on-creature');
      if (!state.creature.tows.some((t) => t.to === c.id)) return no('no-line');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'strike': {
      const cost = config.strikeCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      const threat = state.threats.find((t) => t.id === action.threat);
      if (!threat) return no('no-threat');
      const h = hexOf(c);
      if (!h || hexDistance(h, threat.hex) > strikeReach(c)) return no('not-near');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'defend': {
      const cost = config.defendCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (!roleHas(c, DEFEND_TAG)) return no('needs-warden');
      if (c.at.kind !== 'creature') return no('not-riding');
      if (state.creature.defenders.includes(c.id)) return no('already-have');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'parley': {
      const cost = config.parleyCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      const here = parleyTarget(state, c);
      if (!here) return no('no-settlement');
      if (here.attitude !== 'wary') return no('not-wary');
      if (c.actionsLeft < cost) return no('not-enough-actions');
      return { ok: true, cost, uses: [], chance: parleyChance(state, c) };
    }
    case 'pick-skill': {
      const reason = pickRefusal(state, c, action.node);
      return reason ? { ok: false, reason, cost: 0 } : done(0);
    }
    case 'offer': {
      const cost = config.offerCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      const here = settlementHere(state, c);
      if (!here) return no('no-settlement');
      if (here.attitude !== 'wary') return no('not-wary');
      const good = MATERIALS.find((m) => m.id === action.material && m.tags.includes(TRADE_TAG));
      if (!good || (c.pack[good.id] ?? 0) < 1) return no('no-trade-good');
      return c.actionsLeft >= cost
        ? done(cost, [{ material: good.id, amount: 1 }])
        : no('not-enough-actions');
    }
    case 'ask-boon': {
      const cost = config.askBoonCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      const here = settlementHere(state, c);
      if (!here) return no('no-settlement');
      const boons: readonly string[] = peopleType(here.type).boons;
      if (!boons.includes(action.boon)) return no('unknown-boon');
      if (here.attitude !== 'friendly') return no('not-friendly');
      if (here.boon !== null) return no('boon-taken');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    default:
      return { ok: false, reason: 'invalid-action' };
  }
};

const subtract = (from: Materials, uses: Uses): Materials => {
  const out: Record<string, number> = { ...from };
  for (const u of uses) {
    const left = (out[u.material] ?? 0) - u.amount;
    if (left > 0) out[u.material] = left;
    else delete out[u.material];
  }
  return out;
};

/**
 * Does an action for a character (server only: working a site rolls from the
 * seed, the day, the character and the site, so the outcome is fair and
 * repeatable but unknown in advance; a retry by the same character on the same
 * day rolls the same).
 */
const actCore = (state: GameState, characterId: string, action: Action): ActResult => {
  if (!hasSeed(state)) throw new TypeError('Acting needs the seed: server only');
  const check = checkAction(state, characterId, action);
  if (!check.ok) return check;
  const c = state.characters.find((x) => x.id === characterId) as Character;
  const withCharacter = (s: GameState, change: Partial<Character>): GameState => ({
    ...s,
    characters: s.characters.map((x) =>
      x.id === characterId ? { ...x, actionsLeft: x.actionsLeft - check.cost, ...change } : x,
    ),
  });

  if (action.kind === 'set-stance') {
    return {
      ok: true,
      state: {
        ...state,
        characters: state.characters.map((x) =>
          x.id === characterId ? { ...x, stance: action.stance } : x,
        ),
      },
      events: [{ kind: 'stance', characterId, stance: action.stance }],
    };
  }

  if (action.kind === 'wait') {
    return {
      ok: true,
      state: withCharacter(state, { waiting: true }),
      events: [{ kind: 'wait', characterId }],
    };
  }

  if (action.kind === 'pick-skill') {
    return {
      ok: true,
      state: {
        ...state,
        characters: state.characters.map((x) =>
          x.id === characterId ? withSkill(x, action.node) : x,
        ),
      },
      events: [{ kind: 'skill-picked', characterId, node: action.node }],
    };
  }

  if (action.kind === 'survey') {
    // Surveying explores from outside: a trap there is revealed and harmless.
    // A hex with nothing in it says so, for the "nothing here" moment (public: it is explored now).
    const explored = exploreHex(state, action.hex);
    const empty = !explored.state.features[hexKey(action.hex)];
    return {
      ok: true,
      state: withCharacter(explored.state, {}),
      events: [
        { kind: 'survey', hex: action.hex, characterId },
        ...explored.events,
        ...(empty ? [{ kind: 'survey-empty' as const, hex: action.hex, characterId }] : []),
      ],
    };
  }

  if (action.kind === 'light-fire' && FIRE) {
    const h = hexOf(c) as Hex;
    const lit: GameState = {
      ...state,
      stimuli: [...state.stimuli, litFire(c, FIRE.id, h, state.day)],
    };
    return {
      ok: true,
      state: withCharacter(lit, { pack: subtract(c.pack, check.uses) }),
      events: [{ kind: 'fire-lit', hex: h, characterId, stimulus: FIRE.id }],
    };
  }

  if (action.kind === 'feed') {
    const use = check.uses[0] as { material: string; amount: number };
    const { max } = creatureType(state.nature.type).hunger;
    const satiety = Math.min(max, state.care.satiety + nourishment(use.material) * use.amount);
    // Soothing herbs: the first feeding of a day also eases peril.
    const calm = bestOf(c, 'feed-calm', (e) => e.amount) ?? 0;
    const eased = state.care.soothedDay === state.day ? 0 : Math.min(calm, state.peril);
    const fed: GameState = {
      ...state,
      stores: subtract(state.stores, check.uses),
      care: { ...state.care, satiety, ...(calm > 0 ? { soothedDay: state.day } : {}) },
      peril: state.peril - eased,
    };
    const events: GameEvent[] = [{ kind: 'fed', characterId, material: use.material }];
    if (eased > 0) {
      events.push({
        kind: 'peril',
        from: state.peril,
        to: fed.peril,
        sources: [{ source: PERIL_CALM, amount: -eased }],
      });
    }
    return { ok: true, state: withCharacter(fed, {}), events };
  }

  if (action.kind === 'linger') {
    const lingering: GameState = { ...state, creature: { ...state.creature, lingering: true } };
    return {
      ok: true,
      state: withCharacter(lingering, {}),
      events: [{ kind: 'linger', characterId }],
    };
  }

  if (action.kind === 'throw-line') {
    const creature = {
      ...state.creature,
      tows: [...state.creature.tows, { from: characterId, to: action.to }],
    };
    return {
      ok: true,
      state: withCharacter({ ...state, creature }, {}),
      events: [{ kind: 'tow-thrown', characterId, target: action.to }],
    };
  }

  if (action.kind === 'grab-line') {
    const line = state.creature.tows.find((t) => t.to === characterId) as { from: string };
    const creature = {
      ...state.creature,
      tows: state.creature.tows.filter((t) => t.to !== characterId),
    };
    const hauled = withCharacter({ ...state, creature }, { at: ON_CREATURE });
    const deposited = depositPack(hauled, characterId);
    return {
      ok: true,
      state: deposited.state,
      events: [{ kind: 'tow-grabbed', characterId, thrower: line.from }, ...deposited.events],
    };
  }

  if (action.kind === 'strike') {
    const threat = state.threats.find((t) => t.id === action.threat);
    if (!threat) return { ok: false, reason: 'no-threat' };
    const power = roleHas(c, DEFEND_TAG)
      ? state.config.clearPowerWarden
      : state.config.clearPowerOther;
    const tags = threatType(threat.type).tags;
    const bonus = effectsOf(c, 'strike-bonus')
      .filter((e) => tags.includes(e.tag))
      .reduce((sum, e) => sum + e.bonus, 0);
    const strength = Math.max(0, threat.strength - power - bonus);
    const events: GameEvent[] = [{ kind: 'threat-hit', id: threat.id, characterId, strength }];
    const threats =
      strength > 0
        ? state.threats.map((t) => (t.id === threat.id ? { ...t, strength } : t))
        : state.threats.filter((t) => t.id !== threat.id);
    if (strength <= 0) events.push({ kind: 'threat-cleared', id: threat.id, characterId });
    return { ok: true, state: withCharacter({ ...state, threats }, {}), events };
  }

  if (action.kind === 'defend') {
    const creature = { ...state.creature, defenders: [...state.creature.defenders, characterId] };
    return {
      ok: true,
      state: withCharacter({ ...state, creature }, {}),
      events: [{ kind: 'defend', characterId }],
    };
  }

  if (action.kind === 'parley' || action.kind === 'offer') {
    const here = (
      action.kind === 'parley' ? parleyTarget(state, c) : settlementHere(state, c)
    ) as Settlement;
    const spent = withCharacter(
      state,
      action.kind === 'offer' ? { pack: subtract(c.pack, check.uses) } : {},
    );
    if (action.kind === 'parley') {
      const roll = hashToUnit(
        state.seed,
        PARLEY_STREAM,
        state.day,
        hashString(c.id),
        hashString(here.id),
      );
      if (roll >= check.chance) {
        const angered = anger(spent, here);
        return { ok: true, state: angered.state, events: angered.events };
      }
    }
    const parleyBonus = effectsOf(c, 'parley-favour').reduce((sum, e) => sum + e.bonus, 0);
    const gain =
      action.kind === 'offer'
        ? state.config.offerFavour
        : (roleHas(c, PEOPLES_TAG)
            ? state.config.parleyFavourWarden
            : state.config.parleyFavourOther) + parleyBonus;
    const added = addFavour(spent, here, gain);
    const events: GameEvent[] = [
      action.kind === 'offer'
        ? { kind: 'offer', id: here.id, characterId, material: action.material }
        : { kind: 'parley', id: here.id, characterId, favour: added.favour },
    ];
    if (added.befriended) events.push({ kind: 'befriended', id: here.id });
    return { ok: true, state: added.state, events };
  }

  if (action.kind === 'ask-boon') {
    const here = settlementHere(state, c) as Settlement;
    const type = peopleType(here.type);
    let next: GameState = withCharacter(
      {
        ...state,
        settlements: state.settlements.map((s) =>
          s.id === here.id ? { ...s, boon: action.boon } : s,
        ),
      },
      {},
    );
    const events: GameEvent[] = [{ kind: 'boon', id: here.id, characterId, boon: action.boon }];
    if (action.boon === 'gift') {
      const gift: Record<string, number> = {};
      for (const g of type.gift) gift[g.material] = (gift[g.material] ?? 0) + g.amount;
      next = { ...next, stores: addMaterials(next.stores, gift) };
    } else if (action.boon === 'mislead') {
      const led = next.threats.filter((t) => threatType(t.type).tags.includes(PURSUER_TAG));
      next = {
        ...next,
        threats: next.threats.filter((t) => !led.includes(t)),
        misleadUntilDay: state.day + state.config.misleadDays,
      };
      for (const t of led) events.push({ kind: 'threat-gone', id: t.id });
    } else if (action.boon === 'shelter') {
      const peril = Math.max(0, state.peril - state.config.shelterPeril);
      if (peril !== state.peril) {
        events.push({
          kind: 'peril',
          from: state.peril,
          to: peril,
          sources: [{ source: PERIL_SHELTER, amount: peril - state.peril }],
        });
      }
      next = { ...next, peril };
    }
    return { ok: true, state: next, events };
  }

  if (action.kind === 'build') {
    const unlock = UNLOCKS.find((u) => u.id === action.unlock) as Unlock;
    const subtracted: Record<string, number> = { ...state.stores };
    for (const u of check.uses) subtracted[u.material] = (subtracted[u.material] ?? 0) - u.amount;
    const perBuild = Math.max(
      state.config.buildWork,
      bestOf(c, 'build-work', (e) => e.amount) ?? 0,
    );
    const work = (state.project?.work ?? 0) + perBuild;
    const finished = work >= unlock.work;
    const next: GameState = {
      ...state,
      stores: subtracted,
      project: finished ? null : { unlock: unlock.id, work },
      unlocks: finished ? [...state.unlocks, unlock.id] : state.unlocks,
    };
    const events: GameEvent[] = [
      { kind: 'unlock-progress', unlock: unlock.id, work, needed: unlock.work },
    ];
    if (finished) events.push({ kind: 'unlock-done', unlock: unlock.id });
    return { ok: true, state: withCharacter(next, {}), events };
  }

  const h = hexOf(c) as Hex;
  const key = hexKey(h);
  const f = state.features[key] as FeatureState;
  const type = featureType(f.type);

  if (action.kind === 'gather' && type.kind === 'node') {
    const { material } = type.yields;
    const amount = gatherYield(state, c, type);
    return {
      ok: true,
      state: withCharacter(
        { ...state, features: { ...state.features, [key]: { ...f, left: f.left - 1 } } },
        { pack: addMaterials(c.pack, { [material]: amount }) },
      ),
      events: [{ kind: 'gather', hex: h, characterId, material, amount }],
    };
  }

  if (action.kind === 'work-site' && type.kind === 'site') {
    const roll = hashToUnit(state.seed, SITE_STREAM, state.day, hashString(c.id), h.q, h.r);
    if (roll >= check.chance) {
      return {
        ok: true,
        state: withCharacter(state, {}),
        events: [{ kind: 'site-failed', hex: h, characterId }],
      };
    }
    const { material } = type.finds;
    // A second chamber gives more of the find, within the pack's room (the base find always fits).
    const more = bestOf(c, 'site-finds', (e) => e.amount) ?? 0;
    const amount = Math.min(type.finds.amount + more, Math.max(type.finds.amount, free(state, c)));
    let gained: Materials = { [material]: amount };
    let extra: { material: string; amount: number } | undefined;
    // Relic sense: now and then one extra unit of a rare material, if the pack has room.
    const relic = effectsOf(c, 'find-bonus')[0];
    if (relic && free(state, c) - amount >= 1) {
      const kinds = MATERIALS.filter((m) => m.tags.includes(relic.tag));
      const luck = hashToUnit(state.seed, SITE_STREAM, state.day, hashString(c.id), h.q, h.r, 7);
      if (kinds.length > 0 && luck < relic.chance) {
        const pick = kinds[
          Math.floor(
            hashToUnit(state.seed, SITE_STREAM, state.day, hashString(c.id), h.q, h.r, 8) *
              kinds.length,
          )
        ] as (typeof kinds)[number];
        gained = addMaterials(gained, { [pick.id]: 1 });
        extra = { material: pick.id, amount: 1 };
      }
    }
    // One find event, the bonus folded into it (one toast, one tally).
    const events: GameEvent[] = [
      { kind: 'find', hex: h, characterId, material, amount, ...(extra ? { extra } : {}) },
    ];
    let next: GameState = withCharacter(
      { ...state, features: { ...state.features, [key]: { ...f, left: 0 } } },
      { pack: addMaterials(c.pack, gained) },
    );
    // Old maps: the nearest unexplored site within range shows itself, for everyone.
    const reveal = bestOf(c, 'reveal-site', (e) => e.range);
    if (reveal !== null) {
      const target = Object.entries(next.features)
        .flatMap(([k, ft]) => {
          const tile = next.tiles[k];
          if (!tile || tile.explored || ft.revealed || featureType(ft.type).kind !== 'site') {
            return [];
          }
          const at = keyToHex(k);
          const d = hexDistance(h, at);
          return d <= reveal ? [{ at, d, k }] : [];
        })
        .sort((a, b) => a.d - b.d || (a.k < b.k ? -1 : 1))[0];
      if (target) {
        const shown = exploreHex(next, target.at);
        next = shown.state;
        events.push(...shown.events);
      }
    }
    return { ok: true, state: next, events };
  }
  return { ok: false, reason: 'invalid-action' };
};

/**
 * Does the action: the actor earns XP for it (a pick earns none; a scout also for newly explored
 * hexes), and the season's tallies follow its events.
 */
export const act = (state: GameState, characterId: string, action: Action): ActResult => {
  const result = actCore(state, characterId, action);
  if (!result.ok) return result;
  const earned = earnXp(result.state, characterId, action.kind, result.events);
  const recorded = recordTraces(
    state,
    recordEvents(earned, result.events, characterId),
    result.events,
  );
  const told = fireStory(recorded);
  return { ...result, state: told.state, events: [...result.events, ...told.events] };
};

/** Boons any people offers, in content order. */

const ALL_BOONS = BOONS.filter((b) => PEOPLE_TYPES.some((p) => p.boons.includes(b)));
/** Materials a settlement takes as an offering. */
const TRADE_GOODS = MATERIALS.filter((m) => m.tags.includes(TRADE_TAG));

/**
 * Every action a character could take now, with its check, for the interface:
 * surveying each adjacent unexplored hex, gathering and working a site here,
 * building each unlock, lighting a fire, feeding and lingering, striking each
 * threat, defending, parleying, offering each trade good and asking each boon.
 * Runs on a view.
 */
export const actionsHere = (
  state: GameStateView,
  characterId: string,
): { readonly action: Action; readonly check: ActCheck }[] => {
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) return [];
  const reach = surveyReach(c);
  const near: Hex[] =
    reach <= 1
      ? placeNeighbours(state, c.at).flatMap((p) => (p.kind === 'hex' ? [p.hex] : []))
      : hexesInRange(
          c.at.kind === 'hex' ? c.at.hex : state.creature.centre,
          reach + state.config.creatureRadius,
        ).filter((h) => withinSurvey(state, c, h));
  const surveys: Action[] = near.flatMap((h) =>
    state.tiles[hexKey(h)] && !isExplored(state, h) ? [{ kind: 'survey' as const, hex: h }] : [],
  );
  const options: Action[] = [
    ...surveys,
    { kind: 'gather' },
    { kind: 'work-site' },
    ...UNLOCKS.map((u) => ({ kind: 'build' as const, unlock: u.id })),
    { kind: 'light-fire' },
    { kind: 'feed' },
    { kind: 'linger' },
    { kind: 'grab-line' },
    ...state.characters
      .filter((x) => x.id !== characterId && x.status === 'active' && x.at.kind === 'hex')
      .map((x) => ({ kind: 'throw-line' as const, to: x.id })),
    ...state.threats.map((t) => ({ kind: 'strike' as const, threat: t.id })),
    { kind: 'defend' },
    { kind: 'parley' },
    ...TRADE_GOODS.map((m) => ({ kind: 'offer' as const, material: m.id })),
    ...ALL_BOONS.map((boon) => ({ kind: 'ask-boon' as const, boon })),
  ];
  return options.map((action) => ({ action, check: checkAction(state, characterId, action) }));
};

/** The same list as `actionsHere`. */
export const possibleActions = actionsHere;
