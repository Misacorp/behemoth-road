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
  isExplored,
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
const AROUND_P = [hex(3, -2), hex(4, -2), hex(2, -1), hex(4, -1), hex(2, 0), hex(3, 0)];
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
  it('lists the five stances with distinct ids and icons, rest first', () => {
    expect(STANCES.map((s) => s.id)).toEqual([
      'rest',
      'watch',
      'lie-in-wait',
      'gather',
      'help-aboard',
    ]);
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
    expect(checkAction(state, 'scout', { kind: 'set-stance', stance: 'watch' })).toMatchObject({
      ok: true,
      cost: 0,
    });
    const done = ok(state, 'scout', { kind: 'set-stance', stance: 'watch' });
    expect(done.events).toEqual([{ kind: 'stance', characterId: 'scout', stance: 'watch' }]);
    expect(get(done.state, 'scout')).toMatchObject({ stance: 'watch', actionsLeft: 3 });
    expect(get(nextDayWithEvents(done.state).state, 'scout').stance).toBe('watch');
    expect(checkAction(state, 'scout', { kind: 'set-stance', stance: 'nap' })).toMatchObject({
      ok: false,
      reason: 'unknown-stance',
    });
  });

  it('is public: the player view shows it', () => {
    const state = withStance(chainGame(['scout']), 'scout', 'watch');
    expect(toPlayerView(state).characters[0]).toMatchObject({ stance: 'watch', waiting: false });
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
    // On a hex with no node: gather still rests; help aboard rests off the creature.
    state = placeCharacter(state, 'keeper', P);
    expect(effectiveStance(state, get(state, 'keeper')).id).toBe('rest');
    state = withStance(state, 'keeper', 'help-aboard');
    expect(effectiveStance(state, get(state, 'keeper')).id).toBe('rest');
    // Lie in wait fits on a hex; gather fits on a node.
    state = withStance(state, 'keeper', 'lie-in-wait');
    expect(effectiveStance(state, get(state, 'keeper')).id).toBe('lie-in-wait');
    state = withFeature(withStance(state, 'keeper', 'gather'), P, 'iron-deposit', true);
    expect(effectiveStance(state, get(state, 'keeper')).id).toBe('gather');
  });

  it('falls back for watch once every neighbour is explored', () => {
    let state = withStance(placeCharacter(chainGame(['scout']), 'scout', P), 'scout', 'watch');
    expect(effectiveStance(state, get(state, 'scout')).id).toBe('watch');
    const tiles = { ...state.tiles };
    for (const [key, t] of Object.entries(tiles)) tiles[key] = { ...t, explored: true };
    state = { ...state, tiles };
    expect(effectiveStance(state, get(state, 'scout')).id).toBe('rest');
  });
});

describe('resting', () => {
  const struck = (stance: string) => {
    let state = withThreat(lingering(fieldGame(['scout', 'keeper'])), 'ambush', hex(0, 4), 3);
    state = placeCharacter(state, 'scout', hex(-1, 4));
    state = withStance(state, 'scout', stance);
    return nextDayWithEvents(state);
  };

  it('shakes off being struck: full actions the next day, and no struck day', () => {
    const next = struck('rest');
    expect(ofKind(next.events, 'struck').map((e) => e.characterId)).toEqual(['scout']);
    expect(get(next.state, 'scout')).toMatchObject({ actionsLeft: 3, struckDay: null });
  });

  it('shakes it off after falling back to rest too', () => {
    const next = struck('help-aboard');
    expect(get(next.state, 'scout')).toMatchObject({ actionsLeft: 3, struckDay: null });
  });

  it('does not for a character who watches', () => {
    const next = struck('watch');
    expect(get(next.state, 'scout')).toMatchObject({ actionsLeft: 1, struckDay: 2 });
  });
});

describe('watch', () => {
  const watcher = () =>
    withStance(placeCharacter(chainGame(['scholar']), 'scholar', P), 'scholar', 'watch');
  const withFeatures = (state: GameState, type: string) =>
    AROUND_P.reduce((s, h) => withFeature(s, h, type), state);

  it('explores one unexplored neighbour per unspent action, revealing it for everyone', () => {
    const next = nextDayWithEvents(withFeatures(watcher(), 'iron-deposit'));
    const explored = ofKind(next.events, 'explore');
    expect(explored).toHaveLength(3);
    for (const e of explored) expect(isExplored(next.state, e.hex)).toBe(true);
    expect(ofKind(next.events, 'reveal')).toHaveLength(3);
    for (const e of ofKind(next.events, 'reveal')) {
      expect(toPlayerView(next.state).features[hexKey(e.hex)]?.revealed).toBe(true);
    }
    expect(get(next.state, 'scholar').actionsLeft).toBe(3);
  });

  it('is seeded: the same state gives the same hexes', () => {
    const a = ofKind(nextDayWithEvents(watcher()).events, 'explore').map((e) => hexKey(e.hex));
    const b = ofKind(nextDayWithEvents(watcher()).events, 'explore').map((e) => hexKey(e.hex));
    expect(a).toHaveLength(3);
    expect(a).toEqual(b);
  });

  it('reveals a trap harmlessly', () => {
    const next = nextDayWithEvents(withFeatures(watcher(), 'snare'));
    expect(ofKind(next.events, 'trap')).toEqual([]);
    expect(ofKind(next.events, 'reveal')).toHaveLength(3);
    expect(get(next.state, 'scholar').actionsLeft).toBe(3);
  });

  it('spends only the actions left, and earns XP like surveying (a scout also per hex)', () => {
    let state = withStance(placeCharacter(chainGame(['scout']), 'scout', P), 'scout', 'watch');
    state = withActions(state, 'scout', 2);
    const next = nextDayWithEvents(state);
    expect(ofKind(next.events, 'explore')).toHaveLength(2);
    // Two surveys at 1 XP each, and a scout's 1 XP for each new hex.
    expect(get(next.state, 'scout').skills.xp).toBe(4);
  });

  it('does nothing for a character with no actions left', () => {
    const state = withActions(watcher(), 'scholar', 0);
    expect(ofKind(nextDayWithEvents(state).events, 'explore')).toEqual([]);
  });
});

