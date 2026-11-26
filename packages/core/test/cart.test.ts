import { describe, expect, it } from 'vitest';
import {
  act,
  type Action,
  type Cart,
  type ConfigOverrides,
  cartCanEnter,
  checkAction,
  type GameState,
  hex,
  hexKey,
  isCreatureHex,
  isInWindow,
  move,
  moveAlong,
  nextDay,
  nextDayWithEvents,
  onHex,
  planPath,
  reachablePlaces,
  stranded,
  TERRAIN_TYPES,
  toPlayerView,
  UNLOCKS,
} from '../src/index.ts';
import {
  CALM,
  fieldGame,
  P,
  placeCharacter,
  withCharacter,
  withFeature,
  withTerrain,
} from './helpers.ts';

const straight = { ...CALM, veerWeights: { left: 0, right: 0 } };

/** A plains game: `e` (engineer) and `s` (scout) ride the creature. */
const base = (config: ConfigOverrides = CALM): GameState =>
  fieldGame(['engineer', 'scout'], config);

const CART: Cart = { id: 'cart1', hex: P, cargo: {}, puller: null, rider: null };
const withCart = (s: GameState, cart: Partial<Cart> = {}): GameState => ({
  ...s,
  carts: [{ ...CART, ...cart }],
});
const me = (s: GameState, id: string) => s.characters.find((c) => c.id === id)!;
const ok = (s: GameState, id: string, action: Action) => {
  const r = act(s, id, action);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r;
};
const reason = (s: GameState, id: string, action: Action) => {
  const r = checkAction(s, id, action);
  return r.ok ? 'ok' : r.reason;
};
const withPack = (s: GameState, id: string, pack: Record<string, number>): GameState =>
  withCharacter(s, { ...me(s, id), pack });
const next = (h: { q: number; r: number }, dq: number, dr: number) => hex(h.q + dq, h.r + dr);

/** `scout` stands on the cart's hex, the cart there. */
const parked = (): GameState => withCart(placeCharacter(base(), 'scout', P));

describe('the cart: content and building', () => {
  it('is an unlock with vehicle data: 2 timber, 3 work, one seat, never water, cliff, swamp or glass', () => {
    const cart = UNLOCKS.find((u) => u.id === 'cart')!;
    expect(cart).toMatchObject({ work: 3, cost: [{ material: 'timber', amount: 2 }] });
    expect(cart.vehicle?.seats).toBe(1);
    expect(cart.vehicle?.terrainTags).toContain('open');
    for (const t of TERRAIN_TYPES) {
      const rolls = cart.vehicle!.terrainTags.some((tag) => t.tags.includes(tag));
      if (t.tags.some((tag) => ['water', 'steep', 'boggy', 'glass'].includes(tag))) {
        expect(rolls, t.id).toBe(false);
      }
    }
  });

  it('is built like the raft: three work from an engineer riding the creature, then it stands beside it', () => {
    let s: GameState = { ...base(), stores: { timber: 2 } };
    const build: Action = { kind: 'build', unlock: 'cart' };
    s = ok(s, 'engineer', build).state;
    expect(s.stores['timber'] ?? 0).toBe(0);
    expect(s.carts).toEqual([]);
    s = ok(s, 'engineer', build).state;
    const done = ok(s, 'engineer', build);
    expect(done.events.map((e) => e.kind)).toEqual([
      'unlock-progress',
      'unlock-done',
      'cart-built',
    ]);
    expect(done.state.unlocks).not.toContain('cart');
    expect(done.state.project).toBeNull();
    const [cart] = done.state.carts;
    expect(cart).toMatchObject({ cargo: {}, puller: null, rider: null });
    // Beside the footprint, on rollable ground.
    expect(isCreatureHex(done.state, cart!.hex)).toBe(false);
    expect(cart!.hex).toEqual(
      done.events.find((e) => e.kind === 'cart-built' && 'hex' in e)!['hex' as never],
    );
    expect(
      Math.abs(cart!.hex.q - s.creature.centre.q) + Math.abs(cart!.hex.r - s.creature.centre.r),
    ).toBeGreaterThan(0);
  });

  it('is one per party: a second is refused while one stands, and a lost one may be rebuilt', () => {
    const s: GameState = withCart({ ...base(), stores: { timber: 2 } });
    expect(reason(s, 'engineer', { kind: 'build', unlock: 'cart' })).toBe('already-have');
    expect(
      reason({ ...s, config: { ...s.config, cartsMax: 2 } }, 'engineer', {
        kind: 'build',
        unlock: 'cart',
      }),
    ).toBe('ok');
    expect(reason({ ...s, carts: [] }, 'engineer', { kind: 'build', unlock: 'cart' })).toBe('ok');
  });

  it('is refused where nothing rolls: no room', () => {
    let s: GameState = { ...base(), stores: { timber: 2 } };
    for (const key of Object.keys(s.tiles)) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      s = withTerrain(s, { q, r }, 'lake');
    }
    expect(reason(s, 'engineer', { kind: 'build', unlock: 'cart' })).toBe('no-room');
  });

  it('is public: the view carries it', () => {
    const s = withCart(base());
    expect(toPlayerView(s).carts).toEqual([CART]);
  });
});

