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
import {
  cartAtHex,
  cartPulledBy,
  cartRiddenBy,
  cartRoom,
  cartSpot,
  finishUnlock,
  isVehicleUnlock,
  releaseFromCart,
  setCart,
} from './cart.ts';
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
  lightAround,
  packSize,
  roleHas,
  unlockTags,
} from './features.ts';
import {
  type Direction,
  DIRECTIONS,
  type Hex,
  hexDistance,
  hexesInRange,
  hexKey,
  isValidHex,
  neighbour,
} from './hex.ts';
import { canLeadOnto } from './lures.ts';
import { terrainOf } from './map.ts';
import { BURNABLE_TAG, FIRE_SITE_TAG } from './fire.ts';
import { arePlacesAdjacent, ON_CREATURE, onHex, placeEquals, placeNeighbours } from './places.ts';
import { hashString, hashToUnit } from './random.ts';
import {
  type Cart,
  type Character,
  type FeatureState,
  type GameState,
  type GameStateView,
  hasSeed,
  isSeasonOver,
  type Materials,
  type Settlement,
  type Stimulus,
  unpinned,
} from './state.ts';
import { isCreatureHex, isInWindow } from './window.ts';
import { DEFEND_TAG, FALLS_TAG, PURSUER_TAG, threatType } from './threats.ts';
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
  /** Frees a pinned character on the same or a neighbouring place (see `Character.pinnedDay`). */
  | { readonly kind: 'dig-out'; readonly target: string }
  /** A pinned character struggles to get free: rolls (seeded), the chance growing with each failure. */
  | { readonly kind: 'struggle' }
  /**
   * Leads a lure (a small animal) one hex: to the neighbouring hex in `direction`, or to `to` (a neighbour of
   * the lure's hex). The character must stand on the lure's hex or beside it. Give exactly one of the two.
   */
  | {
      readonly kind: 'lead';
      readonly lure: string;
      readonly direction?: Direction;
      readonly to?: Hex;
    }
  | { readonly kind: 'parley' }
  | { readonly kind: 'offer'; readonly material: string }
  | { readonly kind: 'ask-boon'; readonly boon: string }
  /** Takes a skill node with a pick the character has earned (`docs/design/skill-trees.md`). Free. */
  | { readonly kind: 'pick-skill'; readonly node: string }
  /** The cart on the character's hex: hitch to it (it then moves with them, for more per step). */
  | { readonly kind: 'hitch' }
  /** Lets the hitched cart go where it stands. Free. */
  | { readonly kind: 'unhitch' }
  /** Climbs into the seat of the cart on the character's hex. */
  | { readonly kind: 'board-cart' }
  /** Climbs out of the cart's seat. Free. */
  | { readonly kind: 'leave-cart' }
  /** Moves `amount` units of a material from the pack to a cart on or next to the character's place. Free. */
  | { readonly kind: 'load'; readonly material: string; readonly amount: number }
  /** Moves `amount` units of a material from a cart on or next to the character's place to the pack. Free. */
  | { readonly kind: 'unload'; readonly material: string; readonly amount: number }
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
  /** Lighting a fire needs a brazier (`fire-site`) or a burnable feature on the hex. */
  | 'nothing-to-burn'
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
  /** The character is pinned by a falling slide: they can only struggle (or set the stance, pick) until freed. */
  | 'pinned'
  /** A dig-out on a character who is not pinned. */
  | 'not-pinned'
  /** The cart: none on (or, for load and unload, next to) the character's place. */
  | 'no-cart'
  /** Hitching to a cart someone else pulls. */
  | 'cart-taken'
  /** Boarding a cart whose seat is taken. */
  | 'seat-taken'
  /** Unhitching a cart the character does not pull. */
  | 'not-hitched'
  /** Leaving a cart the character does not sit in. */
  | 'not-aboard'
  /** Hitching to a cart the character sits in. */
  | 'aboard'
  /** Boarding a cart the character pulls. */
  | 'hitched'
  | 'cart-full'
  | 'cart-empty'
  /** Loading a material the pack lacks. */
  | 'no-material'
  /** Building a cart with nowhere to put it. */
  | 'no-room'
  /** Leading a lure: there is no lure with that id; it has no leads left; the hex it would go to is not open to it. */
  | 'no-lure'
  | 'settled'
  | 'blocked'
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
const FIRE = STIMULUS_TYPES.find((t) => t.tags.includes('fire') && !t.tags.includes(FIRE_SITE_TAG));
/** The stimulus lit on a fire-site (a brazier): tagged `fire` and `fire-site`. */
const SITE_FIRE = STIMULUS_TYPES.find((t) => t.tags.includes(FIRE_SITE_TAG));

