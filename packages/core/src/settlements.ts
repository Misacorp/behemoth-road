/**
 * Settlements of the peoples along the road. The route places them, not chance:
 * one appears at the window's leading edge when the creature's steps reach
 * `settlementFirst`, then every `settlementEvery` steps. People types are
 * content, read by their tags and properties, never by id.
 */

import { PEOPLE_TYPES, type PeopleType } from './content/index.ts';
import { type Hex, hexEquals, hexKey, neighbours } from './hex.ts';
import { terrainOf } from './map.ts';
import { hashString, hashToUnit } from './random.ts';
import type { GameState, GameStateView, Settlement, Threat } from './state.ts';
import { leadingEdge, threatStrength, threatType } from './threats.ts';
import type { GameEvent } from './features.ts';

/** The role tag of an envoy: parleys for more, and without risk. */
export const PEOPLES_TAG = 'peoples';
/** The material tag a settlement takes as an offering. */
export const TRADE_TAG = 'trade';
/** Terrain tags a settlement is never placed on. */
const NOT_ON = ['water', 'steep'];

const SETTLEMENT_STREAM = hashString('settlement');

export const peopleType = (id: string): PeopleType => {
  const type = PEOPLE_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`Unknown people: ${id}`);
  return type;
};

/** The settlement on a hex, if any. */
export const settlementAt = (state: GameStateView, h: Hex): Settlement | undefined =>
  state.settlements.find((s) => hexEquals(s.hex, h));

/** Whether a settlement is due at a tick that brought the creature's steps to `steps`. */
export const settlementDue = (state: GameStateView, steps: number): boolean => {
  const { settlementFirst, settlementEvery } = state.config;
  return steps >= settlementFirst && (steps - settlementFirst) % settlementEvery === 0;
};

/**
 * Where a new settlement may stand: the leading edge's hexes that are known,
 * not water or steep, and hold no feature (hidden or not), a settlement or a threat.
 */
export const settlementSpots = (state: GameState): Hex[] =>
  leadingEdge(state).filter((h) => {
    const terrain = terrainOf(state, h);
    if (!terrain || NOT_ON.some((tag) => terrain.tags.includes(tag))) return false;
    if (state.features[hexKey(h)] || settlementAt(state, h)) return false;
    return !state.threats.some((t) => hexEquals(t.hex, h));
  });

/** Whether a people settles on a hex: its terrain or a neighbour's has one of the people's `near` tags. */
const fitsPeople = (state: GameState, people: PeopleType, h: Hex): boolean => {
  if (!people.near) return true;
  const tags = [h, ...neighbours(h)].flatMap((x) => terrainOf(state, x)?.tags ?? []);
  return people.near.some((tag) => tags.includes(tag));
};

/**
 * A new settlement at a seeded spot (seed, day), of a seeded people, or null if
 * no spot fits. Its id comes from the day it appears (at most one a day).
 */
export const placeSettlement = (state: GameState): Settlement | null => {
  const spots = settlementSpots(state);
  if (spots.length === 0 || PEOPLE_TYPES.length === 0) return null;
  // A people with a `near` condition is only a candidate when a spot fits it.
  const candidates = PEOPLE_TYPES.filter((p) => spots.some((h) => fitsPeople(state, p, h)));
  const type =
    candidates[
      Math.floor(hashToUnit(state.seed, SETTLEMENT_STREAM, state.day, 1) * candidates.length)
    ];
  if (!type) return null;
  const fitting = spots.filter((h) => fitsPeople(state, type, h));
  const hex =
    fitting[Math.floor(hashToUnit(state.seed, SETTLEMENT_STREAM, state.day) * fitting.length)];
  if (!hex) return null;
  return { id: `s${state.day}`, type: type.id, hex, attitude: 'wary', favour: 0, boon: null };
};

/** Keeps the settlements whose hex is still in play (seen); the rest are lost to the fog. */
export const keepSettlements = (state: GameStateView): Settlement[] =>
  state.settlements.filter((s) => state.tiles[hexKey(s.hex)]?.visibility === 'seen');

/**
 * A settlement turns angry for good and sends its people's threat from its hex
 * at once (strength scaled as for any threat).
 */
export const anger = <S extends GameStateView>(
  state: S,
  settlement: Settlement,
): { readonly state: S; readonly events: GameEvent[] } => {
  const type = threatType(peopleType(settlement.type).angryThreat);
  const threat: Threat = {
    id: `t${settlement.id}`,
    type: type.id,
    hex: settlement.hex,
    strength: threatStrength(state, type, state.day),
    appearedDay: state.day,
  };
  return {
    state: {
      ...state,
      settlements: state.settlements.map((s) =>
        s.id === settlement.id ? { ...s, attitude: 'angry' as const } : s,
      ),
      threats: [...state.threats, threat],
    },
    events: [
      { kind: 'angered', id: settlement.id },
      { kind: 'threat-appears', id: threat.id, type: threat.type, hex: threat.hex },
    ],
  };
};

/** Adds favour; at the people's `favourNeeded` the settlement turns friendly. */
export const addFavour = <S extends GameStateView>(
  state: S,
  settlement: Settlement,
  favour: number,
): { readonly state: S; readonly favour: number; readonly befriended: boolean } => {
  const total = settlement.favour + favour;
  const befriended = total >= peopleType(settlement.type).favourNeeded;
  return {
    state: {
      ...state,
      settlements: state.settlements.map((s) =>
        s.id === settlement.id
          ? { ...s, favour: total, attitude: befriended ? ('friendly' as const) : s.attitude }
          : s,
      ),
    },
    favour: total,
    befriended,
  };
};
