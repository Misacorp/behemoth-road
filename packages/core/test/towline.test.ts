import { describe, expect, it } from 'vitest';
import {
  act,
  checkAction,
  createGame,
  type GameState,
  hex,
  nextDay,
  planPath,
  UNLOCKS,
} from '../src/index.ts';
import { CALM, placeCharacter, withCharacter } from './helpers.ts';

const straight = { ...CALM, veerWeights: { left: 0, right: 0 } };
// The creature walks north: on day 2 its centre is (0, -1), its footprint reaches (0, 0) and the line
// reaches 2 more, so (0, 2) is in reach and (0, 3) is not. Grace hexes lie 7 or more from the centre.
const NEAR = hex(0, 2);

/** Day 2: `a` and `c` are riders (the tow line built), `x` stands near the creature. */
const base = (): GameState => {
  let s = createGame(1, { characterIds: ['a', 'c', 'x'], config: straight });
  s = { ...s, unlocks: [...s.unlocks, 'towline'] };
  s = nextDay(s);
  return placeCharacter(s, 'x', NEAR);
};

const ok = (r: ReturnType<typeof act>): GameState => {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.state;
};
const me = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const throwTo = (to: string) => ({ kind: 'throw-line', to }) as const;
const withActions = (s: GameState, id: string, actionsLeft: number) =>
  withCharacter(s, { ...me(s, id), actionsLeft });

describe('the tow line', () => {
  it('is content: 2 timber, 1 stone, 3 work, tagged towline', () => {
    expect(UNLOCKS.find((u) => u.id === 'towline')).toMatchObject({
      tags: ['towline'],
      work: 3,
      cost: [
        { material: 'timber', amount: 2 },
        { material: 'stone', amount: 1 },
      ],
    });
  });

  it('is thrown by a rider for one action to a character within reach, once per rider per day', () => {
    const s = base();

    expect(checkAction(s, 'a', throwTo('x'))).toMatchObject({ ok: true, cost: 1 });
    const thrown = ok(act(s, 'a', throwTo('x')));
    expect(thrown.creature.tows).toEqual([{ from: 'a', to: 'x' }]);
    expect(me(thrown, 'a').actionsLeft).toBe(s.config.actionsPerDay - 1);
    // Once per rider per day, and one line per target.
    expect(checkAction(thrown, 'a', throwTo('x'))).toMatchObject({
      ok: false,
      reason: 'already-have',
    });
    expect(checkAction(thrown, 'c', throwTo('x'))).toMatchObject({
      ok: false,
      reason: 'already-have',
    });
  });

  it('is refused without the unlock, off the creature, out of reach, or at oneself and riders', () => {
    const s = base();
    expect(checkAction({ ...s, unlocks: [] }, 'a', throwTo('x'))).toMatchObject({
      reason: 'needs-unlock',
    });
    expect(checkAction(placeCharacter(s, 'a', hex(0, 0)), 'a', throwTo('x'))).toMatchObject({
      reason: 'not-riding',
    });
    expect(checkAction(s, 'a', throwTo('a'))).toMatchObject({ reason: 'invalid-action' });
    expect(checkAction(s, 'a', throwTo('c'))).toMatchObject({ reason: 'on-creature' });
    expect(checkAction(s, 'a', throwTo('nobody'))).toMatchObject({ reason: 'unknown-character' });
    // The creature's centre is (0, -1) on day 2: radius 1 plus reach 2 is 3 hexes.
    const far = placeCharacter(s, 'x', hex(0, 3));
    expect(checkAction(far, 'a', throwTo('x'))).toMatchObject({ reason: 'not-near' });
    expect(checkAction(placeCharacter(s, 'x', hex(0, 5)), 'a', throwTo('x'))).toMatchObject({
      reason: 'not-near',
    });
    expect(checkAction(withActions(s, 'a', 0), 'a', throwTo('x'))).toMatchObject({
      reason: 'not-enough-actions',
    });
  });

  it('lets only the target grab it, for their own action: they ride and their pack is deposited', () => {
    const s = base();
    const thrown = ok(act(s, 'a', throwTo('x')));
    // Nobody else can grab it for them, and nothing is forced on x.
    expect(checkAction(thrown, 'c', { kind: 'grab-line' })).toMatchObject({
      ok: false,
      reason: 'on-creature',
    });
    expect(me(thrown, 'x').at).toEqual({ kind: 'hex', hex: NEAR });
    expect(checkAction(s, 'x', { kind: 'grab-line' })).toMatchObject({
      ok: false,
      reason: 'no-line',
    });
    const carrying = withCharacter(thrown, { ...me(thrown, 'x'), pack: { timber: 1 } });
    expect(checkAction(carrying, 'x', { kind: 'grab-line' })).toMatchObject({ ok: true, cost: 1 });
    const grabbed = ok(act(carrying, 'x', { kind: 'grab-line' }));
    expect(me(grabbed, 'x').at).toEqual({ kind: 'creature' });
    expect(me(grabbed, 'x').pack).toEqual({});
    expect(me(grabbed, 'x').actionsLeft).toBe(s.config.actionsPerDay - 1);
    expect(grabbed.stores.timber).toBe((carrying.stores.timber ?? 0) + 1);
    expect(grabbed.creature.tows).toEqual([]);
    expect(checkAction(withActions(thrown, 'x', 0), 'x', { kind: 'grab-line' })).toMatchObject({
      reason: 'not-enough-actions',
    });
  });

  it('lapses at the tick if nobody grabs it', () => {
    const s = base();
    const thrown = ok(act(s, 'a', throwTo('x')));
    expect(nextDay(thrown).creature.tows).toEqual([]);
  });

  it('saves a character walking cannot, only by their own grab', () => {
    // One action left: the way back costs more, so walking cannot board; the grab costs one.
    const s = withActions(base(), 'x', 1);
    expect(planPath(s, 'x', s.creature.centre)).toMatchObject({ ok: false });
    const thrown = ok(act(s, 'a', throwTo('x')));
    // Thrown, but x did nothing: the line lapses and x is still outside at the tick.
    const idle = nextDay(thrown);
    expect(me(idle, 'x').at).toEqual({ kind: 'hex', hex: NEAR });
    // With their own grab x is aboard.
    const saved = ok(act(thrown, 'x', { kind: 'grab-line' }));
    expect(me(saved, 'x').at).toEqual({ kind: 'creature' });
    expect(me(saved, 'x').actionsLeft).toBe(0);
  });

  it('is public and deterministic: the same inputs give the same state', () => {
    const start = base();
    const run = () => ok(act(start, 'a', throwTo('x')));
    expect(run()).toEqual(run());
  });
});