/** A fire as lit by a character: a beacon skill widens its reach and strengthens its push. */
const litFire = (
  c: Character,
  type: string,
  hex: Hex,
  litDay: number,
  /** A brazier: the nights it burns before a Beacon adds more, and the hexes it shows. */
  site?: { readonly nights: number; readonly reveal: number },
): Stimulus => {
  const boosted = bestOf(c, 'fire-boost', (e) => e.range);
  // A brazier's own reach (its type's) stands unless a Beacon reaches further.
  const own = STIMULUS_TYPES.find((t) => t.id === type)?.range;
  const range = site && own !== undefined ? Math.max(own, boosted ?? 0) : boosted;
  const push = bestOf(c, 'fire-boost', (e) => e.push);
  const more = bestOf(c, 'fire-boost', (e) => e.nights ?? 0) ?? 0;
  return {
    type,
    hex,
    litDay,
    ...(range === null ? {} : { range }),
    ...(push === null ? {} : { push }),
    ...(site ? { nights: site.nights + more, reveal: site.reveal } : {}),
  };
};

/** The feature with its stocked flag cleared (its first fire has burnt the old fuel). */
const unstocked = (f: FeatureState): FeatureState => {
  const rest: Record<string, unknown> = { ...f };
  delete rest['stocked'];
  return rest as unknown as FeatureState;
};

const FALL_STREAM = hashString('slide-fall');

/**
 * The chance a strike on a threat with these tags brings it down on the striker: the tuning's
 * `slideFallChance` times each `sure-footed` factor (role and skills) for a tag the threat has. Zero
 * when the threat does not fall.
 */
export const fallChance = (
  state: GameStateView,
  c: Character,
  threatTags: readonly string[],
): number => {
  if (!threatTags.includes(FALLS_TAG)) return 0;
  return effectsOf(c, 'sure-footed')
    .filter((e) => threatTags.includes(e.tag))
    .reduce((chance, e) => chance * e.factor, state.config.slideFallChance);
};

const STRUGGLE_STREAM = hashString('struggle');

/**
 * The chance the next struggle frees a pinned character: `struggleChanceBase` plus `struggleChanceStep`
 * for each failed struggle so far under this pin (capped at 1, so a long enough run always frees).
 */
export const struggleChance = (state: GameStateView, c: Character): number =>
  Math.min(
    1,
    state.config.struggleChanceBase + state.config.struggleChanceStep * (c.struggles ?? 0),
  );

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

/** Where a finished cart is put from: the character's hex, or the creature's centre when they ride it. */
const placeFrom = (state: GameStateView, c: Character): Hex =>
  c.at.kind === 'hex' ? c.at.hex : state.creature.centre;