describe('hitch and unhitch', () => {
  it('hitching costs 1 action on the cart’s hex, unhitching is free', () => {
    const s = parked();
    const hitched = ok(s, 'scout', { kind: 'hitch' });
    expect(me(hitched.state, 'scout').actionsLeft).toBe(2);
    expect(hitched.state.carts[0]!.puller).toBe('scout');
    expect(hitched.events).toEqual([
      { kind: 'hitched', cart: 'cart1', characterId: 'scout', hex: P },
    ]);
    const freed = ok(hitched.state, 'scout', { kind: 'unhitch' });
    expect(me(freed.state, 'scout').actionsLeft).toBe(2);
    expect(freed.state.carts[0]!.puller).toBeNull();
    expect(freed.events[0]).toMatchObject({ kind: 'unhitched' });
  });

  it('is refused off the hex, taken, by the rider, or tired; unhitching needs it hitched', () => {
    const s = parked();
    const away = placeCharacter(s, 'scout', next(P, 1, 0));
    expect(reason(away, 'scout', { kind: 'hitch' })).toBe('no-cart');
    expect(reason(base(), 'scout', { kind: 'hitch' })).toBe('no-cart');
    const taken = placeCharacter(withCart(s, { puller: 'engineer' }), 'scout', P);
    expect(reason(taken, 'scout', { kind: 'hitch' })).toBe('cart-taken');
    expect(reason(withCart(s, { rider: 'scout' }), 'scout', { kind: 'hitch' })).toBe('aboard');
    expect(reason(withCart(s, { puller: 'scout' }), 'scout', { kind: 'hitch' })).toBe(
      'already-have',
    );
    expect(
      reason(withCharacter(s, { ...me(s, 'scout'), actionsLeft: 0 }), 'scout', { kind: 'hitch' }),
    ).toBe('not-enough-actions');
    expect(reason(s, 'scout', { kind: 'unhitch' })).toBe('not-hitched');
  });
});

