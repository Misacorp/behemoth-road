import { createGame, hexKey, nextDay } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { cellStateAt, facingFor, lookFor, sceneCells } from './cells.ts';
import { MAP_TUNING } from './config.ts';

describe('scene cells', () => {
  const s = createGame(1, { characterIds: ['you'] });

  it('draw the window, and blank paper a few rings beyond', () => {
    const r = s.config.windowRadius + MAP_TUNING.paperRings;
    const cells = sceneCells(s);
    expect(cells).toHaveLength(1 + 3 * r * (r + 1));
    expect(cells.filter((c) => c.state === 'seen')).toHaveLength(
      1 + 3 * s.config.windowRadius * (s.config.windowRadius + 1),
    );
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

  it('map core terrain to art looks and headings to facing', () => {
    expect(lookFor('plains')).toBe('meadow');
    expect(lookFor('cliff')).toBe('cliff');
    expect(facingFor('nw')).toBe('left');
    expect(facingFor('n')).toBe('right');
  });
});
