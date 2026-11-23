/**
 * What the art kit draws for a game state: which hexes, in which fog state, with which terrain look.
 * Reads the core only; the core never learns about the screen.
 */
import type { ArtCell, CellState, FeatureArt, CharacterArt, CreatureArt } from '@behemoth-road/art';
import { GENTLE_AMBLER } from '@behemoth-road/art';
import {
  type CreatureSigns,
  featureType,
  STIMULUS_TYPES,
  directionOffset,
  type GameStateView,
  terrainOf,
  hexDistance,
  hexesInRange,
  hexKey,
  placeHex,
} from '@behemoth-road/core';
import { accentOf, lookOf } from '../game/identity.ts';
import { actingStance, stanceIcon } from '../game/stances.ts';
import { escortedIds, settlementInfo, struckToday, threatMarks } from '../game/season.ts';
import { MAP_TUNING } from './config.ts';

/** The fog state of a hex: hidden is blank paper, a seen hex outside the window is fading. */
export function cellStateAt(state: GameStateView, key: string): CellState {
  const tile = state.tiles[key];
  if (!tile) return 'unseen';
  if (tile.visibility === 'lost') return 'lost';
  if (tile.leftWindowOnDay !== null) return 'fading';
  // In the window: under the veil until someone enters or surveys it.
  return tile.explored ? 'seen' : 'unexplored';
}

/** Whether the terrain of a hex in this state is known to the player (drawn, named on its card). */
export const terrainKnown = (s: CellState): boolean =>
  s === 'seen' || s === 'unexplored' || s === 'fading';

/**
 * The hexes to draw: the window and its fading edge, blank paper a few rings beyond, and lost tiles near
 * the creature or under a character (so a lost character still stands somewhere).
 */
export function sceneCells(
  state: GameStateView,
  glints: readonly { readonly q: number; readonly r: number }[] = [],
): ArtCell[] {
  const { centre } = state.creature;
  const outer = state.config.windowRadius + MAP_TUNING.paperRings;
  const lostLimit = state.config.windowRadius + MAP_TUNING.lostRings;
  const keys = new Map<string, { q: number; r: number }>();
  for (const h of hexesInRange(centre, outer)) keys.set(hexKey(h), h);
  for (const [key, tile] of Object.entries(state.tiles)) {
    if (keys.has(key)) continue;
    const [q, r] = key.split(',').map(Number) as [number, number];
    if (tile.visibility === 'seen' || hexDistance({ q, r }, centre) <= lostLimit) {
      keys.set(key, { q, r });
    }
  }
  for (const c of state.characters) if (c.at.kind === 'hex') keys.set(hexKey(c.at.hex), c.at.hex);
  const fires = fireKeys(state);
  for (const s of state.stimuli) if (fires.has(hexKey(s.hex))) keys.set(hexKey(s.hex), s.hex);
  // Threats and settlements are public: drawn wherever they are, also under the veil.
  const threats = new Map(threatMarks(state).map((t) => [hexKey(t.hex), t]));
  const settlements = new Map(state.settlements.map((s) => [hexKey(s.hex), s.id]));
  for (const t of state.threats) keys.set(hexKey(t.hex), t.hex);
  for (const s of state.settlements) keys.set(hexKey(s.hex), s.hex);

  // The viewer's own glints (the scout's skill): a hint mark on hexes that hold something, never what.
  const glinting = new Set(glints.map(hexKey));
  for (const g of glints) keys.set(hexKey(g), g);
  const cells: ArtCell[] = [];
  for (const [key, h] of keys) {
    const cellState = cellStateAt(state, key);
    const known = terrainKnown(cellState);
    const feature = known ? featureArtAt(state, key) : null;
    const threat = threats.get(key);
    const settlementId = settlements.get(key);
    const settlement = settlementId ? settlementInfo(state, settlementId) : null;
    cells.push({
      q: h.q,
      r: h.r,
      state: cellState,
      terrain: known ? (terrainOf(state, h)?.id ?? 'unknown') : 'unknown',
      ...(feature ? { feature } : {}),
      ...(glinting.has(key) ? { hint: true } : {}),
      // A lit fire shows to everyone, also under the veil and on paper never seen.
      ...(fires.has(key) ? { fire: true } : {}),
      ...(threat
        ? {
            threat: {
              look: threat.icon,
              strength: threat.strength,
              toward: threat.next ? { q: threat.next.q - h.q, r: threat.next.r - h.r } : null,
              arrivesTomorrow: threat.arrives === 'tomorrow',
            },
          }
        : {}),
      ...(settlement
        ? {
            settlement: {
              look: settlement.look,
              attitude: settlement.attitude,
              favour: settlement.favour,
              favourNeeded: settlement.needed,
            },
          }
        : {}),
    });
  }
  return cells;
}

