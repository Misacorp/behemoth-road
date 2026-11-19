import { describe, expect, it } from 'vitest';
import {
  act,
  type Action,
  actionsHere,
  checkAction,
  entryInto,
  type GameState,
  hex,
  hexKey,
  move,
  nextDay,
  ON_CREATURE,
  planPath,
  toPlayerView,
} from '../src/index.ts';
import { chainGame, placeCharacter, withFeature, withTerrain } from './helpers.ts';

const P = hex(3, -1);

const ok = (state: GameState, id: string, action: Action) => {
  const result = act(state, id, action);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

const stock = (
  state: GameState,
  materials: Record<string, number>,
  items: Record<string, number> = {},
): GameState => ({ ...state, inventory: { materials, items } });

describe('gather', () => {
  it('takes one charge for one action; the yield goes to the team', () => {
    let state = placeCharacter(chainGame(['scout']), 'scout', P);
    state = withFeature(state, P, 'iron-deposit', true);
    const result = ok(state, 'scout', { kind: 'gather' });
    expect(result.state.inventory.materials).toEqual({ iron: 1 });
    expect(result.state.features[hexKey(P)]?.left).toBe(2);
    expect(result.state.characters[0]?.actionsLeft).toBe(2);
    expect(result.events).toEqual([{ kind: 'gather', hex: P, material: 'iron', amount: 1 }]);
  });

  it('gives an engineer twice the yield', () => {
    let state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    state = withFeature(state, P, 'timber-stand', true);
    expect(ok(state, 'engineer', { kind: 'gather' }).state.inventory.materials).toEqual({
      timber: 2,
    });
  });

  it('refuses hidden, spent and missing nodes, riders and the tired', () => {
    const base = placeCharacter(chainGame(['engineer']), 'engineer', P);
    const gather = (s: GameState) => checkAction(s, 'engineer', { kind: 'gather' });
    expect(gather(base)).toEqual({ ok: false, reason: 'nothing-here' });
    expect(gather(withFeature(base, P, 'iron-deposit'))).toEqual({
      ok: false,
      reason: 'nothing-here',
    });
    expect(gather(withFeature(base, P, 'tomb', true))).toEqual({
      ok: false,
      reason: 'nothing-here',
    });
    expect(gather(withFeature(base, P, 'iron-deposit', true, 0))).toEqual({
      ok: false,
      reason: 'depleted',
    });
    const riding = { ...base, characters: [{ ...base.characters[0]!, at: ON_CREATURE }] };
    expect(gather(riding)).toEqual({ ok: false, reason: 'not-on-hex' });
    const tired = withFeature(
      { ...base, characters: [{ ...base.characters[0]!, actionsLeft: 0 }] },
      P,
      'iron-deposit',
      true,
    );
    expect(gather(tired)).toEqual({ ok: false, reason: 'not-enough-actions' });
  });
});

describe('craft', () => {
  it('lets an engineer craft once a day from the team inventory', () => {
    let state = stock(chainGame(['engineer']), { iron: 3, timber: 2, stone: 1 });
    const hook = ok(state, 'engineer', { kind: 'craft', recipe: 'grappling-hook' });
    expect(hook.state.inventory).toEqual({
      materials: { iron: 1, timber: 1, stone: 1 },
      items: { 'grappling-hook': 1 },
    });
    expect(hook.events).toEqual([{ kind: 'craft', item: 'grappling-hook' }]);
    state = hook.state;
    expect(checkAction(state, 'engineer', { kind: 'craft', recipe: 'lantern' })).toEqual({
      ok: false,
      reason: 'crafted-today',
    });
    state = nextDay(state);
    expect(
      ok(state, 'engineer', { kind: 'craft', recipe: 'lantern' }).state.inventory.items,
    ).toEqual({ 'grappling-hook': 1, lantern: 1 });
  });

  it('lets others craft tier-1 recipes for one more of the first material, never tier 2', () => {
    const state = stock(chainGame(['scout']), { iron: 3, timber: 1, 'ancient-alloy': 1 });
    expect(checkAction(state, 'scout', { kind: 'craft', recipe: 'grappling-hook' })).toEqual({
      ok: true,
      cost: 1,
      uses: [
        { material: 'iron', amount: 3 },
        { material: 'timber', amount: 1 },
      ],
      chance: 1,
    });
    expect(checkAction(state, 'scout', { kind: 'craft', recipe: 'climbing-spikes' })).toEqual({
      ok: false,
      reason: 'needs-specialist',
    });
    const short = stock(chainGame(['scout']), { iron: 2, timber: 1 });
    expect(checkAction(short, 'scout', { kind: 'craft', recipe: 'grappling-hook' })).toEqual({
      ok: false,
      reason: 'missing-materials',
    });
  });

  it('refuses unknown recipes and a second copy of a unique item', () => {
    const state = stock(chainGame(['engineer']), { iron: 9, timber: 9 }, { 'grappling-hook': 1 });
    expect(checkAction(state, 'engineer', { kind: 'craft', recipe: 'catapult' })).toEqual({
      ok: false,
      reason: 'unknown-recipe',
    });
    expect(checkAction(state, 'engineer', { kind: 'craft', recipe: 'grappling-hook' })).toEqual({
      ok: false,
      reason: 'already-have',
    });
    expect(checkAction(state, 'engineer', { kind: 'dance' } as unknown as Action)).toEqual({
      ok: false,
      reason: 'invalid-action',
    });
  });
});

describe('work-site', () => {
  const scholarAt = (type: string, items: Record<string, number> = {}) =>
    stock(
      withFeature(placeCharacter(chainGame(['scholar', 'scout']), 'scholar', P), P, type, true),
      {},
      items,
    );

  it('costs two actions; success finds a rare material and spends the site', () => {
    // Try days until a success: the roll is seeded, so this is the same every run.
    let state = scholarAt('tomb');
    for (let day = 0; day < 20; day++) {
      const result = ok(state, 'scholar', { kind: 'work-site' });
      expect(result.state.characters[0]?.actionsLeft).toBe(1);
      const [event] = result.events;
      if (event?.kind === 'find') {
        expect(event).toEqual({ kind: 'find', hex: P, material: 'old-coin', amount: 1 });
        expect(result.state.inventory.materials).toEqual({ 'old-coin': 1 });
        expect(result.state.features[hexKey(P)]?.left).toBe(0);
        expect(checkAction(result.state, 'scholar', { kind: 'work-site' })).toEqual({
          ok: false,
          reason: 'depleted',
        });
        return;
      }
      expect(event).toEqual({ kind: 'site-failed', hex: P });
      expect(result.state.features[hexKey(P)]?.left).toBe(1);
      state = nextDay(state);
      state = placeCharacter(state, 'scholar', P);
    }
    throw new Error('no success in 20 days');
  });

  it('rolls the same for the same day, character and site', () => {
    const state = scholarAt('tomb');
    expect(ok(state, 'scholar', { kind: 'work-site' })).toEqual(
      ok(state, 'scholar', { kind: 'work-site' }),
    );
  });

  it('gives the scholar better chances, and only the scholar tries tier 2, with a lantern', () => {
    const tomb = scholarAt('tomb');
    expect(checkAction(tomb, 'scholar', { kind: 'work-site' })).toMatchObject({ chance: 0.7 });
    const other = placeCharacter(tomb, 'scout', P);
    expect(checkAction(other, 'scout', { kind: 'work-site' })).toMatchObject({ chance: 0.35 });

    const deep = scholarAt('deep-tomb');
    expect(checkAction(deep, 'scholar', { kind: 'work-site' })).toEqual({
      ok: false,
      reason: 'needs-item',
    });
    const lit = scholarAt('deep-tomb', { lantern: 1 });
    expect(checkAction(lit, 'scholar', { kind: 'work-site' })).toMatchObject({
      ok: true,
      chance: 0.5,
      cost: 2,
    });
    expect(checkAction(placeCharacter(lit, 'scout', P), 'scout', { kind: 'work-site' })).toEqual({
      ok: false,
      reason: 'cannot-work',
    });
  });

  it('measures close to the configured chances over many rolls', () => {
    let successes = 0;
    const tries = 400;
    for (let i = 0; i < tries; i++) {
      const state = { ...scholarAt('tomb'), day: i + 1 };
      if (ok(state, 'scholar', { kind: 'work-site' }).events[0]?.kind === 'find') successes++;
    }
    expect(successes / tries).toBeGreaterThan(0.62);
    expect(successes / tries).toBeLessThan(0.78);
  });

  it('cannot be rolled on a player view', () => {
    expect(() =>
      act(toPlayerView(scholarAt('tomb')) as GameState, 'scholar', { kind: 'work-site' }),
    ).toThrow(/seed/);
  });
});

describe('items and movement', () => {
  const cliff = hex(3, -2);
  const cliffy = () =>
    withTerrain(placeCharacter(chainGame(['scout']), 'scout', P), cliff, 'cliff');

  it('lets everyone onto cliffs with the grappling hook, at 2, marked on the path', () => {
    expect(move(cliffy(), 'scout', cliff)).toEqual({ ok: false, reason: 'impassable' });
    const hooked = stock(cliffy(), {}, { 'grappling-hook': 1 });
    expect(entryInto(hooked, cliff)).toEqual({ cost: 2, via: 'grappling-hook' });
    expect(planPath(hooked, 'scout', cliff)).toEqual({
      ok: true,
      steps: [{ place: { kind: 'hex', hex: cliff }, cost: 2, via: 'grappling-hook' }],
      cost: 2,
    });
    const moved = move(hooked, 'scout', cliff);
    expect(moved.ok && moved.state.characters[0]?.actionsLeft).toBe(1);
  });

  it('makes cliffs cost 1 with climbing spikes', () => {
    const spiked = stock(cliffy(), {}, { 'grappling-hook': 1, 'climbing-spikes': 1 });
    expect(entryInto(spiked, cliff)).toEqual({ cost: 1, via: 'climbing-spikes' });
  });

  it('works on a player view too (the inventory is public)', () => {
    const hooked = stock(cliffy(), {}, { 'grappling-hook': 1 });
    expect(entryInto(toPlayerView(hooked), cliff)).toEqual({ cost: 2, via: 'grappling-hook' });
  });
});

describe('actionsHere', () => {
  it('lists what can be done here, with costs, on a view', () => {
    let state = placeCharacter(chainGame(['engineer']), 'engineer', P);
    state = stock(withFeature(state, P, 'river-stones', true), { stone: 1, timber: 1 });
    const options = actionsHere(toPlayerView(state), 'engineer');
    const possible = options.filter((o) => o.check.ok).map((o) => o.action);
    expect(possible).toEqual([{ kind: 'gather' }, { kind: 'craft', recipe: 'lantern' }]);
  });
});
