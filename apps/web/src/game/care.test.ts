import { characterOf, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type ChainStage, chainScenario, toView, USERS } from '../api/fixtures.ts';
import { careOptions, fireAction } from './chain.ts';

function staged(stage: ChainStage) {
  const s = chainScenario(stage);
  return { s, view: toPlayerView(s.state), me: characterOf(s.state, USERS.MISA)!.id };
}

const tired = (v: ReturnType<typeof staged>['view']) => ({
  ...v,
  characters: v.characters.map((c) => ({ ...c, actionsLeft: 0 })),
});

describe('lighting a fire where you stand', () => {
  it('is offered with its timber and pip when you carry fuel', () => {
    const { view, me } = staged({ pack: { timber: 1 } });
    expect(fireAction(view, me)).toEqual({
      kind: 'light-fire',
      cost: view.config.lightFireCost,
      enabled: true,
      uses: 'timber',
    });
  });

  it('is faded when your actions are spent, and not offered without fuel', () => {
    const { view, me } = staged({ pack: { timber: 1 } });
    expect(fireAction(tired(view), me)).toMatchObject({ enabled: false, uses: 'timber' });
    const empty = staged({ pack: {} });
    expect(fireAction(empty.view, empty.me)).toBeNull();
  });

  it('is not offered where a fire burns, or while riding', () => {
    const lit = staged({ pack: { timber: 1 }, fires: [{ q: 1, r: 2 }] });
    expect(fireAction(lit.view, lit.me)).toBeNull();
    const riding = staged({ pack: { timber: 1 }, at: 'creature' });
    expect(fireAction(riding.view, riding.me)).toBeNull();
  });
});

describe('caring for the creature in the hub', () => {
  it('lets anyone riding feed it from the stores; keepers alone also see linger', () => {
    const scout = staged({ role: 'scout', at: 'creature', stores: { forage: 2 } });
    expect(careOptions(scout.view, scout.me)).toEqual([
      { kind: 'feed', cost: 1, enabled: true, uses: 'forage', short: false },
    ]);
    const keeper = staged({ role: 'keeper', at: 'creature', stores: { forage: 2 } });
    expect(careOptions(keeper.view, keeper.me).map((a) => [a.kind, a.enabled])).toEqual([
      ['feed', true],
      ['linger', true],
    ]);
    expect(careOptions(keeper.view, keeper.me)[1]).toMatchObject({ cost: 2, uses: null });
  });

  it('fades feeding without food (the food drawn short) and both when not riding', () => {
    const hungry = staged({ role: 'keeper', at: 'creature' });
    expect(careOptions(hungry.view, hungry.me)[0]).toMatchObject({
      kind: 'feed',
      enabled: false,
      uses: 'forage',
      short: true,
    });
    const walking = staged({ role: 'keeper', stores: { forage: 1 } });
    expect(careOptions(walking.view, walking.me).map((a) => a.enabled)).toEqual([false, false]);
  });

  it('marks a linger asked for today as done, and fades it the day after a linger', () => {
    const asked = staged({ role: 'keeper', at: 'creature', lingering: true });
    expect(careOptions(asked.view, asked.me)[1]).toMatchObject({ done: true, enabled: false });
    const after = staged({ role: 'keeper', at: 'creature', day: 5, lingeredDay: 4 });
    expect(careOptions(after.view, after.me)[1]).toMatchObject({ done: false, enabled: false });
  });
});

describe('the scenarios send signs per viewer', () => {
  it('a keeper sees the appetite from level 1 and the cues; anyone else only a faint level 2', () => {
    const cue = { at: { q: 2, r: 2 }, reaction: 'attracted' as const };
    const keeper = toView(chainScenario({ role: 'keeper', satiety: 3, cues: [cue] }));
    expect(keeper.signs.appetite).toEqual({ kind: 'underfed', level: 1, faint: false });
    expect(keeper.signs.cues.map((c) => c.reaction)).toEqual(['toward']);
    const scout = toView(chainScenario({ role: 'scout', satiety: 3, cues: [cue] }));
    expect(scout.signs).toEqual({ appetite: null, cues: [] });
    const starving = toView(chainScenario({ role: 'scout', satiety: 2 }));
    expect(starving.signs.appetite).toEqual({ kind: 'underfed', level: 1, faint: true });
  });
});
