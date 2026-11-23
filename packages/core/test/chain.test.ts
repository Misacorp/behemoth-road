import { describe, expect, it } from 'vitest';
import { playChain } from '../scripts/pacing.ts';

// Measured with this script (3 characters): the spikes come on days 25–69 on 10 of
// 12 maps (median about 46); the wait is mostly for timber and iron to come into
// view, then for a deep tomb once the lantern is done. Berry bushes (Milestone 4)
// slowed it (it was 25–46 on 9 maps): more hidden features for the scout to
// survey. Real parties are larger.
describe('the first chain, stage by stage (seed 1)', () => {
  const { state, milestones } = playChain(1, 70);
  const day = (stage: string) => milestones[stage] ?? Infinity;

  it('reveals features', () => {
    expect(day('reveal')).toBeLessThanOrEqual(5);
  });

  it('gathers and deposits materials in the stores', () => {
    expect(day('deposit')).toBeGreaterThanOrEqual(day('reveal'));
    expect(day('deposit')).toBeLessThan(70);
  });

  it('builds the grappling hook and the lantern', () => {
    expect(day('grappling-hook')).toBeGreaterThanOrEqual(day('deposit'));
    expect(day('lantern')).toBeLessThan(70);
  });

  it('works a deep tomb for ancient alloy once the lantern is done', () => {
    expect(day('alloy')).toBeGreaterThanOrEqual(day('lantern'));
    expect(day('alloy')).toBeLessThan(70);
  });

  it('builds the climbing spikes, with everyone still in the game', () => {
    expect(day('climbing-spikes')).toBeGreaterThanOrEqual(day('alloy'));
    expect(day('climbing-spikes')).toBeLessThanOrEqual(70);
    expect(state.characters.every((c) => c.status === 'active')).toBe(true);
  });
});

describe('the first chain on many maps', () => {
  it('is reachable on most maps', () => {
    const days: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      days.push(playChain(seed, 70).milestones['climbing-spikes'] ?? Infinity);
    }
    expect(days.filter((d) => d <= 70).length).toBeGreaterThanOrEqual(9);
  });
});
