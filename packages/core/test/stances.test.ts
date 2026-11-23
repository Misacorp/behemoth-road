import { describe, expect, it } from 'vitest';
import {
  act,
  checkAction,
  createGame,
  effectiveStance,
  type GameEvent,
  type GameState,
  hex,
  hexKey,
  moveAlong,
  nextDayWithEvents,
  STANCES,
  toPlayerView,
} from '../src/index.ts';
import {
  chainGame,
  fieldGame,
  lingering,
  placeCharacter,
  QUIET,
  withCharacter,
  withFeature,
  withStance,
  withThreat,
} from './helpers.ts';

const P = hex(3, -1);
const ofKind = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);
const get = (state: GameState, id: string) => state.characters.find((c) => c.id === id)!;
const ok = (state: GameState, id: string, action: Parameters<typeof act>[2]) => {
  const result = act(state, id, action);
  if (!result.ok) throw new Error(result.reason);
  return result;
};
const withActions = (state: GameState, id: string, actionsLeft: number): GameState =>
  withCharacter(state, { ...get(state, id), actionsLeft });

describe('the stance content', () => {
  it('lists the three stances with distinct ids and icons, rest first', () => {
    expect(STANCES.map((s) => s.id)).toEqual(['rest', 'lie-in-wait', 'gather']);
    expect(new Set(STANCES.map((s) => s.icon)).size).toBe(STANCES.length);
  });

  it('gives every new character rest and no waiting', () => {
    const state = createGame(1, { characterIds: ['a'] });
    expect(get(state, 'a')).toMatchObject({ stance: 'rest', waiting: false });
  });
});

describe('choosing a stance', () => {
  it('is free, any time, kept across days, and refused for an unknown one', () => {
    const state = chainGame(['scout']);
    expect(
      checkAction(state, 'scout', { kind: 'set-stance', stance: 'lie-in-wait' }),
    ).toMatchObject({
      ok: true,
      cost: 0,
    });
    const done = ok(state, 'scout', { kind: 'set-stance', stance: 'lie-in-wait' });
    expect(done.events).toEqual([{ kind: 'stance', characterId: 'scout', stance: 'lie-in-wait' }]);
    expect(get(done.state, 'scout')).toMatchObject({ stance: 'lie-in-wait', actionsLeft: 3 });
    expect(get(nextDayWithEvents(done.state).state, 'scout').stance).toBe('lie-in-wait');
    expect(checkAction(state, 'scout', { kind: 'set-stance', stance: 'nap' })).toMatchObject({
      ok: false,
      reason: 'unknown-stance',
    });
  });

  it('is public: the player view shows it', () => {
    const state = withStance(chainGame(['scout']), 'scout', 'lie-in-wait');
    expect(toPlayerView(state).characters[0]).toMatchObject({
      stance: 'lie-in-wait',
      waiting: false,
    });
  });
});

describe('falling back to rest', () => {
  it('replaces a stance that does not fit where the character is', () => {
    let state = chainGame(['scout', 'keeper']);
    // Riding: lie in wait and gather have nowhere to act.
    state = withStance(state, 'scout', 'lie-in-wait');
    state = withStance(state, 'keeper', 'gather');
    expect(effectiveStance(state, get(state, 'scout')).id).toBe('rest');
    expect(effectiveStance(state, get(state, 'keeper')).id).toBe('rest');
    // On a hex with no node: gather still rests (nobody gathers in an empty field).
    state = placeCharacter(state, 'keeper', P);
    expect(effectiveStance(state, get(state, 'keeper')).id).toBe('rest');
    // Lie in wait fits on a hex; gather fits on a node.
    state = withStance(state, 'keeper', 'lie-in-wait');
    expect(effectiveStance(state, get(state, 'keeper')).id).toBe('lie-in-wait');
    state = withFeature(withStance(state, 'keeper', 'gather'), P, 'iron-deposit', true);
    expect(effectiveStance(state, get(state, 'keeper')).id).toBe('gather');
  });
});

