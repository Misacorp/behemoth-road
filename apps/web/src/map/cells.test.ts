import { createGame, hexKey, nextDay } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { TERRAIN_LOOKS } from '@behemoth-road/art';
import { TERRAIN_TYPES } from '@behemoth-road/core';
import { cellStateAt, creatureArt, sceneCells } from './cells.ts';
import { MAP_TUNING } from './config.ts';

describe('scene cells', () => {
  const s = createGame(1, { characterIds: ['you'] });

  it('draw the window, and blank paper a few rings beyond', () => {
    const r = s.config.windowRadius + MAP_TUNING.paperRings;
    const cells = sceneCells(s);
    expect(cells).toHaveLength(1 + 3 * r * (r + 1));
    // The window: explored ground clear, the rest under the veil.
    const inWindow = cells.filter((c) => c.state === 'seen' || c.state === 'unexplored');
    expect(inWindow).toHaveLength(1 + 3 * s.config.windowRadius * (s.config.windowRadius + 1));
    for (const c of inWindow) {
      expect(c.state).toBe(s.tiles[`${c.q},${c.r}`]!.explored ? 'seen' : 'unexplored');
    }
    for (const c of cells.filter((x) => x.state === 'unseen')) expect(c.terrain).toBe('unknown');
  });

  it('show tiles that left the window as fading, then lost', () => {
    const next = nextDay(s);
    const fading = Object.keys(next.tiles).filter((k) => cellStateAt(next, k) === 'fading');
    expect(fading.length).toBeGreaterThan(0);
    const later = nextDay(next);
    expect(fading.some((k) => cellStateAt(later, k) === 'lost')).toBe(true);
    expect(cellStateAt(s, hexKey({ q: 99, r: 99 }))).toBe('unseen');
  });

  it('find an art look for every core terrain id, and face the creature by its heading', () => {
    for (const t of TERRAIN_TYPES) expect(TERRAIN_LOOKS[t.id], t.id).toBeDefined();
    expect(creatureArt(createGame(1, { heading: 'nw' })).heading).toEqual({ q: -1, r: 0 });
    expect(creatureArt(createGame(1, { heading: 'n' })).heading).toEqual({ q: 0, r: -1 });
  });
});
