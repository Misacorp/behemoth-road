import { FEATURE_TYPES } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { joined, notJoined, seasonScenario, toView } from '../api/fixtures.ts';
import type { PlayerView } from '../api/schema.ts';
import { dueHint, HINT_LINES, HINT_ORDER, sightings } from './hints.ts';

const none: ReadonlySet<string> = new Set();

describe('first-encounter hints', () => {
  it('shows nothing before you have a character', () => {
    expect([...sightings(notJoined(), true)]).toEqual([]);
    expect(dueHint(notJoined(), none, true)).toBeNull();
  });

  it('starts with the fog edge, once you play', () => {
    expect(dueHint(joined(), none, false)).toBe('hint:fog');
    expect(dueHint(joined(), new Set(['hint:fog']), false)).toBeNull();
  });

  it('shows a threat, a settlement and hunger when they are in sight', () => {
    const view = toView(
      seasonScenario({
        threats: [{ type: 'captors', at: { q: 0, r: 4 } }],
        settlements: [{ at: { q: 3, r: 3 } }],
      }),
    );
    expect(sightings(view, false)).toEqual(new Set(['hint:fog', 'hint:threat', 'hint:settlement']));
    expect(sightings(view, true).has('hint:hunger')).toBe(true);
    expect(dueHint(view, new Set(['hint:fog']), false)).toBe('hint:threat');
    expect(dueHint(view, new Set(['hint:fog', 'hint:threat']), false)).toBe('hint:settlement');
    expect(dueHint(view, new Set(HINT_ORDER), true)).toBeNull();
  });

  it('shows the trap only once one is revealed (a veiled one is not in sight)', () => {
    const view = joined();
    const trap = FEATURE_TYPES.find((f) => f.kind === 'trap');
    if (!trap) throw new Error('no trap in the content');
    const withTrap = (revealed: boolean): PlayerView => ({
      ...view,
      game: { ...view.game, features: { '1,1': { type: trap.id, revealed, left: 1 } } },
    });
    expect(sightings(withTrap(false), false).has('hint:trap')).toBe(false);
    expect(sightings(withTrap(true), false).has('hint:trap')).toBe(true);
  });

  it('says only that something is there, in a short line each', () => {
    for (const id of HINT_ORDER) {
      const line = HINT_LINES[id];
      expect(line.length).toBeLessThanOrEqual(30);
      expect(line).toMatch(/^[A-Z]/);
    }
  });
});
