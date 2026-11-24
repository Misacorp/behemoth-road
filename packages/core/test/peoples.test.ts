import { describe, expect, it } from 'vitest';
import {
  act,
  type Action,
  checkAction,
  type GameState,
  hex,
  hexDistance,
  hexKey,
  leadingEdge,
  nextDay,
  nextDayWithEvents,
  terrainOf,
} from '../src/index.ts';
import {
  fieldGame,
  findSeed,
  lingering,
  placeCharacter,
  plain,
  QUIET,
  withSettlement,
  withThreat,
} from './helpers.ts';

const VILLAGE = hex(3, -1);

/** These roles, the first one standing on a wary settlement. */
const atVillage = (roles: string[], change = {}, seed = 1): GameState =>
  placeCharacter(
    withSettlement(fieldGame(roles, QUIET, seed), VILLAGE, change),
    roles[0]!,
    VILLAGE,
  );

const doing = (state: GameState, id: string, action: Action) => {
  const r = act(state, id, action);
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe('parley', () => {
  it('gains the warden favour without risk, and befriends at favourNeeded', () => {
    const state = atVillage(['warden']);
    expect(checkAction(state, 'warden', { kind: 'parley' })).toEqual({
      ok: true,
      cost: 1,
      uses: [],
      chance: 1,
    });
    const once = doing(state, 'warden', { kind: 'parley' });
    expect(plain(once.events)).toEqual([{ kind: 'parley', id: 's1', characterId: 'warden', favour: 2 }]);
    expect(once.state.settlements[0]).toMatchObject({ attitude: 'wary', favour: 2 });
    const twice = doing(once.state, 'warden', { kind: 'parley' });
    expect(plain(twice.events).map((e) => e.kind)).toEqual(['parley', 'befriended']);
    expect(twice.state.settlements[0]).toMatchObject({ attitude: 'friendly', favour: 4 });
    expect(checkAction(twice.state, 'warden', { kind: 'parley' })).toMatchObject({
      ok: false,
      reason: 'not-wary',
    });
  });

  it('publishes the risk for anyone else, and the seeded roll may anger the settlement', () => {
    expect(checkAction(atVillage(['scout']), 'scout', { kind: 'parley' })).toMatchObject({
      ok: true,
      chance: 0.75,
    });
    const angers = (seed: number) => {
      const r = act(atVillage(['scout'], {}, seed), 'scout', { kind: 'parley' });
      return r.ok && r.state.settlements[0]?.attitude === 'angry';
    };
    const calm = doing(
      atVillage(
        ['scout'],
        {},
        findSeed((s) => !angers(s)),
      ),
      'scout',
      {
        kind: 'parley',
      },
    );
    expect(calm.state.settlements[0]).toMatchObject({ attitude: 'wary', favour: 1 });

    const state = atVillage(['scout'], {}, findSeed(angers));
    const angry = doing(state, 'scout', { kind: 'parley' });
    // The same roll on a retry: fair and repeatable.
    expect(doing(state, 'scout', { kind: 'parley' })).toEqual(angry);
    expect(angry.state.settlements[0]).toMatchObject({ attitude: 'angry', favour: 0 });
    // It sends its raiders from its hex at once.
    expect(angry.state.threats).toEqual([
      { id: 'ts1', type: 'raiders', hex: VILLAGE, strength: 2, appearedDay: 1 },
    ]);
    expect(plain(angry.events)).toEqual([
      { kind: 'angered', id: 's1' },
      { kind: 'threat-appears', id: 'ts1', type: 'raiders', hex: VILLAGE },
    ]);
    expect(angry.state.characters[0]?.actionsLeft).toBe(2);
    for (const action of [{ kind: 'parley' }, { kind: 'ask-boon', boon: 'gift' }] as const) {
      expect(checkAction(angry.state, 'scout', action).ok).toBe(false);
    }
  });

  it('needs a settlement on the hex you stand on', () => {
    const state = withSettlement(fieldGame(['warden']), VILLAGE);
    expect(checkAction(state, 'warden', { kind: 'parley' })).toMatchObject({
      ok: false,
      reason: 'no-settlement',
      cost: 1,
    });
    const beside = placeCharacter(state, 'warden', hex(4, -1));
    expect(checkAction(beside, 'warden', { kind: 'parley' })).toMatchObject({
      reason: 'no-settlement',
    });
  });
});

describe('offer', () => {
  it('takes a trade good from the pack for favour, with no risk', () => {
    let state = atVillage(['scout']);
    expect(checkAction(state, 'scout', { kind: 'offer', material: 'old-coin' })).toMatchObject({
      ok: false,
      reason: 'no-trade-good',
    });
    state = {
      ...state,
      characters: state.characters.map((c) => ({ ...c, pack: { 'old-coin': 1, forage: 2 } })),
    };
    expect(checkAction(state, 'scout', { kind: 'offer', material: 'forage' })).toMatchObject({
      reason: 'no-trade-good',
    });
    expect(checkAction(state, 'scout', { kind: 'offer', material: 'old-coin' })).toEqual({
      ok: true,
      cost: 1,
      uses: [{ material: 'old-coin', amount: 1 }],
      chance: 1,
    });
    const r = doing(state, 'scout', { kind: 'offer', material: 'old-coin' });
    expect(plain(r.events)).toEqual([
      { kind: 'offer', id: 's1', characterId: 'scout', material: 'old-coin' },
    ]);
    expect(r.state.characters[0]?.pack).toEqual({ forage: 2 });
    expect(r.state.settlements[0]).toMatchObject({ favour: 2, attitude: 'wary' });
  });
});

describe('ask a boon', () => {
  const friendly = (peril = 0) => ({
    ...atVillage(['scout', 'keeper'], { attitude: 'friendly', favour: 3 }),
    peril,
  });

  it('needs a friendly settlement, a known boon and none taken yet', () => {
    expect(
      checkAction(atVillage(['scout']), 'scout', { kind: 'ask-boon', boon: 'gift' }),
    ).toMatchObject({
      reason: 'not-friendly',
    });
    expect(checkAction(friendly(), 'scout', { kind: 'ask-boon', boon: 'wings' })).toMatchObject({
      reason: 'unknown-boon',
    });
    const taken = doing(friendly(), 'scout', { kind: 'ask-boon', boon: 'gift' });
    expect(checkAction(taken.state, 'scout', { kind: 'ask-boon', boon: 'shelter' })).toMatchObject({
      reason: 'boon-taken',
    });
  });

  it("gift: the people's gift goes into the team stores", () => {
    const r = doing(friendly(), 'scout', { kind: 'ask-boon', boon: 'gift' });
    expect(r.state.stores).toEqual({ forage: 2, timber: 1 });
    expect(r.state.settlements[0]?.boon).toBe('gift');
    expect(plain(r.events)).toEqual([{ kind: 'boon', id: 's1', characterId: 'scout', boon: 'gift' }]);
  });

  it('shelter: peril falls by shelterPeril', () => {
    const r = doing(friendly(5), 'scout', { kind: 'ask-boon', boon: 'shelter' });
    expect(r.state.peril).toBe(2);
    expect(r.events).toContainEqual({
      kind: 'peril',
      from: 5,
      to: 2,
      sources: [{ source: 'shelter', amount: -3 }],
    });
    expect(doing(friendly(1), 'scout', { kind: 'ask-boon', boon: 'shelter' }).state.peril).toBe(0);
  });

  it('mislead: pursuers are gone, and none appears for misleadDays ticks', () => {
    let state = withThreat(friendly(), 'captors', hex(0, 5), 3, 'c');
    state = withThreat(state, 'swarm', hex(-5, 2), 2, 'w');
    const r = doing(state, 'scout', { kind: 'ask-boon', boon: 'mislead' });
    expect(r.state.threats.map((t) => t.id)).toEqual(['w']);
    expect(r.events).toContainEqual({ kind: 'threat-gone', id: 'c' });
    expect(r.state.misleadUntilDay).toBe(5);
  });
});

describe('settlements on the route', () => {
  const ROUTE = { ...QUIET, settlementFirst: 1, settlementEvery: 2 };

  it('appear when the steps reach settlementFirst, then every settlementEvery steps', () => {
    let state = fieldGame(['a'], ROUTE);
    const counts: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = nextDay(state);
      counts.push(state.settlements.length);
    }
    expect(counts).toEqual([1, 1, 2, 2, 3]);
    // Not while the creature lingers: lingering adds no steps.
    const stayed = nextDay(lingering(fieldGame(['a'], ROUTE)));
    expect(stayed.creature.steps).toBe(0);
    expect(stayed.settlements).toEqual([]);
  });

  it('stand at the leading edge, not on water, steep ground or a feature', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const next = nextDayWithEvents(fieldGame(['a'], ROUTE, seed));
      const s = next.state.settlements[0];
      if (!s) continue;
      const edge = leadingEdge(next.state).map(hexKey);
      expect(edge).toContain(hexKey(s.hex));
      expect(hexDistance(s.hex, next.state.creature.centre)).toBe(next.state.config.windowRadius);
      const tags = terrainOf(next.state, s.hex)!.tags;
      expect(tags).not.toContain('water');
      expect(tags).not.toContain('steep');
      expect(next.state.features[hexKey(s.hex)]).toBeUndefined();
      expect(['hill-folk', 'river-folk']).toContain(s.type);
      expect(s).toMatchObject({
        id: 's2',
        attitude: 'wary',
        favour: 0,
        boon: null,
      });
      expect(next.events).toContainEqual({ kind: 'settlement-appears', id: 's2', hex: s.hex });
    }
  });

  it('stay until their hex is lost to the fog', () => {
    let state = withSettlement(
      fieldGame(['a'], { ...QUIET, veerWeights: { left: 0, right: 0 } }),
      hex(0, 3),
    );
    const kept: number[] = [];
    for (let i = 0; i < 12; i++) {
      state = nextDay(state);
      kept.push(state.settlements.length);
    }
    // Walking north from the origin, (0, 3) leaves the window at the fourth step and is lost a day later.
    expect(kept.slice(0, 5)).toEqual([1, 1, 1, 1, 0]);
  });
});
