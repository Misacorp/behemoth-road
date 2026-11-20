/**
 * What the art kit draws for a game state: which hexes, in which fog state, with which terrain look.
 * Reads the core only; the core never learns about the screen.
 */
import type { ArtCell, CellState, FeatureArt, CharacterArt, CreatureArt } from '@behemoth-road/art';
import { GENTLE_AMBLER } from '@behemoth-road/art';
import {
  featureType,
  directionOffset,
  type GameStateView,
  terrainOf,
  hexDistance,
  hexesInRange,
  hexKey,
  placeHex,
} from '@behemoth-road/core';
import { accentOf, lookOf } from '../game/identity.ts';
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
export function sceneCells(state: GameStateView): ArtCell[] {
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

  const cells: ArtCell[] = [];
  for (const [key, h] of keys) {
    const cellState = cellStateAt(state, key);
    const known = terrainKnown(cellState);
    const feature = known ? featureArtAt(state, key) : null;
    cells.push({
      q: h.q,
      r: h.r,
      state: cellState,
      terrain: known ? (terrainOf(state, h)?.id ?? 'unknown') : 'unknown',
      ...(feature ? { feature } : {}),
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
  if (f.left > 0 || type.kind === 'trap') return { look: type.icon };
  return { look: type.icon, state: type.kind === 'node' ? 'depleted' : 'spent' };
}

export function creatureArt(state: GameStateView): CreatureArt {
  return {
    q: state.creature.centre.q,
    r: state.creature.centre.r,
    heading: directionOffset(state.creature.heading),
    look: GENTLE_AMBLER,
    // The team stores, as crates on its back.
    stores: Object.values(state.stores).reduce((a, n) => a + n, 0),
  };
}

/** Active characters for the scene, in character order; riders stand at the creature's centre. */
export function characterArts(
  state: GameStateView,
  which: 'all' | 'riders' | 'walkers' = 'all',
): CharacterArt[] {
  return state.characters
    .filter((c) => c.status === 'active')
    .filter((c) => which === 'all' || (c.at.kind === 'creature') === (which === 'riders'))
    .map((c) => {
      const at = placeHex(state, c.at);
      const look = lookOf(c.id);
      return {
        id: c.id,
        q: at.q,
        r: at.r,
        accent: accentOf(c.id, MAP_TUNING.accent),
        ...(look ? { look } : {}),
      };
    });
}