describe('pulling', () => {
  const pulled = (): GameState => ok(parked(), 'scout', { kind: 'hitch' }).state;

  it('costs the puller cartPullExtra more a step, and the cart goes with them', () => {
    const s = pulled();
    const to = next(P, 1, 0);
    const result = move(s, 'scout', to);
    if (!result.ok) throw new Error(result.reason);
    expect(me(result.state, 'scout').actionsLeft).toBe(s.characters[1]!.actionsLeft - 2);
    expect(result.state.carts[0]!.hex).toEqual(to);
    // Free-standing, a step costs 1.
    const alone = move(parked(), 'scout', to);
    if (!alone.ok) throw new Error(alone.reason);
    expect(me(alone.state, 'scout').actionsLeft).toBe(2);
    expect(alone.state.carts[0]!.hex).toEqual(P);
  });

  it('is a tuning number: the extra is read from the config', () => {
    const s = pulled();
    const dear = { ...s, config: { ...s.config, cartPullExtra: 2 } };
    expect(planPath(dear, 'scout', next(P, 1, 0))).toMatchObject({
      ok: false,
      reason: 'not-enough-actions',
    });
    const free = { ...s, config: { ...s.config, cartPullExtra: 0 } };
    expect(planPath(free, 'scout', next(P, 1, 0))).toMatchObject({ ok: true, cost: 1 });
  });

  it('refuses a step the cart cannot make: swamp, water, cliff, the creature (cart-terrain)', () => {
    let s = pulled();
    for (const [terrain, dq] of [
      ['swamp', 1],
      ['river', 1],
      ['lake', 1],
      ['cliff', 1],
    ] as const) {
      const t = withTerrain(s, next(P, dq, 0), terrain);
      const r = move(t, 'scout', next(P, dq, 0));
      // On foot a lake and a cliff are refused as impassable; the cart refuses the ones that can be walked.
      expect(r.ok ? 'ok' : r.reason, terrain).toBe(
        terrain === 'lake' || terrain === 'cliff' ? 'impassable' : 'cart-terrain',
      );
    }
    s = placeCharacter(s, 'scout', next(s.creature.centre, 2, 0));
    s = withCart(s, { hex: next(s.creature.centre, 2, 0), puller: 'scout' });
    const boarding = move(s, 'scout', onHex(s.creature.centre));
    expect(boarding.ok).toBe(false);
    expect(!boarding.ok && boarding.reason).toBe('cart-terrain');
    expect(cartCanEnter(s, next(P, 1, 0))).toBe(true);
    expect(cartCanEnter(withTerrain(s, next(P, 1, 0), 'swamp'), next(P, 1, 0))).toBe(false);
    expect(cartCanEnter(withTerrain(s, next(P, 1, 0), 'forest'), next(P, 1, 0))).toBe(true);
  });

  it('is accounted for by the path search: dearer steps, no way through bad ground', () => {
    let s = pulled();
    // A wall of swamp between P and the target: on foot a path around costs steps; hitched, the plan avoids it.
    const target = next(P, 3, 0);
    expect(planPath(s, 'scout', target)).toMatchObject({ ok: false, reason: 'not-enough-actions' });
    s = withCharacter(s, { ...me(s, 'scout'), actionsLeft: 6 });
    expect(planPath(s, 'scout', target)).toMatchObject({ ok: true, cost: 6 });
    s = withTerrain(s, target, 'swamp');
    expect(planPath(s, 'scout', target)).toMatchObject({ ok: false, reason: 'cart-terrain' });
    expect(planPath(s, 'scout', onHex(s.creature.centre))).toMatchObject({
      ok: false,
      reason: 'cart-terrain',
    });
    // reachablePlaces counts the extra and leaves out the creature and bad ground.
    const places = reachablePlaces(pulled(), 'scout');
    expect(places.every((p) => p.place.kind === 'hex')).toBe(true);
    expect(places.every((p) => p.cost % 2 === 0)).toBe(true);
    expect(Math.max(...places.map((p) => p.cost))).toBeLessThanOrEqual(3);
  });

  it('moveAlong takes the cart along every step', () => {
    const rich = withCharacter(pulled(), { ...me(pulled(), 'scout'), actionsLeft: 6 });
    const r = moveAlong(rich, 'scout', [next(P, 1, 0), next(P, 2, 0)]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.carts[0]!.hex).toEqual(next(P, 2, 0));
      expect(me(r.state, 'scout').actionsLeft).toBe(2);
    }
    // Two steps are more than the two actions left: nothing moves.
    const poor = moveAlong(pulled(), 'scout', [next(P, 1, 0), next(P, 2, 0)]);
    expect(poor).toMatchObject({ ok: false, reason: 'not-enough-actions', step: 1 });
  });

  it('is not a way to be rescued cheaply: a puller is stranded counted on foot (unhitching is free)', () => {
    const s = pulled();
    expect(stranded(s, 'scout')).toBe(false);
  });
});

