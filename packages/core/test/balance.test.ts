import { describe, expect, it } from 'vitest';
import { DEV_SEASON, playSeason, summarise } from '../scripts/balance.ts';

// The balance script (scripts/balance.ts): cheap checks on the dev season; the full report is run by hand.
describe('the balance simulation', () => {
  it('plays a season to its end, the same way every time for a seed', () => {
    const a = playSeason(3, 'careful', 3, DEV_SEASON);
    expect(a).toEqual(playSeason(3, 'careful', 3, DEV_SEASON));
    expect(['safe', 'wounded', 'lost']).toContain(a.outcome);
  });

  it('rewards a careful party over a careless one on the dev season', () => {
    const careful = summarise(10, 'careful', 3, DEV_SEASON);
    const careless = summarise(10, 'careless', 3, DEV_SEASON);
    expect(careful.safe).toBeGreaterThan(careless.safe);
    expect(careful.peril).toBeLessThan(careless.peril);
    // 20 seasons of simulation: slow when the whole suite runs at once, so it gets more than the default 5 s.
  }, 30_000);
});
