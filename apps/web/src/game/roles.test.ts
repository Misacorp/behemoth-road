import { characterOf, checkAction, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { CHAIN_SPOTS, type ChainStage, chainScenario, USERS } from '../api/fixtures.ts';
import { actionsAt, unlockOptions } from './chain.ts';
import { neededRole } from './roles.ts';

function staged(stage: ChainStage) {
  const s = chainScenario(stage);
  return { view: toPlayerView(s.state), me: characterOf(s.state, USERS.MISA)!.id };
}

describe('the role a greyed action needs', () => {
  it('names the role the core points to, for building, lingering and defending', () => {
    const { view, me } = staged({ role: 'scout', at: 'creature' });
    expect(neededRole(view, me, { kind: 'build', unlock: 'lantern' })).toBe('engineer');
    expect(neededRole(view, me, { kind: 'linger' })).toBe('keeper');
    expect(neededRole(view, me, { kind: 'defend' })).toBe('guardian');
  });

  it('is null when the action can be done, or the refusal is not about the role', () => {
    const { view, me } = staged({ role: 'engineer', at: 'creature' });
    // An engineer lacking materials: refused, but not for the role.
    const check = checkAction(view, me, { kind: 'build', unlock: 'lantern' });
    expect(check.ok).toBe(false);
    expect(neededRole(view, me, { kind: 'build', unlock: 'lantern' }, check)).toBeNull();
    expect(neededRole(view, me, { kind: 'feed' })).toBeNull();
  });

  it('marks a site your role cannot try with the role that can', () => {
    const { view, me } = staged({ role: 'scout', at: 'tomb', explored: ['tomb'] });
    const c = view.creature.centre;
    const key = `${c.q + CHAIN_SPOTS.tomb.q},${c.r + CHAIN_SPOTS.tomb.r}`;
    // A deep tomb (tier 2): only a role tagged for sites may try it.
    const deep = {
      ...view,
      features: { ...view.features, [key]: { type: 'deep-tomb', revealed: true, left: 1 } },
    };
    expect(actionsAt(deep, me)).toContainEqual(
      expect.objectContaining({ kind: 'work-site', enabled: false, needs: 'scholar' }),
    );
    expect(actionsAt(view, me)[0]).not.toHaveProperty('needs');
  });

  it('marks every unlock with the engineer for anyone else, and with nothing for an engineer', () => {
    const scout = staged({ role: 'scout', at: 'creature' });
    expect(unlockOptions(scout.view, scout.me).every((o) => o.needs === 'engineer')).toBe(true);
    const engineer = staged({ role: 'engineer', at: 'creature' });
    expect(unlockOptions(engineer.view, engineer.me).every((o) => o.needs === null)).toBe(true);
  });
});