/** The cart on the character's place or next to it (load and unload reach this far). */
const cartNear = (state: GameStateView, c: Character): Cart | undefined =>
  state.carts.find(
    (cart) => placeEquals(c.at, onHex(cart.hex)) || arePlacesAdjacent(state, c.at, onHex(cart.hex)),
  );

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
  if (
    c.pinnedDay !== undefined &&
    action?.kind !== 'set-stance' &&
    action?.kind !== 'pick-skill' &&
    action?.kind !== 'struggle'
  ) {
    return { ok: false, reason: 'pinned' };
  }
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
      // A vehicle is not an unlock the team holds: it is one on the map (a lost one can be rebuilt).
      if (isVehicleUnlock(unlock) && state.carts.length >= config.cartsMax) {
        return { ok: false, reason: 'already-have', cost };
      }
      if (project && project.unlock !== unlock.id) return no('busy');
      if (missing.length > 0) return no('missing-materials');
      if (isVehicleUnlock(unlock) && cartSpot(state, placeFrom(state, c)) === null) {
        return no('no-room');
      }
      return c.actionsLeft >= cost ? done(cost, uses) : no('not-enough-actions');
    }
    case 'hitch': {
      const cost = config.cartHitchCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      const here = hexOf(c);
      const cart = here ? cartAtHex(state, here) : undefined;
      if (!cart) return no('no-cart');
      if (cart.rider === c.id) return no('aboard');
      if (cart.puller === c.id || cartPulledBy(state, c.id)) return no('already-have');
      if (cart.puller !== null) return no('cart-taken');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'unhitch':
      return cartPulledBy(state, c.id) ? done(0) : { ok: false, reason: 'not-hitched', cost: 0 };
    case 'board-cart': {
      const cost = config.cartBoardCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      const here = hexOf(c);
      const cart = here ? cartAtHex(state, here) : undefined;
      if (!cart) return no('no-cart');
      if (cart.rider === c.id) return no('already-have');
      if (cart.puller === c.id) return no('hitched');
      if (cart.rider !== null) return no('seat-taken');
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'leave-cart':
      return cartRiddenBy(state, c.id) ? done(0) : { ok: false, reason: 'not-aboard', cost: 0 };
    case 'load':
    case 'unload': {
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost: 0 });
      const amount = action.amount;
      if (!Number.isInteger(amount) || amount < 1) return no('invalid-action');
      if (!MATERIALS.some((m) => m.id === action.material)) return no('invalid-action');
      const cart = cartNear(state, c);
      if (!cart) return no('no-cart');
      if (action.kind === 'load') {
        if ((c.pack[action.material] ?? 0) < amount) return no('no-material');
        if (cartRoom(state, cart) < amount) return no('cart-full');
      } else {
        if ((cart.cargo[action.material] ?? 0) < amount) return no('cart-empty');
        if (free(state, c) < amount) return no('pack-full');
      }
      return done(0);
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
      // A fire needs something to burn: a brazier, or a feature that burns away.
      const here = featureHere(state, c);
      const fuelTags = here ? featureType(here.type).tags : [];
      if (!fuelTags.includes(FIRE_SITE_TAG) && !fuelTags.includes(BURNABLE_TAG)) {
        return no('nothing-to-burn');
      }
      if (state.stimuli.some((s) => hexKey(s.hex) === hexKey(h))) return no('fire-here');
      // A stocked brazier needs no fuel from the pack for its first fire.
      if (here?.stocked === true) {
        return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
      }
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
    case 'dig-out': {
      const cost = config.digOutCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (typeof action.target !== 'string' || action.target === c.id) return no('invalid-action');
      const target = state.characters.find((x) => x.id === action.target);
      if (!target) return no('unknown-character');
      if (target.status !== 'active') return no('character-lost');
      if (target.pinnedDay === undefined) return no('not-pinned');
      if (!placeEquals(c.at, target.at) && !arePlacesAdjacent(state, c.at, target.at)) {
        return no('not-near');
      }
      return c.actionsLeft >= cost ? done(cost) : no('not-enough-actions');
    }
    case 'struggle': {
      const cost = config.struggleCost;
      if (c.pinnedDay === undefined) return { ok: false, reason: 'not-pinned', cost };
      if (c.actionsLeft < cost) return { ok: false, reason: 'not-enough-actions', cost };
      return { ok: true, cost, uses: [], chance: struggleChance(state, c) };
    }
    case 'lead': {
      const cost = config.leadCost;
      const no = (reason: ActRefusal): ActCheck => ({ ok: false, reason, cost });
      if (typeof action.lure !== 'string') return no('invalid-action');
      const hasDirection = action.direction !== undefined;
      if (hasDirection === (action.to !== undefined)) return no('invalid-action');
      if (action.direction !== undefined && !DIRECTIONS.includes(action.direction)) {
        return no('invalid-action');
      }
      if (action.to !== undefined && !isValidHex(action.to)) return no('invalid-hex');
      const lure = state.lures.find((l) => l.id === action.lure);
      if (!lure) return no('no-lure');
      const here = hexOf(c);
      if (!here || hexDistance(here, lure.hex) > 1) return no('not-near');
      if (lure.leadsLeft <= 0) return no('settled');
      const target = action.direction ? neighbour(lure.hex, action.direction) : (action.to as Hex);
      if (hexDistance(target, lure.hex) !== 1) return no('not-adjacent');
      if (!canLeadOnto(state, lure, target)) return no('blocked');
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

  if (
    action.kind === 'hitch' ||
    action.kind === 'unhitch' ||
    action.kind === 'board-cart' ||
    action.kind === 'leave-cart'
  ) {
    const cart = (
      action.kind === 'hitch' || action.kind === 'board-cart'
        ? cartAtHex(state, hexOf(c) as Hex)
        : action.kind === 'unhitch'
          ? cartPulledBy(state, characterId)
          : cartRiddenBy(state, characterId)
    ) as Cart;
    const puller =
      action.kind === 'hitch' ? characterId : action.kind === 'unhitch' ? null : cart.puller;
    const rider =
      action.kind === 'board-cart' ? characterId : action.kind === 'leave-cart' ? null : cart.rider;
    const kind = {
      hitch: 'hitched',
      unhitch: 'unhitched',
      'board-cart': 'boarded-cart',
      'leave-cart': 'left-cart',
    }[action.kind] as 'hitched' | 'unhitched' | 'boarded-cart' | 'left-cart';
    return {
      ok: true,
      state: withCharacter(setCart(state, { ...cart, puller, rider }), {}),
      events: [{ kind, cart: cart.id, characterId, hex: cart.hex }],
    };
  }

  if (action.kind === 'load' || action.kind === 'unload') {
    const cart = cartNear(state, c) as Cart;
    const { material, amount } = action;
    const loading = action.kind === 'load';
    const sign = loading ? 1 : -1;
    const shifted = (from: Materials, by: number): Materials => {
      const out: Record<string, number> = { ...from };
      const left = (out[material] ?? 0) + by;
      if (left > 0) out[material] = left;
      else delete out[material];
      return out;
    };
    const next = setCart(state, { ...cart, cargo: shifted(cart.cargo, sign * amount) });
    let packed = withCharacter(next, { pack: shifted(c.pack, -sign * amount) });
    const events: GameEvent[] = [
      {
        kind: loading ? 'loaded' : 'unloaded',
        cart: cart.id,
        characterId,
        hex: cart.hex,
        material,
        amount,
      },
    ];
    // Someone on the creature has what they unload put straight into the stores.
    if (!loading) {
      const deposited = depositPack(packed, characterId);
      packed = deposited.state;
      events.push(...deposited.events);
    }
    return { ok: true, state: packed, events };
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
    const key = hexKey(h);
    const feature = state.features[key] as FeatureState;
    const tags = featureType(feature.type).tags;
    const events: GameEvent[] = [{ kind: 'fire-lit', hex: h, characterId, stimulus: FIRE.id }];
    if (tags.includes(FIRE_SITE_TAG) && SITE_FIRE) {
      events[0] = { kind: 'fire-lit', hex: h, characterId, stimulus: SITE_FIRE.id };
      // A brazier burns for nights and shows the hexes around it.
      const site = { nights: state.config.brazierNights, reveal: state.config.brazierRevealRadius };
      const lit: GameState = {
        ...state,
        stimuli: [...state.stimuli, litFire(c, SITE_FIRE.id, h, state.day, site)],
      };
      const cleared: GameState = {
        ...lit,
        features: { ...lit.features, [key]: unstocked(feature) },
      };
      const spent = withCharacter(cleared, { pack: subtract(c.pack, check.uses) });
      const shown = lightAround(spent, h, site.reveal);
      return { ok: true, state: shown.state, events: [...events, ...shown.events] };
    }
    // Something burnable goes up for good, and burns as a one-night fire.
    const { [key]: burnt, ...features } = state.features;
    events.push({
      kind: 'feature-burnt',
      hex: h,
      characterId,
      feature: (burnt as FeatureState).type,
    });
    const lit: GameState = {
      ...state,
      features,
      burnt: [...state.burnt, { hex: h, feature: (burnt as FeatureState).type }],
      stimuli: [...state.stimuli, litFire(c, FIRE.id, h, state.day)],
    };
    return {
      ok: true,
      state: withCharacter(lit, { pack: subtract(c.pack, check.uses) }),
      events,
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
    // Hauled aboard from a cart: out of its seat or off its shafts (it stays where it stands).
    const hauled = withCharacter(releaseFromCart({ ...state, creature }, characterId), {
      at: ON_CREATURE,
    });
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
    // A slide may fall on the striker (after the blow, which still counts): they lose the rest of the day.
    const roll = hashToUnit(
      state.seed,
      FALL_STREAM,
      state.day,
      hashString(c.id),
      hashString(threat.id),
      threat.strength,
    );
    const pinned = roll < fallChance(state, c, tags);
    if (pinned) events.push({ kind: 'pinned', characterId, threat: threat.id });
    // They keep the actions they have left, to struggle with.
    return {
      ok: true,
      state: withCharacter({ ...state, threats }, pinned ? { pinnedDay: state.day } : {}),
      events,
    };
  }

  if (action.kind === 'struggle') {
    // Seeded from the day, the character and the try number: refusals change nothing, so no rerolling.
    const tries = c.struggles ?? 0;
    const roll = hashToUnit(state.seed, STRUGGLE_STREAM, state.day, hashString(c.id), tries);
    const freed = roll < check.chance;
    const base = withCharacter(state, {});
    return {
      ok: true,
      state: {
        ...base,
        characters: base.characters.map((x) =>
          x.id === characterId ? (freed ? unpinned(x) : { ...x, struggles: tries + 1 }) : x,
        ),
      },
      events: [{ kind: 'struggled', characterId, freed }],
    };
  }

  if (action.kind === 'dig-out') {
    return {
      ok: true,
      state: withCharacter(
        {
          ...state,
          characters: state.characters.map((x) => (x.id === action.target ? unpinned(x) : x)),
        },
        {},
      ),
      events: [{ kind: 'dug-out', characterId: action.target, by: characterId }],
    };
  }

  if (action.kind === 'lead') {
    const lure = state.lures.find((l) => l.id === action.lure);
    if (!lure) return { ok: false, reason: 'no-lure' };
    const to = action.direction ? neighbour(lure.hex, action.direction) : (action.to as Hex);
    const leadsLeft = lure.leadsLeft - 1;
    const events: GameEvent[] = [
      { kind: 'lure-led', id: lure.id, characterId, from: lure.hex, to, leadsLeft },
    ];
    if (leadsLeft <= 0) events.push({ kind: 'lure-settled', id: lure.id, hex: to });
    return {
      ok: true,
      state: withCharacter(
        {
          ...state,
          lures: state.lures.map((l) => (l.id === lure.id ? { ...l, hex: to, leadsLeft } : l)),
        },
        {},
      ),
      events,
    };
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
    let next: GameState = {
      ...state,
      stores: subtracted,
      project: finished ? null : { unlock: unlock.id, work },
    };
    const events: GameEvent[] = [
      { kind: 'unlock-progress', unlock: unlock.id, work, needed: unlock.work },
    ];
    if (finished) {
      const built = finishUnlock(next, unlock, placeFrom(state, c), characterId);
      next = built.state;
      events.push(...built.events);
    }
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

/** Loads and unloads worth offering: each material the pack holds (into the cart), each the cart holds (out), as much as fits. */
const cartLoads = (state: GameStateView, c: Character): Action[] => {
  const cart = cartNear(state, c);
  if (!cart) return [];
  const out: Action[] = [];
  for (const [material, n] of Object.entries(c.pack)) {
    const amount = Math.min(n, cartRoom(state, cart));
    if (amount >= 1) out.push({ kind: 'load', material, amount });
  }
  for (const [material, n] of Object.entries(cart.cargo)) {
    const amount = Math.min(n, free(state, c));
    if (amount >= 1) out.push({ kind: 'unload', material, amount });
  }
  return out;
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
    { kind: 'hitch' },
    { kind: 'unhitch' },
    { kind: 'board-cart' },
    { kind: 'leave-cart' },
    ...cartLoads(state, c),
    ...state.characters
      .filter((x) => x.id !== characterId && x.status === 'active' && x.at.kind === 'hex')
      .map((x) => ({ kind: 'throw-line' as const, to: x.id })),
    ...state.threats.map((t) => ({ kind: 'strike' as const, threat: t.id })),
    ...(c.pinnedDay !== undefined ? [{ kind: 'struggle' as const }] : []),
    // Leading a lure: each lure at hand, each way it could be led.
    ...state.lures
      .filter((l) => c.at.kind === 'hex' && hexDistance(c.at.hex, l.hex) <= 1)
      .flatMap((l) =>
        DIRECTIONS.map((direction) => ({ kind: 'lead' as const, lure: l.id, direction })),
      ),
    ...state.characters
      .filter(
        (x) =>
          x.id !== characterId &&
          x.pinnedDay !== undefined &&
          x.status === 'active' &&
          (placeEquals(c.at, x.at) || arePlacesAdjacent(state, c.at, x.at)),
      )
      .map((x) => ({ kind: 'dig-out' as const, target: x.id })),
    { kind: 'defend' },
    { kind: 'parley' },
    ...TRADE_GOODS.map((m) => ({ kind: 'offer' as const, material: m.id })),
    ...ALL_BOONS.map((boon) => ({ kind: 'ask-boon' as const, boon })),
  ];
  return options.map((action) => ({ action, check: checkAction(state, characterId, action) }));
};

/** The same list as `actionsHere`. */
export const possibleActions = actionsHere;

/** The public chances of an action that rolls, and what a failure means. */
export interface Odds {
  /** Chance the roll goes the character's way (0 to 1). */
  readonly success: number;
  /** Chance it does not: `1 - success`. */
  readonly failure: number;
  /**
   * What a failure is, as a tag-like word for the interface to turn into a look: `buried` (a strike
   * that brings the slide down on the striker), `still-pinned` (a struggle), `angered` (a parley),
   * `site-failed` (a site worked in vain).
   */
  readonly failureKind: string;
}

const oddsFrom = (success: number, failureKind: string): Odds => ({
  success,
  failure: 1 - success,
  failureKind,
});

/**
 * The chances of an action that rolls on public data, for any view: striking a threat tagged `falls`,
 * struggling, a parley with a wary settlement, and working a site here. Null for an action with no
 * roll, and where the chance would rest on hidden information (a trap, an unrevealed feature): a
 * chance is never shown for what the player cannot see. It does not check cost or reach; ask
 * `checkAction` for that.
 */
export const oddsOf = (state: GameStateView, characterId: string, action: Action): Odds | null => {
  const found = activeCharacter(state, characterId);
  if (!found.ok) return null;
  const c = found.character;
  switch (action?.kind) {
    case 'strike': {
      const threat = state.threats.find((t) => t.id === action.threat);
      if (!threat) return null;
      const tags = threatType(threat.type).tags;
      if (!tags.includes(FALLS_TAG)) return null;
      return oddsFrom(1 - fallChance(state, c, tags), 'buried');
    }
    case 'struggle':
      return c.pinnedDay === undefined ? null : oddsFrom(struggleChance(state, c), 'still-pinned');
    case 'parley': {
      const here = parleyTarget(state, c);
      return here?.attitude === 'wary' ? oddsFrom(parleyChance(state, c), 'angered') : null;
    }
    case 'work-site': {
      const f = featureHere(state, c);
      const type = f ? featureType(f.type) : null;
      if (!f || type?.kind !== 'site' || f.left <= 0) return null;
      const chance = siteChance(state, c, type);
      return chance > 0 ? oddsFrom(chance, 'site-failed') : null;
    }
    default:
      return null;
  }
};