describe('boarding', () => {
  it('costs 1 action on the cart’s hex while the seat is free', () => {
    const s = parked();
    const r = ok(s, 'scout', { kind: 'board-cart' });
    expect(r.state.carts[0]!.rider).toBe('scout');
    expect(me(r.state, 'scout').actionsLeft).toBe(2);
    expect(r.events).toEqual([
      { kind: 'boarded-cart', cart: 'cart1', characterId: 'scout', hex: P },
    ]);
    // One seat; the puller and a second rider are refused.
    const crowded = placeCharacter(r.state, 'engineer', P);
    expect(reason(crowded, 'engineer', { kind: 'board-cart' })).toBe('seat-taken');
    expect(reason(withCart(parked(), { puller: 'scout' }), 'scout', { kind: 'board-cart' })).toBe(
      'hitched',
    );
    expect(reason(r.state, 'scout', { kind: 'board-cart' })).toBe('already-have');
    expect(reason(base(), 'scout', { kind: 'board-cart' })).toBe('no-cart');
  });

  it('moves with the cart for nothing, and cannot move otherwise', () => {
    let s = placeCharacter(parked(), 'engineer', P);
    s = ok(s, 'scout', { kind: 'board-cart' }).state;
    s = ok(s, 'engineer', { kind: 'hitch' }).state;
    const to = next(P, 1, 0);
    const r = move(s, 'engineer', to);
    if (!r.ok) throw new Error(r.reason);
    // The rider's place follows the cart; their actions are untouched.
    expect(me(r.state, 'scout').at).toEqual(onHex(to));
    expect(me(r.state, 'scout').actionsLeft).toBe(2);
    expect(me(r.state, 'engineer').actionsLeft).toBe(3 - 1 - 2);
    // Aboard, the rider cannot step themselves.
    const stuck = move(r.state, 'scout', next(to, 1, 0));
    expect(!stuck.ok && stuck.reason).toBe('aboard');
    expect(planPath(r.state, 'scout', next(to, 1, 0))).toMatchObject({
      ok: false,
      reason: 'aboard',
    });
    expect(reachablePlaces(r.state, 'scout')).toEqual([]);
  });

  it('lets the rider still act on the hex they are on, and leaving is free', () => {
    let s = withFeature(parked(), P, 'iron-deposit', true);
    s = ok(s, 'scout', { kind: 'board-cart' }).state;
    const gathered = ok(s, 'scout', { kind: 'gather' });
    expect(me(gathered.state, 'scout').pack).toEqual({ iron: 1 });
    const left = ok(gathered.state, 'scout', { kind: 'leave-cart' });
    expect(left.state.carts[0]!.rider).toBeNull();
    expect(me(left.state, 'scout').actionsLeft).toBe(me(gathered.state, 'scout').actionsLeft);
    expect(left.events[0]).toMatchObject({ kind: 'left-cart' });
    expect(reason(left.state, 'scout', { kind: 'leave-cart' })).toBe('not-aboard');
    // Out of the seat they walk again.
    expect(move(left.state, 'scout', next(P, 1, 0)).ok).toBe(true);
  });
});

