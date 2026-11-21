import { characterOf, FEATURE_TYPES, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type ChainStage, chainScenario, toView, USERS } from '../api/fixtures.ts';
import { careOptions, fireAction, fireHintAt, fuelNodeAt } from './chain.ts';

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

  it('without fuel, hints faded with the timber faded only when asked to (a card open, a fire seen)', () => {
    const { view, me } = staged({ pack: {} });
    expect(fireAction(view, me, true)).toEqual({
      kind: 'light-fire',
      cost: view.config.lightFireCost,
      enabled: false,
      uses: 'timber',
      short: true,
      why: 'why:no-fuel',
    });
    expect(fireAction(view, me, false)).toBeNull();
  });

  it('is not offered where a fire burns, or while riding', () => {
    const lit = staged({ pack: { timber: 1 }, fires: [{ q: 1, r: 2 }] });
    expect(fireAction(lit.view, lit.me)).toBeNull();
    const riding = staged({ pack: { timber: 1 }, at: 'creature' });
    expect(fireAction(riding.view, riding.me)).toBeNull();
  });
});

describe('caring for the creature in the hub', () => {
  it('lets anyone riding feed it from the stores; keepers alone can linger, others see it greyed with the keeper', () => {
    const scout = staged({ role: 'scout', at: 'creature', stores: { forage: 2 } });
    expect(careOptions(scout.view, scout.me)).toEqual([
      { kind: 'feed', cost: 1, enabled: true, uses: 'forage' },
      {
        kind: 'linger',
        cost: 2,
        enabled: false,
        uses: null,
        needs: 'keeper',
        why: 'why:role-keeper',
      },
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
    const keeper = toView(chainScenario({ role: 'keeper', satiety: 7, cues: [cue] }));
    expect(keeper.signs.appetite).toEqual({ kind: 'underfed', level: 1, faint: false });
    expect(keeper.signs.cues.map((c) => c.reaction)).toEqual(['toward']);
    const scout = toView(chainScenario({ role: 'scout', satiety: 7, cues: [cue] }));
    expect(scout.signs).toEqual({ appetite: null, cues: [] });
    const starving = toView(chainScenario({ role: 'scout', satiety: 4 }));
    expect(starving.signs.appetite).toEqual({ kind: 'underfed', level: 1, faint: true });
  });
});

describe('the fire hint on a timber stand', () => {
  it('reads the node yield by its fuel tag, never by id', () => {
    const s = chainScenario({ explored: ['iron'] });
    const view = toPlayerView(s.state);
    const c = s.state.creature.centre;
    const iron = { q: c.q + 1, r: c.r + 3 };
    expect(fuelNodeAt(view, iron)).toBeNull();
    expect(fireHintAt(view, iron)).toBeNull();
    const key = `${String(iron.q)},${String(iron.r)}`;
    const stand = FEATURE_TYPES.find((f) => f.kind === 'node' && f.yields.material === 'timber')!;
    const wooded = {
      ...view,
      features: { ...view.features, [key]: { type: stand.id, revealed: true, left: 2 } },
    };
    expect(fuelNodeAt(wooded, iron)).toBe('timber');
    expect(fireHintAt(wooded, iron)).toEqual({ cost: view.config.lightFireCost, uses: 'timber' });
    // A stand not yet revealed gives no hint (hidden features never reach the client anyway).
    const hidden = {
      ...view,
      features: { ...view.features, [key]: { type: stand.id, revealed: false, left: 2 } },
    };
    expect(fuelNodeAt(hidden, iron)).toBeNull();
    expect(fireHintAt(hidden, iron)).toBeNull();
  });
});