describe('lie in wait', () => {
  // An ambush at (0, 4) steps to (0, 3) while the creature lingers.
  const setup = (strength: number, role = 'scholar') => {
    let state = withThreat(lingering(fieldGame([role, 'keeper'])), 'ambush', hex(0, 4), strength);
    state = placeCharacter(state, role, hex(0, 3));
    return withStance(state, role, 'lie-in-wait');
  };

  it('strikes a threat that ends on the hex with power once plus one per unspent action, and clears it', () => {
    const next = nextDayWithEvents(setup(4));
    // 1 (other) + 3 unspent actions.
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
    expect(next.state.threats.map((t) => t.strength)).toEqual([5]);
    expect(ofKind(next.events, 'struck').map((e) => e.characterId)).toEqual(['scholar']);
    expect(get(next.state, 'scholar')).toMatchObject({ actionsLeft: 1, struckDay: 2 });
  });

  it('counts only the actions left unspent', () => {
    const state = withActions(setup(4), 'scholar', 1);
    // 1 + 1 = 2: weakened to 2.
    expect(nextDayWithEvents(state).state.threats.map((t) => t.strength)).toEqual([2]);
  });

  it('is stronger for a defender (a role tagged defend)', () => {
    // 2 (defender) + 3 = 5 clears; 1 + 3 = 4 leaves 1.
    expect(nextDayWithEvents(setup(5, 'guardian')).state.threats).toEqual([]);
    expect(nextDayWithEvents(setup(5)).state.threats.map((t) => t.strength)).toEqual([1]);
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

describe('help aboard', () => {
  const striking = (...helpers: string[]) => {
    let state = withThreat(lingering(fieldGame(['scholar', 'keeper'])), 'captors', hex(0, 3), 3);
    for (const id of helpers) state = withStance(state, id, 'help-aboard');
    return state;
  };

  it('becomes defence against a strike on the creature: one point per three unspent actions (a whole day)', () => {
    const next = nextDayWithEvents(striking('scholar', 'keeper'));
    // 3 actions each: 1 point each, so 2 of the 3 held.
    expect(ofKind(next.events, 'threat-strikes')).toEqual([
      { kind: 'threat-strikes', id: 'xcaptors', type: 'captors', damage: 1, held: 2 },
    ]);
  });

  it('counts only actions left, and is weaker than defending', () => {
    const state = withActions(striking('scholar'), 'scholar', 2);
    expect(nextDayWithEvents(state).state.peril).toBe(3);
    // One helper with all 3 actions holds 1; a defending guardian holds defendReduction (2).
    expect(nextDayWithEvents(striking('scholar')).state.peril).toBe(2);
  });

  it('adds up to at most stanceHelpGuardMax over all riders', () => {
    let state = withThreat(
      lingering(fieldGame(['scholar', 'keeper', 'scout', 'envoy'])),
      'captors',
      hex(0, 3),
      5,
    );
    for (const id of ['scholar', 'keeper', 'scout', 'envoy']) {
      state = withStance(state, id, 'help-aboard');
    }
    expect(state.config.stanceHelpGuardMax).toBe(2);
    expect(ofKind(nextDayWithEvents(state).events, 'threat-strikes')[0]).toMatchObject({
      damage: 3,
      held: 2,
    });
  });

  it('does nothing without a threat, and a rider who rests adds none', () => {
    expect(nextDayWithEvents(striking()).state.peril).toBe(3);
  });

  it('has an engineer work on the unlock in progress first', () => {
    let state = fieldGame(['engineer', 'keeper']);
    state = { ...state, project: { unlock: 'grappling-hook', work: 0 } };
    state = withStance(state, 'engineer', 'help-aboard');
    const next = nextDayWithEvents(state);
    expect(ofKind(next.events, 'unlock-progress')).toHaveLength(3);
    expect(next.state.project?.work).toBe(3);
  });

  it("turns an engineer's leftover actions into defence once the unlock is done", () => {
    let state = withThreat(lingering(fieldGame(['engineer', 'keeper'])), 'captors', hex(0, 3), 3);
    state = { ...state, project: { unlock: 'lantern', work: 2 } };
    state = withActions(withStance(state, 'engineer', 'help-aboard'), 'engineer', 4);
    const next = nextDayWithEvents(state);
    expect(next.state.unlocks).toContain('lantern');
    // One action finished the work; three are left: one point of defence.
    expect(ofKind(next.events, 'threat-strikes')[0]).toMatchObject({ damage: 2, held: 1 });
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
      placeCharacter(chainGame(['scholar']), 'scholar', P),
      'scholar',
      'watch',
    );
    state = ok(state, 'scholar', { kind: 'wait' }).state;
    const next = nextDayWithEvents(state);
    expect(ofKind(next.events, 'explore')).toHaveLength(3);
    expect(get(next.state, 'scholar')).toMatchObject({ waiting: false, actionsLeft: 3 });
  });

  it('lets someone wait on a hex for a threat to arrive and strike it first', () => {
    let state = withThreat(lingering(fieldGame(['scholar', 'keeper'])), 'ambush', hex(0, 4), 4);
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
