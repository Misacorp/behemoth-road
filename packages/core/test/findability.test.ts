import { describe, expect, it } from 'vitest';
import { DAYS, firstDays, NEAR } from '../scripts/findability.ts';

// Seeds 1..40, the default config, the creature's real steps (see the script).
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const met = (material: 'stone' | 'iron' | 'timber', within = Infinity): number =>
  SEEDS.filter((seed) => firstDays(seed, DAYS, within)[material] !== null).length;

describe('the first unlocks are findable', () => {
  it('puts stone, iron and timber in the window within about a week in nearly every seed', () => {
    expect(met('stone')).toBeGreaterThanOrEqual(38);
    expect(met('iron')).toBeGreaterThanOrEqual(38);
    expect(met('timber')).toBeGreaterThanOrEqual(36);
  });

  it('puts stone and iron within a day trip of the creature in most seeds', () => {
    expect(met('stone', NEAR)).toBeGreaterThanOrEqual(34);
    expect(met('iron', NEAR)).toBeGreaterThanOrEqual(34);
  });
});
