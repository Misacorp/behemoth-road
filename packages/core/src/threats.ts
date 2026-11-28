/**
 * Threats: they appear at the window's edge (or on the road ahead), move toward
 * the creature at each tick, and strike it at contact (next to its footprint) or
 * strike characters standing beside them. Wardens defend the creature, escort
 * the characters near them and strike threats down. Threat types are content,
 * read by their tags and properties, never by id.
 */

import { THREAT_TYPES, type ThreatType } from './content/index.ts';
import { isSanctuary } from './destination.ts';
import { roleHas } from './features.ts';
import { FEARS_FIRE_TAG, inFireRing } from './fire.ts';
import { bestOf, effectsOf } from './skills.ts';
import {
  type Direction,
  type Hex,
  hexDistance,
  hexEquals,
  hexRing,
  neighbour,
  neighbours,
  rotate,
} from './hex.ts';
import { terrainOf } from './map.ts';
import type { Character, GameStateView, Threat } from './state.ts';
import { isCreatureHex } from './window.ts';

/** The threat tag of threats that walk on the ground (every rolled threat stays off water). */
export const GROUND_TAG = 'ground';
/** The threat tag a mislead leads away. */
export const PURSUER_TAG = 'pursuer';
/** The threat tag of threats a strike can bring down on the striker (a rockslide). */
export const FALLS_TAG = 'falls';
/** The role tag of a warden's strength in a fight, and of defending the creature. */
export const DEFEND_TAG = 'defend';
/** The role tag of a warden's escort: no one near them is struck, nor are they. */
export const ESCORT_TAG = 'escort';
/** The terrain tags threats never appear on (water, and islands nobody can walk to). */
const OFF_LIMITS_TAGS = ['water', 'island'];

export const threatType = (id: string): ThreatType => {
  const type = THREAT_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`Unknown threat type: ${id}`);
  return type;
};

/**
 * Distance from the creature's centre at which a threat of a type strikes it:
 * `reach` hexes beyond the footprint (next to it, or on it for a reach of 0).
 */
export const contactDistance = (state: GameStateView, type: ThreatType): number =>
  state.config.creatureRadius + type.reach;

/**
 * Whether a threat of a type keeps off a hex because a fire burns there or next to it: only types
 * tagged `fears-fire`, and only while the fire burns `ahead` ticks from now.
 */
export const keepsClearOf = (state: GameStateView, type: ThreatType, h: Hex, ahead = 1): boolean =>
  type.tags.includes(FEARS_FIRE_TAG) && inFireRing(state, h, ahead);

export const activeCount = (state: GameStateView): number =>
  state.characters.filter((c) => c.status === 'active').length;

/** A threat's strength on a day: the type's base, plus more for more players and later days. */
export const threatStrength = (state: GameStateView, type: ThreatType, day: number): number => {
  const { threatStrengthPlayers, threatStrengthDays } = state.config;
  const players = Math.max(0, activeCount(state) - 1);
  return (
    type.strength +
    Math.floor(players / threatStrengthPlayers) +
    Math.floor(Math.max(0, day - 1) / threatStrengthDays)
  );
};

/** The neighbour of `from` closest to `to`; ties go to the first in direction order (north, clockwise). */
export const stepToward = (from: Hex, to: Hex): Hex => {
  let best = neighbour(from, 'n');
  for (const n of neighbours(from)) {
    if (hexDistance(n, to) < hexDistance(best, to)) best = n;
  }
  return best;
};

/**
 * The hexes a threat walks through at one tick toward `centre`: up to its speed,
 * stopping at contact. Empty when it does not move. A threat that fears fire holds where it is rather
 * than step into the ring of a fire burning `ahead` ticks from now (it does not go around).
 */
export const threatPath = (state: GameStateView, threat: Threat, centre: Hex, ahead = 1): Hex[] => {
  const type = threatType(threat.type);
  const contact = contactDistance(state, type);
  const path: Hex[] = [];
  let at = threat.hex;
  for (let i = 0; i < type.speed; i++) {
    if (hexDistance(at, centre) <= contact) break;
    const next = stepToward(at, centre);
    if (keepsClearOf(state, type, next, ahead)) break;
    // The destination is a sanctuary: no threat walks into it.
    if (isSanctuary(state, next)) break;
    at = next;
    path.push(at);
  }
  return path;
};

