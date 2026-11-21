import { describe, expect, it } from 'vitest';
import { seasonScenario, toView, USERS } from '../api/fixtures.ts';
import { TIP_TABLE } from '../text/tips.ts';
import { identities } from './identity.ts';
import { recapOf, STAT_ICONS, STAT_TIPS } from './recap.ts';

const staged = (byUser: Record<string, object>, shared = {}) => {
  const view = toView(
    seasonScenario({
      role: 'scout',
      stats: { shared, byUser },
      season: { status: 'over', outcome: 'safe', day: 9 },
    }),
  );
  return { view, recap: recapOf(view, identities(view)) };
};

describe('the recap model', () => {
  it('lists the four shared stats and the peak of peril', () => {
    const { recap } = staged(
      {},
      { threatsTurned: 3, finds: 2, unlocks: 1, befriended: 1, peakPeril: 8 },
    );
    expect(recap.shared).toEqual([
      { id: 'turned', value: 3 },
      { id: 'finds', value: 2 },
      { id: 'unlocks', value: 1 },
      { id: 'friends', value: 1 },
    ]);
    expect(recap.peakPeril).toBe(8);
  });

  it('lists every player by Discord name, and stars whoever led each stat (ties share it)', () => {
    const { recap } = staged({
      [USERS.MISA]: { explored: 14, strikes: 2, gathered: 5 },
      [USERS.PIP]: { explored: 6, strikes: 5, gathered: 5 },
    });
    expect(recap.players.map((p) => p.name).sort()).toEqual(['Misa', 'Ola', 'Pip']);
    const tops = (name: string) =>
      recap.players
        .find((p) => p.name === name)!
        .stats.filter((s) => s.top)
        .map((s) => s.id);
    expect(tops('Misa')).toEqual(['explored', 'gathered']);
    expect(tops('Pip')).toEqual(['strikes', 'gathered']);
    expect(tops('Ola')).toEqual([]);
  });

  it('stars no one for a stat nobody did', () => {
    const { recap } = staged({});
    expect(recap.players.flatMap((p) => p.stats.filter((s) => s.top))).toEqual([]);
    expect(recap.players.every((p) => p.stats.every((s) => s.value === 0))).toBe(true);
  });

  it('gives every stat an icon and a tip', () => {
    for (const id of Object.keys(STAT_ICONS) as (keyof typeof STAT_ICONS)[]) {
      expect(TIP_TABLE[STAT_TIPS[id]]).toBeDefined();
    }
  });
});
