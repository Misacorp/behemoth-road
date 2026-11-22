import { hasIcon } from '@behemoth-road/art';
import { THREAT_TYPES } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { TIP_TABLE } from '../text/tips.ts';
import { perilBreakdown } from './perilBreakdown.ts';

describe('the peril breakdown model', () => {
  it('lists the sources that added peril, biggest first, with the total', () => {
    const b = perilBreakdown({
      added: { hunger: 2, 'threat:captors': 4, 'threat:swarm': 1 },
      eased: { calm: 3, shelter: 3 },
      held: 2,
    });
    expect(b.added.map((r) => [r.source, r.amount])).toEqual([
      ['threat:captors', 4],
      ['hunger', 2],
      ['threat:swarm', 1],
    ]);
    expect(b.total).toBe(7);
    expect(b.eased.map((r) => r.source)).toEqual(['calm', 'shelter']);
    expect(b.held).toMatchObject({ amount: 2 });
    expect(b.empty).toBe(false);
  });

  it('draws a threat as its own figure and every other source as an icon the art kit has', () => {
    const b = perilBreakdown({
      added: { hunger: 1, 'threat:rockslide': 3 },
      eased: { calm: 1, shelter: 3 },
      held: 1,
    });
    expect(b.added[0]?.art).toEqual({ kind: 'threat', look: 'rockslide' });
    for (const r of [...b.added, ...b.eased, ...(b.held ? [b.held] : [])]) {
      if (r.art.kind === 'icon') expect(hasIcon(r.art.id), r.source).toBe(true);
    }
  });

  it('has a tip for every source', () => {
    const b = perilBreakdown({
      added: { hunger: 1, ...Object.fromEntries(THREAT_TYPES.map((t) => [`threat:${t.id}`, 1])) },
      eased: { calm: 1, shelter: 1 },
      held: 1,
    });
    expect(b.added).toHaveLength(1 + THREAT_TYPES.length);
    for (const r of [...b.added, ...b.eased, ...(b.held ? [b.held] : [])]) {
      expect(TIP_TABLE[r.tip], r.source).toBeDefined();
    }
  });

  it('skips a source it does not know (a newer server) and zero amounts, and is empty when nothing happened', () => {
    const b = perilBreakdown({ added: { 'threat:comet': 2, hunger: 0 }, eased: {}, held: 0 });
    expect(b.added).toEqual([]);
    expect(b.held).toBeNull();
    expect(b.empty).toBe(true);
  });
});
