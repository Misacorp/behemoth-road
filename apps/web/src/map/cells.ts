/**
 * What the art kit draws for a game state: which hexes, in which fog state, with which terrain look.
 * Reads the core only; the core never learns about the screen.
 */
import type { ArtCell, CellState, CharacterArt, CreatureArt } from '@behemoth-road/art';
import { GENTLE_AMBLER } from '@behemoth-road/art';
import {
  directionOffset,
  type GameState,
  hexDistance,
  hexesInRange,
  hexKey,
  terrainIdAt,
} from '@behemoth-road/core';
import { MAP_TUNING } from './config.ts';

/** The fog state of a hex: hidden is blank paper, a seen hex outside the window is fading. */
export function cellStateAt(state: GameState, key: string): CellState {
  const tile = state.tiles[key];
  if (!tile) return 'unseen';
  if (tile.visibility === 'lost') return 'lost';
  return tile.leftWindowOnDay === null ? 'seen' : 'fading';
}

/**
 * The hexes to draw: the window and its fading edge, blank paper a few rings beyond, and lost tiles near
 * the creature or under a character (so a lost character still stands somewhere).
 */
export function sceneCells(state: GameState): ArtCell[] {
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
  for (const c of state.characters) keys.set(hexKey(c.position), c.position);

  const cells: ArtCell[] = [];
  for (const [key, h] of keys) {
    const cellState = cellStateAt(state, key);
    const known = cellState === 'seen' || cellState === 'fading';
    cells.push({
      q: h.q,
      r: h.r,
      state: cellState,
      terrain: known ? terrainIdAt(state.seed, h) : 'unknown',
    });
  }
  return cells;
}

export function creatureArt(state: GameState): CreatureArt {
  return {
    q: state.creature.centre.q,
    r: state.creature.centre.r,
    heading: directionOffset(state.creature.heading),
    look: GENTLE_AMBLER,
  };
}

/** Active characters stand in the scene; lost ones are drawn by the overlays. */
export function characterArts(state: GameState): CharacterArt[] {
  return state.characters
    .filter((c) => c.status === 'active')
    .map((c) => ({ id: c.id, q: c.position.q, r: c.position.r, accent: MAP_TUNING.accent }));
}