describe('lie in wait', () => {
  // An ambush at (0, 4) steps to (0, 3) while the creature lingers.
  const setup = (strength: number, role = 'scholar') => {
    let state = withThreat(lingering(fieldGame([role, 'keeper'])), 'ambush', hex(0, 4), strength);
    state = placeCharacter(state, role, hex(0, 3));
    return withStance(state, role, 'lie-in-wait');
  };

  it('strikes a threat that ends on the hex with power once plus a little more per extra unspent action, and clears it', () => {
    const next = nextDayWithEvents(setup(3));
    // 1 (other) + 1 for each of the 2 actions after the first.
    expect(ofKind(next.events, 'threat-hit')).toEqual([
      { kind: 'threat-hit', id: 'xambush', characterId: 'scholar', strength: 0 },
    ]);
    expect(ofKind(next.events, 'threat-cleared')).toEqual([
      { kind: 'threat-cleared', id: 'xambush', characterId: 'scholar' },
    ]);
    expect(next.state.threats).toEqual([]);
    expect(ofKind(next.events, 'struck')).toEqual([]);
    expect(get(next.state, 'scholar')).toMatchObject({ actionsLeft: 3, struckDay: null });
    // The strike earns XP like a strike action.
    expect(get(next.state, 'scholar').skills.xp).toBe(1);
  });

  it('weakens one it cannot clear, which then strikes the character', () => {
    const next = nextDayWithEvents(setup(9));
    expect(next.state.threats.map((t) => t.strength)).toEqual([6]);
    expect(ofKind(next.events, 'struck').map((e) => e.characterId)).toEqual(['scholar']);
    expect(get(next.state, 'scholar')).toMatchObject({ actionsLeft: 1, struckDay: 2 });
  });

  it('counts only the actions left unspent', () => {
    const state = withActions(setup(4), 'scholar', 1);
    // One action: the base power alone, weakened to 3.
    expect(nextDayWithEvents(state).state.threats.map((t) => t.strength)).toEqual([3]);
  });

  it('does nothing once every action is spent: it is the spare actions that lie in wait', () => {
    const state = withActions(setup(4), 'scholar', 0);
    expect(ofKind(nextDayWithEvents(state).events, 'threat-hit')).toEqual([]);
  });

  it('is never stronger than striking by hand with the same actions, for any role', () => {
    const cfg = createGame(1, { characterIds: ['a'] }).config;
    for (const power of [cfg.clearPowerOther, cfg.clearPowerGuardian]) {
      for (let n = 1; n <= cfg.actionsPerDay; n++) {
        const stance = power + cfg.stanceAmbushPerAction * (n - 1);
        expect(stance, `power ${power}, ${n} actions`).toBeLessThanOrEqual(power * n);
      }
    }
    // Strictly weaker for the defender with more than one action.
    expect(cfg.clearPowerGuardian + cfg.stanceAmbushPerAction).toBeLessThan(
      cfg.clearPowerGuardian * 2,
    );
  });

  it('is stronger for a defender (a role tagged defend)', () => {
    // 2 (defender) + 2 = 4 clears; 1 + 2 = 3 leaves 1.
    expect(nextDayWithEvents(setup(4, 'guardian')).state.threats).toEqual([]);
    expect(nextDayWithEvents(setup(4)).state.threats.map((t) => t.strength)).toEqual([1]);
  });

  it('also strikes one that crosses the hex on the way, sparing the creature', () => {
    let state = withThreat(lingering(fieldGame(['scholar', 'keeper'])), 'captors', hex(0, 5), 3);
    state = placeCharacter(state, 'scholar', hex(0, 4));
    state = withStance(state, 'scholar', 'lie-in-wait');
    // Captors walk two hexes: (0, 4), the scholar's, then (0, 3).
    const next = nextDayWithEvents(state);
    expect(ofKind(next.events, 'threat-cleared')).toHaveLength(1);
    expect(ofKind(next.events, 'threat-strikes')).toEqual([]);
    expect(next.state.peril).toBe(0);
  });

  it('does not strike a threat that does not reach the hex', () => {
    const state = placeCharacter(setup(4), 'scholar', hex(0, 1));
    expect(ofKind(nextDayWithEvents(state).events, 'threat-hit')).toEqual([]);
  });

  it('changes nothing when not chosen: the same threat strikes the creature', () => {
    let state = withThreat(lingering(fieldGame(['scholar', 'keeper'])), 'captors', hex(0, 3), 3);
    state = placeCharacter(state, 'scholar', hex(0, 2));
    expect(nextDayWithEvents(state).state.peril).toBe(3);
  });
});