/** A revealed feature's drawing: its content icon key, and used up once nothing is left. */
export function featureArtAt(state: GameStateView, key: string): FeatureArt | null {
  const f = state.features[key];
  if (!f?.revealed) return null;
  let type;
  try {
    type = featureType(f.type);
  } catch {
    return { look: f.type };
  }
  if (type.kind === 'trap') return { look: type.icon, trap: true };
  if (f.left > 0) return { look: type.icon };
  return { look: type.icon, state: type.kind === 'node' ? 'depleted' : 'spent' };
}

/** Stimulus content ids that draw as a fire: read by the `fire` tag, never by id. */
const FIRE_TYPES: ReadonlySet<string> = new Set(
  STIMULUS_TYPES.filter((t) => t.tags.includes('fire')).map((t) => t.id),
);

/** The hexes where a fire burns (the view's stimuli tagged `fire`; unknown types are left out). */
export function fireKeys(state: GameStateView): Set<string> {
  return new Set(state.stimuli.filter((s) => FIRE_TYPES.has(s.type)).map((s) => hexKey(s.hex)));
}

/**
 * The creature as the art kit draws it for one viewer: lying down while it lingers (public), and the
 * viewer's own signs (`PlayerView.signs`): the appetite as they see it (faint for a non-keeper) and, for a
 * keeper, the reaction cues. Without signs (a card that shows only the public creature) it is plain.
 */
export function creatureArt(state: GameStateView, signs: CreatureSigns | null = null): CreatureArt {
  return {
    pose: state.creature.lingering ? 'lying' : 'standing',
    appetite: signs?.appetite ?? null,
    cues: (signs?.cues ?? []).map((c) => ({ hex: c.hex, reaction: c.reaction })),
    q: state.creature.centre.q,
    r: state.creature.centre.r,
    heading: directionOffset(state.creature.heading),
    look: GENTLE_AMBLER,
    // The team stores, as crates on its back.
    stores: Object.values(state.stores).reduce((a, n) => a + n, 0),
    // Guardians defending it: a ring and shields on the map, for every player.
    defenders: state.creature.defenders.length,
  };
}

/** Active characters for the scene, in character order; riders stand at the creature's centre. */
export function characterArts(
  state: GameStateView,
  which: 'all' | 'riders' | 'walkers' = 'all',
): CharacterArt[] {
  const escorted = escortedIds(state);
  const defenders = new Set(state.creature.defenders);
  return state.characters
    .filter((c) => c.status === 'active')
    .filter((c) => which === 'all' || (c.at.kind === 'creature') === (which === 'riders'))
    .map((c) => {
      const at = placeHex(state, c.at);
      const look = lookOf(c.id);
      const acting = actingStance(state, c);
      // The day's signs: a shield beside a guardian, a bandage once struck, a shield raised in defence.
      const marks = {
        ...(escorted.has(c.id) ? { escorted: true } : {}),
        ...(struckToday(c, state.day) ? { struck: true } : {}),
        ...(c.at.kind === 'creature' && defenders.has(c.id) ? { defending: true } : {}),
        // The stance doing something with the spare actions (never rest), and an ended day.
        ...(acting ? { stance: stanceIcon(acting) } : {}),
        ...(c.waiting ? { waiting: true } : {}),
      };
      return {
        id: c.id,
        q: at.q,
        r: at.r,
        accent: accentOf(c.id, MAP_TUNING.accent),
        ...(look ? { look } : {}),
        ...(Object.keys(marks).length > 0 ? { marks } : {}),
      };
    });
}
