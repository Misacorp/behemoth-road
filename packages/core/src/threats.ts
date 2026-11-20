/**
 * Threats: they appear at the window's edge (or on the road ahead), move toward
 * the creature at each tick, and strike it at contact (next to its footprint) or
 * strike characters standing beside them. Guardians defend the creature, escort
 * the characters near them and strike threats down. Threat types are content,
 * read by their tags and properties, never by id.
 */

import { THREAT_TYPES, type ThreatType } from './content/index.ts';
import { roleHas } from './features.ts';
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
/** The role tag of a guardian's strength in a fight, and of defending the creature. */
export const DEFEND_TAG = 'defend';
/** The role tag of a guardian's escort: no one near them is struck, nor are they. */
export const ESCORT_TAG = 'escort';
/** The terrain tag ground threats never appear on. */
const WATER_TAG = 'water';

export const threatType = (id: string): ThreatType => {
  const type = THREAT_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`Unknown threat type: ${id}`);
  return type;
};

/** Distance from the creature's centre at which a threat strikes it: next to the footprint. */
export const contactDistance = (state: GameStateView): number => state.config.creatureRadius + 1;

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
 * stopping at contact. Empty when it does not move.
 */
export const threatPath = (state: GameStateView, threat: Threat, centre: Hex): Hex[] => {
  const contact = contactDistance(state);
  const path: Hex[] = [];
  let at = threat.hex;
  for (let i = 0; i < threatType(threat.type).speed; i++) {
    if (hexDistance(at, centre) <= contact) break;
    at = stepToward(at, centre);
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
export const canAppearOn = (state: GameStateView, h: Hex): boolean => {
  const terrain = terrainOf(state, h);
  if (!terrain || isCreatureHex(state, h)) return false;
  if (terrain.tags.includes(WATER_TAG)) return false;
  if (state.settlements.some((s) => hexEquals(s.hex, h))) return false;
  return !state.threats.some((t) => hexEquals(t.hex, h));
};

/** An active guardian standing on a hex escorts everyone within 1 of it. */
export const isEscorted = (state: GameStateView, h: Hex): boolean =>
  state.characters.some(
    (g) =>
      g.status === 'active' &&
      g.at.kind === 'hex' &&
      roleHas(g, ESCORT_TAG) &&
      hexDistance(g.at.hex, h) <= 1,
  );

/**
 * The characters a threat on `at` strikes: every active one on a hex within 1
 * of it (not on the creature's footprint), unless a guardian or escorted. Riders
 * are never struck.
 */
export const struckBy = (state: GameStateView, at: Hex): Character[] =>
  state.characters.filter(
    (c) =>
      c.status === 'active' &&
      c.at.kind === 'hex' &&
      !isCreatureHex(state, c.at.hex) &&
      hexDistance(c.at.hex, at) <= 1 &&
      !roleHas(c, ESCORT_TAG) &&
      !isEscorted(state, c.at.hex),
  );

/** How much the creature's defenders take off each strike: per defender still riding. */
export const defence = (state: GameStateView): number =>
  state.creature.defenders.filter((id) => {
    const c = state.characters.find((x) => x.id === id);
    return c?.status === 'active' && c.at.kind === 'creature';
  }).length * state.config.defendReduction;

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
export const threatNextPath = (state: GameStateView, threatId: string): Hex[] => {
  const threat = state.threats.find((t) => t.id === threatId);
  return threat ? threatPath(state, threat, nextCentreGuess(state)) : [];
};

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
  const contact = contactDistance(state);
  const { heading } = state.creature;
  // Far enough to settle any threat: it either closes in, falls out of the window or stalls.
  const horizon = 4 * (state.config.windowRadius + 1);
  return state.threats.map((threat) => {
    let centre = nextCentreGuess(state);
    let at = threat.hex;
    let next: Hex | null = null;
    let arrives: Arrival = 'never';
    for (let tick = 1; tick <= horizon; tick++) {
      const path = threatPath(state, { ...threat, hex: at }, centre);
      if (tick === 1) next = path[0] ?? null;
      at = path.at(-1) ?? at;
      if (hexDistance(at, centre) <= contact) {
        arrives = tick === 1 ? 'tomorrow' : 'later';
        break;
      }
      if (hexDistance(at, centre) > state.config.windowRadius) break;
      centre = neighbour(centre, heading);
    }
    return { id: threat.id, arrives, next };
  });
};