describe('load and unload', () => {
  it('moves material between the pack and the cart for no actions, on its hex or beside it', () => {
    let s = withPack(parked(), 'scout', { timber: 3, stone: 1 });
    const loaded = ok(s, 'scout', { kind: 'load', material: 'timber', amount: 2 });
    expect(loaded.state.carts[0]!.cargo).toEqual({ timber: 2 });
    expect(me(loaded.state, 'scout').pack).toEqual({ timber: 1, stone: 1 });
    expect(me(loaded.state, 'scout').actionsLeft).toBe(3);
    expect(loaded.events).toEqual([
      {
        kind: 'loaded',
        cart: 'cart1',
        characterId: 'scout',
        hex: P,
        material: 'timber',
        amount: 2,
      },
    ]);
    // Next to the cart works too.
    s = placeCharacter(loaded.state, 'scout', next(P, 1, 0));
    const back = ok(s, 'scout', { kind: 'unload', material: 'timber', amount: 1 });
    expect(back.state.carts[0]!.cargo).toEqual({ timber: 1 });
    expect(me(back.state, 'scout').pack).toEqual({ timber: 2, stone: 1 });
    // Two hexes off is too far.
    const far = placeCharacter(s, 'scout', next(P, 2, 0));
    expect(reason(far, 'scout', { kind: 'unload', material: 'timber', amount: 1 })).toBe('no-cart');
  });

  it('keeps to the pack’s limit and the cart’s capacity', () => {
    const s = withPack(parked(), 'scout', { timber: 5 });
    const stuffed = withCart(s, { cargo: { stone: 6 } });
    expect(reason(stuffed, 'scout', { kind: 'load', material: 'timber', amount: 3 })).toBe(
      'cart-full',
    );
    expect(reason(stuffed, 'scout', { kind: 'load', material: 'timber', amount: 2 })).toBe('ok');
    expect(reason(s, 'scout', { kind: 'load', material: 'timber', amount: 6 })).toBe('no-material');
    expect(reason(s, 'scout', { kind: 'load', material: 'iron', amount: 1 })).toBe('no-material');
    // A pack of 5 has one unit of room (capacity 6).
    const full = withCart(s, { cargo: { stone: 3 } });
    expect(reason(full, 'scout', { kind: 'unload', material: 'stone', amount: 2 })).toBe(
      'pack-full',
    );
    expect(reason(full, 'scout', { kind: 'unload', material: 'stone', amount: 1 })).toBe('ok');
    expect(reason(full, 'scout', { kind: 'unload', material: 'iron', amount: 1 })).toBe(
      'cart-empty',
    );
    expect(reason(s, 'scout', { kind: 'load', material: 'nonsense', amount: 1 })).toBe(
      'invalid-action',
    );
    expect(reason(s, 'scout', { kind: 'load', material: 'timber', amount: 0 })).toBe(
      'invalid-action',
    );
    expect(reason(s, 'scout', { kind: 'load', material: 'timber', amount: 1.5 })).toBe(
      'invalid-action',
    );
    expect(reason(base(), 'scout', { kind: 'load', material: 'timber', amount: 1 })).toBe(
      'no-cart',
    );
  });

  it('from the creature, unloading puts the goods straight into the stores', () => {
    const edge = next(base().creature.centre, 2, 0);
    let s = withCart(base(), { hex: edge, cargo: { timber: 4 } });
    expect(me(s, 'engineer').at.kind).toBe('creature');
    const r = ok(s, 'engineer', { kind: 'unload', material: 'timber', amount: 4 });
    s = r.state;
    expect(s.stores).toEqual({ timber: 4 });
    expect(s.carts[0]!.cargo).toEqual({});
    expect(me(s, 'engineer').pack).toEqual({});
    expect(r.events.map((e) => e.kind)).toEqual(['unloaded', 'deposit']);
  });
});

