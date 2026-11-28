/**
 * Lures: small animals (content `LURE_TYPES`) that stand near the route and act on the creature's step like
 * a fire does, for as long as they are on the map. A character on or next to one can lead it a hex; each
 * lure can be led `lureLeads` times, then it settles (it stays put and still acts). A lure the creature's
 * footprint reaches flees: it is gone. Map generation places them along the route as the creature walks,
 * about one every `lureSpacing` hexes, never on water. Rules read tags and properties, never ids.
 */

import { LURE_TYPES } from './content/index.ts';
import type { TuningConfig } from './config.ts';
import { lureType } from './care.ts';
import type { GameEvent } from './features.ts';
import {
  type Direction,
  type Hex,
  hexDistance,
  hexEquals,
  hexKey,
  neighbour,
  rotate,
} from './hex.ts';
import { inDestination } from './destination.ts';
import { inHazardPlan } from './hazards.ts';
import { terrainById, terrainOf } from './map.ts';
import { hashString, hashToUnit, type Seed } from './random.ts';
import type { Creature, GameState, GameStateView, HazardPatch, Lure } from './state.ts';
import { isReachable } from './window.ts';

const LURE_STREAM = hashString('lure');

/** The lure type tag every lure carries. */
export const LURE_TAG = 'lure';

/** How many hexes along the route from the start lure `k` stands: the first within `lureFirstWithin`, then about `lureSpacing` apart. */
export const lureRoutePosition = (
  seed: Seed,
  config: Pick<TuningConfig, 'lureFirstWithin' | 'lureSpacing' | 'lureJitter'>,
  k: number,
): number => {
  if (k === 0) return config.lureFirstWithin;
  const j = config.lureJitter;
  const jitter = Math.floor(hashToUnit(seed, LURE_STREAM, k, 0) * (2 * j + 1)) - j;
  return config.lureFirstWithin + k * config.lureSpacing + jitter;
};

/** Whether a hex is somewhere a lure may stand: seen ground it can walk on, not water, not taken. */
const holdsLure = (
  state: GameStateView,
  h: Hex,
  tags: readonly string[],
  plan: readonly HazardPatch[],
): boolean => {
  const terrain = terrainOf(state, h);
  if (!terrain || !terrain.passable || !isReachable(state, h)) return false;
  if (tags.some((tag) => terrain.tags.includes(tag))) return false;
  if (
    hexDistance(h, state.creature.centre) <=
    state.config.creatureRadius + state.config.lureKeepOut
  )
    return false;
  return (
    !state.lures.some((l) => hexEquals(l.hex, h)) &&
    !state.threats.some((t) => hexEquals(t.hex, h)) &&
    !state.settlements.some((s) => hexEquals(s.hex, h)) &&
    !inHazardPlan(plan, h) &&
    !inDestination(state.destination, h) &&
    !(state.features[hexKey(h)]?.revealed ?? false)
  );
};

/**
 * Places every lure now due: lure `k` comes into the window, a few hexes ahead of the creature and one to
 * three hexes beside its heading's line (a seeded side), once the creature's steps bring its route
 * position within reach of the window. The nearest fitting hex is used; when none fits the lure is
 * skipped. Reads the state after the window update (tiles in view); braziers are not built on.
 */
export const placeLures = (
  state: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } => {
  const { config, creature, seed } = state;
  let lures = state.lures;
  let count = state.lureCount;
  const reach = config.windowRadius - 1;
  for (;;) {
    const ahead = lureRoutePosition(seed, config, count) - creature.steps;
    if (ahead > reach) break;
    const k = count;
    count++;
    const type = LURE_TYPES[Math.floor(hashToUnit(seed, LURE_STREAM, k, 3) * LURE_TYPES.length)];
    if (!type) break;
    const d = Math.max(config.creatureRadius + config.lureAheadMin, ahead);
    const side: -1 | 1 = hashToUnit(seed, LURE_STREAM, k, 1) < 0.5 ? -1 : 1;
    const span = config.lureWideMax - config.lureWideMin + 1;
    const wide = config.lureWideMin + Math.floor(hashToUnit(seed, LURE_STREAM, k, 2) * span);
    const tries: Hex[] = [];
    // A hex to one side of the line `d` ahead, or a hex nearer or further along it, or on it.
    for (const dd of [d, d + 1, d - 1]) {
      let along = creature.centre;
      for (let i = 0; i < dd; i++) along = neighbour(along, creature.heading);
      for (const dir of [side, -side] as const) {
        for (let w = wide; w >= 1; w--) {
          let h = along;
          for (let i = 0; i < w; i++) h = neighbour(h, rotate(creature.heading, dir * 2));
          tries.push(h);
        }
      }
      tries.push(along);
    }
    const staged: GameState = { ...state, lures };
    const hex = tries.find(
      (h) =>
        hexDistance(h, creature.centre) <= config.windowRadius &&
        holdsLure(staged, h, type.notOn, state.hazardPlan),
    );
    if (hex) {
      lures = [...lures, { id: `l${k + 1}`, type: type.id, hex, leadsLeft: config.lureLeads }];
    }
  }
  if (lures === state.lures && count === state.lureCount) return { state, events: [] };
  return { state: { ...state, lures, lureCount: count }, events: [] };
};

/**
 * What the tick does to the lures after the creature's step: those its footprint reached flee (gone, with
 * an event), and those left behind out of the window drop off the map quietly.
 */
export const keepLures = (
  state: GameState,
  creature: Pick<Creature, 'centre'>,
): { readonly lures: Lure[]; readonly events: GameEvent[] } => {
  const events: GameEvent[] = [];
  const lures: Lure[] = [];
  for (const l of state.lures) {
    if (hexDistance(creature.centre, l.hex) <= state.config.creatureRadius) {
      events.push({ kind: 'lure-fled', id: l.id, hex: l.hex });
    } else if (hexDistance(creature.centre, l.hex) <= state.config.windowRadius) lures.push(l);
  }
  return { lures, events };
};

/** The neighbour of a lure's hex in a direction. */
export const ledTo = (lure: Lure, direction: Direction): Hex => neighbour(lure.hex, direction);

/** Whether a lure can be led onto a hex: seen, passable ground it may stand on, and not under the creature or taken. */
export const canLeadOnto = (state: GameStateView, lure: Lure, h: Hex): boolean => {
  const terrain = state.tiles[hexKey(h)]
    ? terrainById(state.tiles[hexKey(h)]?.terrain as string)
    : null;
  if (!terrain || !terrain.passable || !isReachable(state, h)) return false;
  if (lureType(lure.type).notOn.some((tag) => terrain.tags.includes(tag))) return false;
  if (hexDistance(h, state.creature.centre) <= state.config.creatureRadius) return false;
  return (
    !state.lures.some((l) => hexEquals(l.hex, h)) &&
    !state.threats.some((t) => hexEquals(t.hex, h)) &&
    !state.settlements.some((s) => hexEquals(s.hex, h)) &&
    !inDestination(state.destination, h) &&
    !(state.features[hexKey(h)]?.revealed ?? false)
  );
};
