import { describe, expect, it } from 'vitest';
import { oddsView } from './odds.ts';

describe('oddsView', () => {
  it('maps success, failure kind and percentages', () => {
    const v = oddsView({ success: 0.8, failure: 0.2, failureKind: 'buried' });
    expect(v).toMatchObject({ success: 0.8, art: 'rocks', kind: 'buried' });
    expect(v?.percent).toEqual({ success: 80, failure: 20 });
    expect(v?.note).toBe('Success 80% · Pinned 20%');
  });

  it('picks the badge by failure kind', () => {
    const art = (failureKind: string) => oddsView({ success: 0.5, failure: 0.5, failureKind })?.art;
    expect(art('buried')).toBe('rocks');
    expect(art('still-pinned')).toBe('rocks');
    expect(art('angered')).toBe('anger');
    expect(art('site-failed')).toBe('harm');
    expect(art('something-new')).toBe('harm');
  });

  it('keeps the two percentages adding up to 100', () => {
    for (const s of [0.333, 0.666, 0.005, 0.995, 0.5]) {
      const v = oddsView({ success: s, failure: 1 - s, failureKind: 'angered' });
      expect(v && v.percent.success + v.percent.failure).toBe(100);
    }
  });

  it('shows a certain failure and nothing for no roll or a sure thing', () => {
    expect(oddsView({ success: 0, failure: 1, failureKind: 'angered' })?.percent).toEqual({
      success: 0,
      failure: 100,
    });
    expect(oddsView(null)).toBeNull();
    expect(oddsView({ success: 1, failure: 0, failureKind: 'angered' })).toBeNull();
    expect(oddsView({ success: Number.NaN, failure: 0, failureKind: 'x' })).toBeNull();
  });
});