describe('the day tick', () => {
  it('never moves a cart in the window, whatever the stances or who is hitched', () => {
    let s = withCart(placeCharacter(base(straight), 'scout', P));
    s = ok(s, 'scout', { kind: 'hitch' }).state;
    s = withCharacter(s, { ...me(s, 'scout'), stance: 'rest' });
    const after = nextDay(s);
    expect(after.carts[0]!.hex).toEqual(P);
    expect(after.carts[0]!.puller).toBe('scout');
    expect(me(after, 'scout').at).toEqual(onHex(P));
    expect(me(after, 'scout').actionsLeft).toBe(3);
  });

  it('loses a cart left outside the window past the grace days, with its cargo and its rider', () => {
    const config = { ...straight, graceDays: 0 };
    const behind = hex(0, 7);
    let s: GameState = base(config);
    s = withTerrain(s, behind, 'plains');
    s = withCart(placeCharacter(s, 'scout', behind), {
      hex: behind,
      cargo: { timber: 3 },
      rider: 'scout',
    });
    // The tile is not in the window yet, so make it known and seen: the creature is at the origin.
    s = {
      ...s,
      tiles: {
        ...s.tiles,
        [hexKey(behind)]: {
          visibility: 'seen',
          terrain: 'plains',
          explored: true,
          leftWindowOnDay: 1,
        },
      },
    };
    const { state, events } = nextDayWithEvents(s);
    expect(state.carts).toEqual([]);
    expect(me(state, 'scout').status).toBe('lost');
    const lost = events.find((e) => e.kind === 'cart-lost');
    expect(lost).toEqual({ kind: 'cart-lost', cart: 'cart1', hex: behind, cargo: { timber: 3 } });
    expect(events.some((e) => e.kind === 'lost')).toBe(true);
    expect(isInWindow(state, behind)).toBe(false);
  });

  it('keeps a cart on a grace hex for its grace day (like a character)', () => {
    const behind = hex(0, 7);
    let s: GameState = base(straight);
    s = {
      ...s,
      tiles: {
        ...s.tiles,
        [hexKey(behind)]: {
          visibility: 'seen',
          terrain: 'plains',
          explored: true,
          leftWindowOnDay: 2,
        },
      },
    };
    s = withCart(s, { hex: behind });
    expect(s.config.graceDays).toBeGreaterThan(0);
    const after = nextDay(s);
    expect(after.carts).toHaveLength(1);
    expect(after.carts[0]!.hex).toEqual(behind);
    expect(nextDay(after).carts).toEqual([]);
  });

  it('pushes a cart the creature walks onto to the nearest free rollable hex; its people are picked up', () => {
    // The creature walks north: its footprint will cover (0, -2).
    const under = hex(0, -2);
    let s: GameState = base(straight);
    s = placeCharacter(placeCharacter(s, 'scout', under), 'engineer', under);
    s = withCart(s, { hex: under, puller: 'engineer', rider: 'scout' });
    const { state, events } = nextDayWithEvents(s);
    expect(isCreatureHex(state, under)).toBe(true);
    const cart = state.carts[0]!;
    expect(isCreatureHex(state, cart.hex)).toBe(false);
    expect(isInWindow(state, cart.hex)).toBe(true);
    expect(cartCanEnter(state, cart.hex)).toBe(true);
    // Both were hauled aboard, so they let go of it.
    expect(me(state, 'scout').at.kind).toBe('creature');
    expect(me(state, 'engineer').at.kind).toBe('creature');
    expect(cart.puller).toBeNull();
    expect(cart.rider).toBeNull();
    expect(events.filter((e) => e.kind === 'unhitched' || e.kind === 'left-cart')).toHaveLength(2);
    // The same every time.
    expect(nextDay(s).carts).toEqual(state.carts);
  });

  it('keeps the cargo of a pushed cart', () => {
    const under = hex(0, -2);
    let s: GameState = base(straight);
    s = withCart(s, { hex: under, cargo: { stone: 2 } });
    const after = nextDay(s);
    expect(after.carts[0]!.cargo).toEqual({ stone: 2 });
    expect(after.carts[0]!.hex).not.toEqual(under);
  });
});

describe('the cart and the tow line', () => {
  it('a hitched or seated character hauled aboard the creature lets go of the cart', () => {
    let s: GameState = base(straight);
    s = { ...s, unlocks: ['towline'] };
    s = nextDay(s);
    const out = hex(0, 6);
    s = {
      ...s,
      tiles: {
        ...s.tiles,
        [hexKey(out)]: {
          visibility: 'seen',
          terrain: 'plains',
          explored: true,
          leftWindowOnDay: 2,
        },
      },
    };
    s = withCart(placeCharacter(s, 'scout', out), { hex: out, puller: 'scout' });
    s = ok(s, 'engineer', { kind: 'throw-line', to: 'scout' }).state;
    const r = ok(s, 'scout', { kind: 'grab-line' });
    expect(me(r.state, 'scout').at.kind).toBe('creature');
    expect(r.state.carts[0]!.puller).toBeNull();
    expect(r.state.carts[0]!.hex).toEqual(out);
  });
});

describe('actionsHere offers the cart actions', () => {
  it('lists hitch, board and the loads that fit', async () => {
    const { actionsHere } = await import('../src/index.ts');
    const s = withPack(parked(), 'scout', { timber: 2 });
    const kinds = actionsHere(s, 'scout').map((a) => a.action.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['hitch', 'unhitch', 'board-cart', 'leave-cart', 'load']),
    );
  });
});
