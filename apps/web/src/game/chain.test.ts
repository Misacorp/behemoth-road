import { characterOf, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { CHAIN_SPOTS, type ChainStage, chainScenario, USERS } from '../api/fixtures.ts';
import { actionsAt, featureAt, iconOf, stockOf, surveyOf, unlockOptions } from './chain.ts';

function staged(stage: ChainStage) {
  const s = chainScenario(stage);
  const view = toPlayerView(s.state);
  const me = characterOf(s.state, USERS.MISA)!.id;
  const c = s.state.creature.centre;
  const spot = (name: keyof typeof CHAIN_SPOTS) => ({
    q: c.q + CHAIN_SPOTS[name].q,
    r: c.r + CHAIN_SPOTS[name].r,
  });
  return { view, me, spot };
}

describe('the chain as the client reads it', () => {
  it('sees only revealed features, and lists stock in content order', () => {
    const { view, spot } = staged({ explored: ['iron'] });
    expect(featureAt(view, spot('iron'))?.type.kind).toBe('node');
    expect(featureAt(view, spot('tomb'))).toBeNull();
    expect(stockOf({ timber: 1, 'old-coin': 0, iron: 2 })).toEqual([
      ['iron', 2],
      ['timber', 1],
    ]);
  });

  it('offers a survey next to you at the scout price, faded when out of actions', () => {
    const scout = staged({ role: 'scout' });
    expect(surveyOf(scout.view, scout.me, scout.spot('iron'))).toEqual({ cost: 1, enabled: true });
    const other = staged({ role: 'guardian' });
    expect(surveyOf(other.view, other.me, other.spot('iron'))).toEqual({ cost: 2, enabled: true });
    // Not next to you, or already explored: no survey.
    expect(surveyOf(scout.view, scout.me, scout.spot('cliff'))).toBeNull();
    expect(surveyOf(scout.view, scout.me, scout.spot('start'))).toBeNull();
    const tired = {
      ...scout.view,
      characters: scout.view.characters.map((c) => ({ ...c, actionsLeft: 0 })),
    };
    expect(surveyOf(tired, scout.me, scout.spot('iron'))).toEqual({ cost: 1, enabled: false });
  });

  it('offers gather on a revealed node, faded with a full pack, and nothing on bare ground', () => {
    const on = staged({ at: 'iron', explored: ['iron'] });
    expect(actionsAt(on.view, on.me)).toEqual([{ kind: 'gather', cost: 1, enabled: true }]);
    const full = staged({ at: 'iron', explored: ['iron'], pack: { stone: 6 } });
    expect(actionsAt(full.view, full.me)).toEqual([{ kind: 'gather', cost: 1, enabled: false }]);
    const bare = staged({});
    expect(actionsAt(bare.view, bare.me)).toEqual([]);
  });

  it('lets a riding engineer start an unlock the stores can pay for', () => {
    const eng = staged({ role: 'engineer', at: 'creature', stores: { iron: 2, timber: 1 } });
    const hook = unlockOptions(eng.view, eng.me).find((o) => o.unlock.id === 'grappling-hook')!;
    expect(hook).toMatchObject({ done: false, work: null, missing: [], enabled: true });
    const lantern = unlockOptions(eng.view, eng.me).find((o) => o.unlock.id === 'lantern')!;
    expect(lantern).toMatchObject({
      missing: [{ material: 'stone', amount: 1 }],
      enabled: false,
    });
    // A scout cannot build, and a finished unlock is done.
    const scout = staged({ at: 'creature', stores: { iron: 2, timber: 1 }, unlocks: ['lantern'] });
    const options = unlockOptions(scout.view, scout.me);
    expect(options.every((o) => !o.enabled)).toBe(true);
    expect(options.find((o) => o.unlock.id === 'lantern')?.done).toBe(true);
    // The one in progress shows its work.
    const busy = staged({
      role: 'engineer',
      at: 'creature',
      project: { unlock: 'lantern', work: 2 },
    });
    expect(unlockOptions(busy.view, busy.me).find((o) => o.unlock.id === 'lantern')).toMatchObject({
      work: 2,
      enabled: true,
    });
  });

  it('maps content ids to the art kit icon keys', () => {
    expect(iconOf('grappling-hook')).toBe('hook');
    expect(iconOf('ancient-alloy')).toBe('alloy');
    expect(iconOf('iron-deposit')).toBe('ore');
    expect(iconOf('nonsense')).toBe('nonsense');
  });
});
