import { describe, expect, it } from 'vitest';
import { buildReviewItems, nextBatch } from '../src/review.ts';

describe('review batch', () => {
  const items = buildReviewItems();

  it('has stable unique ids and files, and picks that share a question', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.file)).size).toBe(items.length);
    const picks = new Map<string, Set<string | undefined>>();
    for (const i of items) {
      if (i.kind === 'pick') picks.set(i.pick!, (picks.get(i.pick!) ?? new Set()).add(i.question));
      else expect(i.pick).toBeUndefined();
    }
    expect([...picks.keys()]).toEqual([]);
    for (const qs of picks.values()) expect(qs.size).toBe(1);
  });

  it('draws each item at 600 to 900 px wide, with no text', () => {
    for (const i of items) {
      const width = Number(/width="(\d+)"/.exec(i.svg)![1]);
      expect(width, i.id).toBeGreaterThanOrEqual(600);
      expect(width, i.id).toBeLessThanOrEqual(900);
      expect(i.svg).not.toMatch(/<text/);
    }
  });

  it('numbers batches per day and keeps the number when nothing changed', () => {
    const now = [{ id: 'a', version: '1' }];
    expect(nextBatch(undefined, now, '2026-11-19')).toBe('2026-11-19-1');
    expect(nextBatch({ batch: '2026-11-18-4', items: now }, now, '2026-11-19')).toBe(
      '2026-11-19-1',
    );
    expect(nextBatch({ batch: '2026-11-19-2', items: now }, now, '2026-11-19')).toBe(
      '2026-11-19-2',
    );
    expect(
      nextBatch({ batch: '2026-11-19-2', items: [{ id: 'a', version: '0' }] }, now, '2026-11-19'),
    ).toBe('2026-11-19-3');
  });
});
