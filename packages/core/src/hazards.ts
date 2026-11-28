/**
 * Hazards across the route. As the creature walks, map generation lays hazard patches (content
 * `HAZARD_TYPES`) ahead of it, across the straight line of its heading: about one every `hazardSpacing`
 * hexes, none within `hazardFirst` of the start. A patch is terrain that harms a creature stepping onto it
 * (`perilOnStep`: a poisoned lake, a glass waste) or a cluster of rockslides laid together (a scree field).
 * Walking straight in means harm; steering a hex or two aside avoids it.
 *
 * Patches are laid lazily and seeded (a pure function of the seed, the creature's steps and heading, and
 * what is already known; never in the destination), beyond the window, so the terrain shows as the tiles come into view and a
 * cluster's threats appear (public, with the usual threat visibility) once the patch is within reach.
 * Server only; the plan never leaves it. Rules read tags and properties, never ids.
 */

import { HAZARD_TYPES, type HazardType, THREAT_TYPES } from './content/index.ts';
import type { TuningConfig } from './config.ts';
import type { GameEvent } from './features.ts';
import {
  type Hex,
  hexDistance,
  hexEquals,
  hexKey,
  hexesInRange,
  neighbour,
  rotate,
} from './hex.ts';
import { type Destination, inDestination } from './destination.ts';
import { hazardTerrainAt, terrainById, terrainIdAt } from './map.ts';
import { hashString, hashToUnit, pickWeighted, type Seed } from './random.ts';
import type { Creature, GameState, HazardPatch, Threat, TileKnowledge } from './state.ts';
import { threatStrength, threatType } from './threats.ts';

const HAZARD_STREAM = hashString('hazard');

/** Terrain tags a hazard never replaces (water, cliffs and the islands inside lakes). */
const KEEP_TAGS = ['water', 'steep', 'island'];

export const hazardType = (id: string): HazardType => {
  const type = HAZARD_TYPES.find((t) => t.id === id);
  if (!type) throw new Error(`Unknown hazard: ${id}`);
  return type;
};

/** How far ahead of the creature's centre a patch is laid. */
export const hazardLookahead = (
  config: Pick<TuningConfig, 'windowRadius' | 'hazardLookaheadBeyond'>,
): number => config.windowRadius + config.hazardLookaheadBeyond;

/**
 * How many hexes along the route from the start the centre of patch `k` lies: the first
 * `hazardFirst + hazardFirstOffset` out (its edge, up to two hexes off its centre, is then past `hazardFirst`), then
 * about `hazardSpacing` further each, a seeded hex either way.
 */
export const hazardRoutePosition = (
  seed: Seed,
  config: Pick<
    TuningConfig,
    'hazardFirst' | 'hazardSpacing' | 'hazardFirstOffset' | 'hazardJitter'
  >,
  k: number,
): number => {
  const j = config.hazardJitter;
  const jitter = Math.floor(hashToUnit(seed, HAZARD_STREAM, k, 0) * (2 * j + 1)) - j;
  const base = config.hazardFirst + config.hazardFirstOffset + k * config.hazardSpacing;
  return base + (k === 0 ? Math.max(0, jitter) : jitter);
};

/** Whether any patch has a say about a hex (terrain or a cluster's threat). */
export const inHazardPlan = (plan: readonly HazardPatch[], h: Hex): boolean =>
  hazardTerrainAt(plan, h) !== null || plan.some((p) => p.threats.some((t) => hexEquals(t, h)));

/** Hexes a hazard may be laid on: ground a character could stand on, never water, cliff or island. */
const layable = (seed: Seed, h: Hex): boolean => {
  const terrain = terrainById(terrainIdAt(seed, h));
  return terrain.passable && !KEEP_TAGS.some((tag) => terrain.tags.includes(tag));
};

const between = (u: number, [lo, hi]: readonly [number, number]): number =>
  lo + Math.min(hi - lo, Math.floor(u * (hi - lo + 1)));