/**
 * Hexes of the window's edge ring, ordered by how close they lie to the edge
 * hex straight out from the centre in `direction` (that hex first); ties keep
 * the ring's fixed order.
 */
const edgeFrom = (state: GameStateView, direction: Direction): Hex[] => {
  const { centre } = state.creature;
  const radius = state.config.windowRadius;
  let anchor = centre;
  for (let i = 0; i < radius; i++) anchor = neighbour(anchor, direction);
  return hexRing(centre, radius)
    .map((h, i) => ({ h, i, d: hexDistance(h, anchor) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.h);
};

/**
 * The window's leading edge: the edge hexes within a sixth of a turn of the
 * heading, in the ring's fixed order.
 */
export const leadingEdge = (state: GameStateView): Hex[] => {
  const radius = state.config.windowRadius;
  const ordered = edgeFrom(state, state.creature.heading);
  const anchor = ordered[0] as Hex;
  return ordered.filter((h) => hexDistance(h, anchor) <= radius);
};

/**
 * Where a threat of a type may appear, best first: `behind` from the edge hex
 * straight behind, `flank` from the edge hex ahead-left (`side` −1) or
 * ahead-right (+1), `path` along the straight-ahead line from
 * `threatPathDistance` outward. `sent` threats never appear by themselves.
 */
export const approachHexes = (state: GameStateView, type: ThreatType, side: -1 | 1): Hex[] => {
  const { heading, centre } = state.creature;
  switch (type.approach) {
    case 'behind':
      return edgeFrom(state, rotate(heading, 3));
    case 'flank':
      return edgeFrom(state, rotate(heading, side));
    case 'path': {
      const out: Hex[] = [];
      let at = centre;
      for (let d = 1; d <= state.config.windowRadius; d++) {
        at = neighbour(at, heading);
        if (d >= state.config.threatPathDistance) out.push(at);
      }
      return out;
    }
    default:
      return [];
  }
};

/** Whether a rolled threat may appear on a hex: known, not water, not on the creature, a settlement or a threat. */
export const canAppearOn = (state: GameStateView, h: Hex, type?: ThreatType): boolean => {
  const terrain = terrainOf(state, h);
  if (!terrain || isCreatureHex(state, h)) return false;
  if (isSanctuary(state, h)) return false;
  if (type && keepsClearOf(state, type, h)) return false;
  if (type?.on && !type.on.some((tag) => terrain.tags.includes(tag))) return false;
  if (OFF_LIMITS_TAGS.some((tag) => terrain.tags.includes(tag))) return false;
  if (state.settlements.some((s) => hexEquals(s.hex, h))) return false;
  return !state.threats.some((t) => hexEquals(t.hex, h));
};

/** How far a warden's escort reaches: 1, or more with a skill (wide guard). */
export const escortReach = (g: Character): number =>
  Math.max(1, bestOf(g, 'escort-range', (e) => e.range) ?? 0);

/** An active warden standing on a hex escorts everyone within 1 of it. */
export const isEscorted = (state: GameStateView, h: Hex): boolean =>
  state.characters.some(
    (g) =>
      g.status === 'active' &&
      g.at.kind === 'hex' &&
      roleHas(g, ESCORT_TAG) &&
      hexDistance(g.at.hex, h) <= escortReach(g),
  );

/**
 * The characters a threat on `at` strikes: every active one on a hex within its
 * `reach` of it (not on the creature's footprint), unless a warden or escorted.
 * Riders are never struck. A reach of 0 strikes only those standing on its hex.
 */
export const struckBy = (state: GameStateView, at: Hex, reach: number): Character[] =>
  state.characters.filter(
    (c) =>
      c.status === 'active' &&
      c.at.kind === 'hex' &&
      !isCreatureHex(state, c.at.hex) &&
      hexDistance(c.at.hex, at) <= reach &&
      !roleHas(c, ESCORT_TAG) &&
      !isEscorted(state, c.at.hex),
  );

/**
 * The hazard on a hex a character is about to walk into: a threat standing there that strikes only its own
 * hex (reach 0, a rockslide), unless the character is a warden or escorted. Null when the way is safe.
 */
export const hazardAt = (state: GameStateView, characterId: string, h: Hex): Threat | null => {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character || roleHas(character, ESCORT_TAG) || isEscorted(state, h)) return null;
  return state.threats.find((t) => hexEquals(t.hex, h) && threatType(t.type).reach === 0) ?? null;
};

/** How much the creature's defenders take off each strike: per defender still riding. */
export const defence = (state: GameStateView): number =>
  state.creature.defenders.reduce((sum, id) => {
    const c = state.characters.find((x) => x.id === id);
    if (c?.status !== 'active' || c.at.kind !== 'creature') return sum;
    // A defend skill (bulwark) takes more off than the base.
    const best = bestOf(c, 'defend-reduction', (e) => e.amount);
    return sum + Math.max(state.config.defendReduction, best ?? 0);
  }, 0);

/**
 * Where the creature's centre will be after the next tick if it walks straight
 * on (or stays, when it lingers): the public guess `threatOutlook` and
 * `threatNextPath` make, blind to its real step.
 */
const nextCentreGuess = (state: GameStateView): Hex =>
  state.creature.lingering
    ? state.creature.centre
    : neighbour(state.creature.centre, state.creature.heading);

/**
 * The hexes a threat will cross at the next tick, its end hex last, if the
 * creature walks straight on (the same guess as `threatOutlook`). Empty when it
 * will not move, or when there is no threat with that id. Reads only the public view.
 */
export const threatNextPath = (state: GameStateView, threatId: string, days = 1): Hex[] => {
  const threat = state.threats.find((t) => t.id === threatId);
  if (!threat) return [];
  const out: Hex[] = [];
  let centre = nextCentreGuess(state);
  let at = threat.hex;
  for (let tick = 1; tick <= Math.max(1, days); tick++) {
    const path = threatPath(state, { ...threat, hex: at }, centre, tick);
    out.push(...path);
    at = path.at(-1) ?? at;
    centre = neighbour(centre, state.creature.heading);
  }
  return out;
};

/** How many ticks ahead threat trails show: 1, or more while a character in the game has a forecast skill. */
export const forecastDays = (state: GameStateView): number =>
  Math.max(
    1,
    ...state.characters
      .filter((c) => c.status === 'active')
      .flatMap((c) => effectsOf(c, 'forecast').map((e) => e.days)),
  );

export type Arrival = 'tomorrow' | 'later' | 'never';

export interface ThreatOutlook {
  readonly id: string;
  /** Whether it reaches the creature at the next tick, at a later one, or never, if the creature walks straight on. */
  readonly arrives: Arrival;
  /** The hex it steps to first at the next tick, or null when it does not move. */
  readonly next: Hex | null;
}

/**
 * For each threat, whether it reaches contact if the creature walks straight on
 * (or stays, when it lingers) and where it steps first. Blind to the creature's
 * real step, like `predictCreature`: it reads only the public view.
 */
export const threatOutlook = (state: GameStateView): ThreatOutlook[] => {
  const { heading } = state.creature;
  // Far enough to settle any threat: it either closes in, falls out of the window or stalls.
  const horizon = 4 * (state.config.windowRadius + 1);
  return state.threats.map((threat) => {
    const type = threatType(threat.type);
    const contact = contactDistance(state, type);
    let centre = nextCentreGuess(state);
    let at = threat.hex;
    let next: Hex | null = null;
    let arrives: Arrival = 'never';
    for (let tick = 1; tick <= horizon; tick++) {
      const path = threatPath(state, { ...threat, hex: at }, centre, tick);
      if (tick === 1) next = path[0] ?? null;
      at = path.at(-1) ?? at;
      if (hexDistance(at, centre) <= contact && !keepsClearOf(state, type, at, tick)) {
        arrives = tick === 1 ? 'tomorrow' : 'later';
        break;
      }
      if (hexDistance(at, centre) > state.config.windowRadius) break;
      centre = neighbour(centre, heading);
    }
    return { id: threat.id, arrives, next };
  });
};
