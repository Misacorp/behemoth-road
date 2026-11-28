/** Where the r13 branches meet: the cart with the hazards, and the cart with pinned characters. */
import { describe, expect, it } from 'vitest';
import {
  act,
  type Action,
  type Cart,
  cartCanEnter,
  checkAction,
  type GameState,
  hex,
  moveAlong,
  oddsOf,
  TERRAIN_TYPES,
  UNLOCKS,
} from '../src/index.ts';
import {
  fieldGame,
  P,
  placeCharacter,
  plain,
  QUIET,
  withCharacter,
  withTerrain,
  withThreat,
} from './helpers.ts';

const me = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const reason = (s: GameState, id: string, action: Action) => {
  const r = checkAction(s, id, action);
  return r.ok ? 'ok' : r.reason;
};
const CART: Cart = { id: 'cart1', hex: P, cargo: {}, puller: null, rider: null };

describe('the cart and the hazards', () => {
  it('never rolls onto glass waste or a poisoned lake, and shares no terrain tag with them', () => {
    const tags = UNLOCKS.find((u) => u.vehicle)!.vehicle!.terrainTags;
    for (const id of ['glass-waste', 'poisoned-lake']) {
      const terrain = TERRAIN_TYPES.find((t) => t.id === id)!;
      expect(
        tags.some((t) => terrain.tags.includes(t)),
        id,
      ).toBe(false);
      const target = hex(P.q + 1, P.r);
      const s = withTerrain(fieldGame(['scout']), target, id);
      expect(cartCanEnter(s, target), id).toBe(false);
    }
    // Plain ground is still fine.
    expect(cartCanEnter(fieldGame(['scout']), hex(P.q + 1, P.r))).toBe(true);
  });

  it('a puller cannot haul it onto glass waste', () => {
    let s: GameState = { ...fieldGame(['scout']), carts: [{ ...CART, puller: 'scout' }] };
    s = placeCharacter(s, 'scout', P);
    s = withTerrain(s, hex(P.q + 1, P.r), 'glass-waste');
    const r = moveAlong(s, 'scout', [hex(P.q + 1, P.r)]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('cart-terrain');
  });
});

describe('the cart and pinned characters', () => {
  const pinnedWith = (cart: Partial<Cart>): GameState => {
    let s = fieldGame(['scout', 'engineer']);
    s = placeCharacter(s, 'scout', P);
    s = withCharacter(s, { ...me(s, 'scout'), pack: { timber: 1 } });
    s = { ...s, carts: [{ ...CART, ...cart }] };
    return withCharacter(s, { ...me(s, 'scout'), pinnedDay: s.day });
  };

  it('cannot hitch, board, pull, load or unload; stance and skill picks stay open', () => {
    const s = pinnedWith({});
    const refused: Action[] = [
      { kind: 'hitch' },
      { kind: 'board-cart' },
      { kind: 'load', material: 'timber', amount: 1 },
      { kind: 'unload', material: 'timber', amount: 1 },
      { kind: 'unhitch' },
      { kind: 'leave-cart' },
    ];
    for (const a of refused) expect(reason(s, 'scout', a), a.kind).toBe('pinned');
    expect(reason(s, 'scout', { kind: 'set-stance', stance: 'ambush' })).not.toBe('pinned');
    expect(reason(s, 'scout', { kind: 'struggle' })).toBe('ok');
    const walk = moveAlong(s, 'scout', [hex(P.q + 1, P.r)]);
    expect(!walk.ok && walk.reason).toBe('pinned');
  });

  const SLIDE = hex(P.q + 1, P.r - 1);
  const struck = (cart: Partial<Cart>, fall = 1): GameState => {
    let s = withThreat(
      fieldGame(['scout', 'engineer'], { ...QUIET, slideFallChance: fall }),
      'rockslide',
      SLIDE,
      6,
      'slide',
    );
    s = placeCharacter(s, 'scout', P);
    return { ...s, carts: [{ ...CART, ...cart }] };
  };

  it('a puller who is buried is unhitched, the cart staying where it stands', () => {
    const r = act(struck({ puller: 'scout' }), 'scout', { kind: 'strike', threat: 'slide' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(me(r.state, 'scout').pinnedDay).toBeDefined();
    expect(r.state.carts[0]).toMatchObject({ puller: null, hex: P });
    expect(plain(r.events).map((e) => e.kind)).toEqual(['threat-hit', 'pinned', 'unhitched']);
  });

  it('a rider who is buried leaves the seat', () => {
    const r = act(struck({ rider: 'scout' }), 'scout', { kind: 'strike', threat: 'slide' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.carts[0]).toMatchObject({ rider: null, hex: P });
    expect(plain(r.events).map((e) => e.kind)).toEqual(['threat-hit', 'pinned', 'left-cart']);
  });

  it('a strike that does not bury leaves the puller hitched', () => {
    const r = act(struck({ puller: 'scout' }, 0), 'scout', { kind: 'strike', threat: 'slide' });
    expect(r.ok && r.state.carts[0]?.puller).toBe('scout');
  });
});

describe('scree-field rockslides', () => {
  it('still fall on their striker, with the public odds of a fall', () => {
    const s0 = withThreat(
      fieldGame(['scout'], { ...QUIET, slideFallChance: 1 }),
      'rockslide',
      hex(P.q + 1, P.r - 1),
      6,
      'slide',
    );
    const s = placeCharacter(s0, 'scout', P);
    const odds = oddsOf(s, 'scout', { kind: 'strike', threat: 'slide' });
    expect(odds).toMatchObject({ failureKind: 'buried' });
    expect(odds?.failure).toBeCloseTo(1);
    const r = act(s, 'scout', { kind: 'strike', threat: 'slide' });
    expect(r.ok && me(r.state, 'scout').pinnedDay).toBeDefined();
  });
});