describe('gather', () => {
  const onNode = (left?: number) =>
    withStance(
      withFeature(
        placeCharacter(chainGame(['engineer']), 'engineer', P),
        P,
        'iron-deposit',
        true,
        left,
      ),
      'engineer',
      'gather',
    );

  it('gathers from the node on the hex with each unspent action', () => {
    const before = onNode();
    const next = nextDayWithEvents(before);
    expect(ofKind(next.events, 'gather')).toHaveLength(3);
    expect(get(next.state, 'engineer').pack['iron']).toBeGreaterThanOrEqual(3);
    expect(next.state.features[hexKey(P)]?.left).toBe((before.features[hexKey(P)]?.left ?? 0) - 3);
  });

  it('stops when the node is spent', () => {
    expect(ofKind(nextDayWithEvents(onNode(1)).events, 'gather')).toHaveLength(1);
  });

  it('falls back to rest when the pack is full', () => {
    const state = withCharacter(onNode(), { ...get(onNode(), 'engineer'), pack: { stone: 6 } });
    expect(ofKind(nextDayWithEvents(state).events, 'gather')).toEqual([]);
    expect(effectiveStance(state, get(state, 'engineer')).id).toBe('rest');
  });
});

describe('wait (end my day)', () => {
  it('is free, marks the character waiting, and keeps the unspent actions for the stance', () => {
    const state = chainGame(['scout']);
    expect(checkAction(state, 'scout', { kind: 'wait' })).toMatchObject({ ok: true, cost: 0 });
    const done = ok(state, 'scout', { kind: 'wait' });
    expect(done.events).toEqual([{ kind: 'wait', characterId: 'scout' }]);
    expect(get(done.state, 'scout')).toMatchObject({ waiting: true, actionsLeft: 3 });
  });

  it('is refused with no actions left', () => {
    const state = withActions(chainGame(['scout']), 'scout', 0);
    expect(checkAction(state, 'scout', { kind: 'wait' })).toMatchObject({
      ok: false,
      reason: 'not-enough-actions',
    });
  });

  it('refuses moving and acting after, but not choosing a stance', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    state = ok(state, 'scout', { kind: 'wait' }).state;
    expect(checkAction(state, 'scout', { kind: 'survey', hex: hex(3, -2) })).toMatchObject({
      ok: false,
      reason: 'waiting',
    });
    expect(checkAction(state, 'scout', { kind: 'wait' })).toMatchObject({ reason: 'waiting' });
    expect(moveAlong(state, 'scout', [hex(3, -2)]).ok).toBe(false);
    const set = ok(state, 'scout', { kind: 'set-stance', stance: 'lie-in-wait' });
    expect(get(set.state, 'scout').stance).toBe('lie-in-wait');
  });

  it('commits what is left to the stance at the tick, then clears at the new day', () => {
    let state = withStance(
      withFeature(placeCharacter(chainGame(['engineer']), 'engineer', P), P, 'iron-deposit', true),
      'engineer',
      'gather',
    );
    state = ok(state, 'engineer', { kind: 'wait' }).state;
    const next = nextDayWithEvents(state);
    expect(ofKind(next.events, 'gather')).toHaveLength(3);
    expect(get(next.state, 'engineer')).toMatchObject({ waiting: false, actionsLeft: 3 });
  });

  it('lets someone wait on a hex for a threat to arrive and strike it first', () => {
    let state = withThreat(lingering(fieldGame(['scholar', 'keeper'])), 'ambush', hex(0, 4), 3);
    state = placeCharacter(state, 'scholar', hex(0, 3));
    state = withStance(state, 'scholar', 'lie-in-wait');
    state = ok(state, 'scholar', { kind: 'wait' }).state;
    const next = nextDayWithEvents(state);
    expect(next.state.threats).toEqual([]);
    expect(get(next.state, 'scholar').struckDay).toBeNull();
  });
});

describe('a quiet tick', () => {
  it('changes no one with the default stance', () => {
    const next = nextDayWithEvents(fieldGame(['scout', 'keeper'], QUIET));
    expect(next.state.characters.map((c) => c.actionsLeft)).toEqual([3, 3]);
  });
});
