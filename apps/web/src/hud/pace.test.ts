import { describe, expect, it } from 'vitest';
import { dayIncreased, PACE_TUNING, ringFraction } from './pace.ts';

describe('the day banner', () => {
  it('shows only when the day goes up', () => {
    expect(dayIncreased(null, 1)).toBe(false);
    expect(dayIncreased(4, 4)).toBe(false);
    expect(dayIncreased(4, 5)).toBe(true);
    expect(dayIncreased(9, 1)).toBe(false);
    expect(PACE_TUNING.dayBannerMs).toBe(4000);
  });
});

describe('the countdown ring', () => {
  it('drains from full to empty and stays within bounds', () => {
    expect(ringFraction(6000, 6000)).toBe(1);
    expect(ringFraction(3000, 6000)).toBe(0.5);
    expect(ringFraction(-5, 6000)).toBe(0);
    expect(ringFraction(9000, 6000)).toBe(1);
    expect(ringFraction(100, 0)).toBe(0);
  });
});
