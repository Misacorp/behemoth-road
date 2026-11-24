import { characterOf, threatOutlook, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { type SeasonStage, seasonScenario, USERS } from '../api/fixtures.ts';
import { IDLE, tap, tapHex } from '../map/flow.ts';
import {
  defendOption,
  ENDING_TITLES,
  escortCentres,
  escortedIds,
  seasonEnd,
  settlementActions,
  settlementInfo,
  struckToday,
  threatCard,
  threatMarks,
  threatNextPath,
} from './season.ts';

function staged(stage: SeasonStage) {
  const s = seasonScenario(stage);
  const c = s.state.creature.centre;
  return {
    s,
    view: toPlayerView(s.state),
    me: characterOf(s.state, USERS.MISA)!.id,
    ola: characterOf(s.state, USERS.OLA)!.id,
    abs: (h: { q: number; r: number }) => ({ q: c.q + h.q, r: c.r + h.r }),
  };
}

const tired = (v: ReturnType<typeof staged>['view']) => ({
  ...v,
  characters: v.characters.map((c) => ({ ...c, actionsLeft: 0 })),
});

// You stand at the chain's start (offset 1, 2); the iron spot (1, 3) is next to it, (3, 4) is not.
const NEAR = { q: 1, r: 3 };
const FAR = { q: 3, r: 4 };
const START = { q: 1, r: 2 };

describe('threats as the map reads them', () => {
  it('carries the core outlook: whether it arrives tomorrow and where it steps first', () => {
    const { view } = staged({
      threats: [
        { type: 'captors', at: { q: 0, r: 4 } },
        { type: 'rockslide', at: FAR },
      ],
    });
    const outlook = threatOutlook(view);
    expect(threatMarks(view)).toEqual(
      view.threats.map((t, i) => ({
        id: t.id,
        type: t.type,
        hex: t.hex,
        icon: t.type,
        name: t.type === 'captors' ? 'Captor band' : 'Rockslide',
        strength: t.strength,
        arrives: outlook[i]!.arrives,
        next: outlook[i]!.next,
      })),
    );
  });

  it('offers the strike on its card only on or next to it, faded without the actions', () => {
    const near = staged({ threats: [{ type: 'swarm', at: NEAR, strength: 2 }] });
    const id = near.view.threats[0]!.id;
    expect(threatCard(near.view, near.me, id)).toEqual({
      id,
      type: 'swarm',
      icon: 'swarm',
      name: 'Pterodactyl swarm',
      strength: 2,
      steps: threatNextPath(near.view, id).length,
      strike: { cost: near.view.config.strikeCost, enabled: true },
      defence: 0,
    });
    expect(threatCard(tired(near.view), near.me, id)?.strike).toEqual({
      cost: near.view.config.strikeCost,
      enabled: false,
      why: 'why:not-enough-actions',
    });
    const far = staged({ threats: [{ type: 'swarm', at: FAR }] });
    expect(threatCard(far.view, far.me, far.view.threats[0]!.id)?.strike).toBeNull();
    expect(threatCard(far.view, far.me, 'gone')).toBeNull();
  });

  it("a tap on a threat's hex opens its card, even while selected; again closes it", () => {
    const { view, me, abs } = staged({ threats: [{ type: 'swarm', at: NEAR }] });
    const id = view.threats[0]!.id;
    const card = tapHex(IDLE, view, me, abs(NEAR));
    expect(card).toEqual({ kind: 'threat', id });
    expect(tapHex(card, view, me, abs(NEAR))).toEqual(IDLE);
    const selected = tap(IDLE, view, me, { kind: 'me' });
    expect(selected).toEqual({ kind: 'selected' });
    expect(tapHex(selected, view, me, abs(NEAR))).toEqual({ kind: 'threat', id });
  });
});

describe('defending the creature in the hub', () => {
  it('is for wardens only: offered riding, faded on a hex or without actions, sealed once done', () => {
    const riding = staged({ role: 'warden', at: 'creature' });
    const cost = riding.view.config.defendCost;
    expect(defendOption(riding.view, riding.me)).toEqual({
      kind: 'defend',
      cost,
      enabled: true,
      uses: null,
    });
    expect(defendOption(tired(riding.view), riding.me)).toMatchObject({ enabled: false });
    const onHex = staged({ role: 'warden' });
    expect(defendOption(onHex.view, onHex.me)).toMatchObject({ enabled: false });
    expect(defendOption(onHex.view, onHex.me)?.done).toBeUndefined();
    const done = staged({ role: 'warden', at: 'creature', defending: true });
    expect(defendOption(done.view, done.me)).toEqual({
      kind: 'defend',
      cost,
      enabled: false,
      uses: null,
      done: true,
      why: 'why:done',
    });
    // Anyone else sees it greyed, with the warden's emblem (the role the core's refusal points to).
    const scout = staged({ role: 'scout', at: 'creature' });
    expect(defendOption(scout.view, scout.me)).toEqual({
      kind: 'defend',
      cost,
      enabled: false,
      uses: null,
      needs: 'warden',
      why: 'why:role-warden',
    });
  });
});

describe('settlements', () => {
  it('a wary one offers parley, with the risk mark for a non-warden, and an offer for each trade good carried', () => {
    const scout = staged({ settlements: [{ at: START }], pack: { 'old-coin': 1 } });
    const cost = scout.view.config.parleyCost;
    expect(settlementActions(scout.view, scout.me)).toEqual([
      { kind: 'parley', cost, enabled: true, risk: true },
      { kind: 'offer', cost: scout.view.config.offerCost, enabled: true, uses: 'old-coin' },
    ]);
    const warden = staged({ role: 'warden', settlements: [{ at: START }] });
    expect(settlementActions(warden.view, warden.me)).toEqual([
      { kind: 'parley', cost, enabled: true, risk: false },
    ]);
    expect(settlementActions(tired(warden.view), warden.me)).toEqual([
      { kind: 'parley', cost, enabled: false, risk: false, why: 'why:not-enough-actions' },
    ]);
  });

  it('once friendly offers its three boons until one is taken; nothing when angry or elsewhere', () => {
    const friendly = staged({ settlements: [{ at: START, attitude: 'friendly', favour: 3 }] });
    const cost = friendly.view.config.askBoonCost;
    expect(settlementActions(friendly.view, friendly.me)).toEqual([
      { kind: 'boon:gift', cost, enabled: true },
      { kind: 'boon:mislead', cost, enabled: true },
      { kind: 'boon:shelter', cost, enabled: true },
    ]);
    const taken = staged({ settlements: [{ at: START, attitude: 'friendly', boon: 'gift' }] });
    expect(settlementActions(taken.view, taken.me)).toEqual([]);
    const angry = staged({ settlements: [{ at: START, attitude: 'angry' }] });
    expect(settlementActions(angry.view, angry.me)).toEqual([]);
    const away = staged({ settlements: [{ at: FAR }], pack: { 'old-coin': 1 } });
    expect(settlementActions(away.view, away.me)).toEqual([]);
  });

  it('from afar a tap opens its card (attitude and favour); selected, a tap on it plans the walk there', () => {
    const { view, me, abs } = staged({ settlements: [{ at: NEAR, favour: 1 }] });
    const id = view.settlements[0]!.id;
    expect(settlementInfo(view, id)).toEqual({
      id,
      hex: abs(NEAR),
      attitude: 'wary',
      favour: 1,
      needed: 3,
      boon: null,
      look: 'hill-folk',
      name: 'Hill folk',
    });
    const card = tapHex(IDLE, view, me, abs(NEAR));
    expect(card).toEqual({ kind: 'settlement', id });
    expect(tapHex(card, view, me, abs(NEAR))).toEqual(IDLE);
    const planned = tapHex({ kind: 'selected' }, view, me, abs(NEAR));
    expect(planned.kind).toBe('planned');
  });
});

describe('escort, struck and the season', () => {
  it('a warden on a hex escorts the characters within 1 of it (itself excepted)', () => {
    const { view, me, ola, abs } = staged({ wardenAt: { q: 2, r: 2 } });
    expect(escortedIds(view)).toEqual(new Set([me]));
    expect(escortCentres(view)).toEqual([abs({ q: 2, r: 2 })]);
    const apart = staged({ wardenAt: { q: 3, r: 4 } });
    expect(escortedIds(apart.view).size).toBe(0);
    expect(escortedIds(view).has(ola)).toBe(false);
  });

  it('a bandage shows only on the day a threat struck', () => {
    expect(struckToday({ struckDay: 4 }, 4)).toBe(true);
    expect(struckToday({ struckDay: 3 }, 4)).toBe(false);
    expect(struckToday({ struckDay: null }, 4)).toBe(false);
  });

  it('reads the ending from the season, with its title', () => {
    expect(seasonEnd(staged({}).view)).toBeNull();
    const over = staged({ season: { status: 'over', outcome: 'wounded', day: 9 } });
    expect(seasonEnd(over.view)).toEqual({ outcome: 'wounded', day: 9 });
    expect(ENDING_TITLES).toEqual({ safe: 'Arrived', wounded: 'Arrived, wounded', lost: 'Lost' });
  });
});