/** One patch: its kind, size and hexes, from the seed. Hexes already in view are left out. */
const makePatch = (
  seed: Seed,
  k: number,
  centre: Hex,
  tiles: Readonly<Record<string, TileKnowledge>>,
  braziers: readonly Hex[],
  keepOut: (h: Hex) => boolean,
): HazardPatch => {
  const type = pickWeighted(HAZARD_TYPES, (t) => t.weight, hashToUnit(seed, HAZARD_STREAM, k, 1));
  const radius = between(hashToUnit(seed, HAZARD_STREAM, k, 2), type.radius);
  const free = hexesInRange(centre, radius).filter(
    (h) =>
      !tiles[hexKey(h)] &&
      !keepOut(h) &&
      !braziers.some((b) => hexEquals(b, h)) &&
      layable(seed, h),
  );
  const id = `h${k + 1}`;
  if (type.cluster) {
    const count = between(hashToUnit(seed, HAZARD_STREAM, k, 3), type.cluster.count);
    const picked = free
      .map((h) => ({ h, u: hashToUnit(seed, HAZARD_STREAM, k, 4, h.q, h.r) }))
      .sort((a, b) => a.u - b.u)
      .slice(0, count)
      .map((x) => x.h);
    return { id, type: type.id, centre, hexes: [], threats: picked, spawned: false };
  }
  const hexes = free.filter(
    (h) =>
      hexEquals(h, centre) ||
      hexDistance(h, centre) < radius ||
      hashToUnit(seed, HAZARD_STREAM, k, 5, h.q, h.r) >= type.ragged,
  );
  return { id, type: type.id, centre, hexes, threats: [], spawned: false };
};

/**
 * The plan with every patch now due added: patch `k` is laid, `hazardLookahead` hexes ahead of the
 * creature along its heading (a hex to one side now and then), once the creature's steps bring its route
 * position within that. Pure; the same plan back when nothing is due.
 */
export const extendHazards = (
  seed: Seed,
  config: TuningConfig,
  creature: Pick<Creature, 'centre' | 'heading' | 'steps'>,
  tiles: Readonly<Record<string, TileKnowledge>>,
  braziers: readonly Hex[],
  plan: readonly HazardPatch[],
  destination?: Destination,
): readonly HazardPatch[] => {
  const keepOut = (h: Hex): boolean => destination !== undefined && inDestination(destination, h);
  const ahead = hazardLookahead(config);
  let next = plan;
  for (;;) {
    const k = next.length;
    if (hazardRoutePosition(seed, config, k) - creature.steps > ahead) return next;
    let centre = creature.centre;
    for (let i = 0; i < ahead; i++) centre = neighbour(centre, creature.heading);
    // Across the line: now and then a hex to one side, so a patch is not always dead centre.
    if (hashToUnit(seed, HAZARD_STREAM, k, 6) < config.hazardSideChance) {
      const side = hashToUnit(seed, HAZARD_STREAM, k, 7) < 0.5 ? -1 : 1;
      centre = neighbour(centre, rotate(creature.heading, side));
    }
    next = [...next, makePatch(seed, k, centre, tiles, braziers, keepOut)];
  }
};

/**
 * Lays the rockslides of every scree-like patch (a cluster) that has come within reach of the creature
 * (its centre within `windowRadius - 1`, so the whole patch stands in the window). They are public threats
 * from then on, tagged with their patch. Hexes taken by a settlement, a threat or the creature are skipped.
 */
export const spawnClusters = (
  state: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } => {
  const { creature, config } = state;
  const events: GameEvent[] = [];
  const threats: Threat[] = [...state.threats];
  const plan = state.hazardPlan.map((patch) => {
    const type = hazardType(patch.type);
    if (patch.spawned || !type.cluster) return patch;
    if (hexDistance(patch.centre, creature.centre) > config.windowRadius - 1) return patch;
    const threat = THREAT_TYPES.find((t) => t.id === type.cluster?.threat);
    if (!threat) return { ...patch, spawned: true };
    patch.threats.forEach((hex, i) => {
      const taken =
        hexDistance(hex, creature.centre) <= config.creatureRadius ||
        state.settlements.some((s) => hexEquals(s.hex, hex)) ||
        threats.some((t) => hexEquals(t.hex, hex));
      if (taken) return;
      const laid: Threat = {
        id: `${patch.id}-${i + 1}`,
        type: threat.id,
        hex,
        strength: threatStrength(state, threatType(threat.id), state.day),
        appearedDay: state.day,
        patch: patch.id,
      };
      threats.push(laid);
      events.push({ kind: 'threat-appears', id: laid.id, type: laid.type, hex });
    });
    return { ...patch, spawned: true };
  });
  if (events.length === 0 && plan.every((p, i) => p === state.hazardPlan[i])) {
    return { state, events };
  }
  return { state: { ...state, hazardPlan: plan, threats }, events };
};

/** The peril a creature takes for a step ending on a hex of known terrain, and that terrain's id (null: none). */
export const stepPeril = (
  tiles: Readonly<Record<string, TileKnowledge>>,
  h: Hex,
): { readonly terrain: string; readonly amount: number } | null => {
  const id = tiles[hexKey(h)]?.terrain;
  if (!id) return null;
  const amount = terrainById(id).perilOnStep ?? 0;
  return amount > 0 ? { terrain: id, amount } : null;
};
