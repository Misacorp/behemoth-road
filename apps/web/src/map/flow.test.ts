import {
  createGame,
  findCharacter,
  hexDistance,
  creatureEdge,
  type Hex,
  isPassable,
  onHex,
  ON_CREATURE,
  placeHex,
  reachablePlaces,
  windowHexes,
  type GameState,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import {
  confirmMove,
  type Flow,
  IDLE,
  isPopover,
  isSelecting,
  openHub,
  planMove,
  shownFlow,
  tap,
  tapHex,
} from './flow.ts';
import { moveOption } from '../game/move.ts';

const ME = { kind: 'me' } as const;

const ID = 'you';
/** A game with the character stepped off the creature onto the hex furthest behind it. */
function offTheCreature(s: GameState): GameState {
  const behind = creatureEdge(s)
    .filter((h) => isPassable(s, h))
    .sort((a, b) => 2 * b.r + b.q - (2 * a.r + a.q))[0]!;
  return { ...s, characters: s.characters.map((c) => ({ ...c, at: onHex(behind) })) };
}
const game = (): GameState => offTheCreature(createGame(20261119, { characterIds: [ID] }));
const me = (s: GameState) => findCharacter(s, ID)!;
const here = (s: GameState): Hex => placeHex(s, me(s).at);

/** A reachable hex costing exactly `cost`. */
function target(s: GameState, cost: number) {
  const found = reachablePlaces(s, ID).find((r) => r.cost === cost && r.place.kind === 'hex');
  if (found?.place.kind !== 'hex') throw new Error(`No hex at cost ${cost}`);
  return found.place.hex;
}

/** The first tap on a card's Move: the planned flow for `to`, from the card opened on it. */
function planned(s: GameState, to: Hex): Flow {
  const card = tapHex(IDLE, s, ID, to);
  const plan = planMove(s, ID, onHex(to), card);
  if (plan === null) throw new Error('No plan');
  return plan;
}

describe('move flow', () => {
  it('tap a tile, tap Move to plan, tap Move again: the core moves the character and spends the cost', () => {
    const s = game();
    const to = target(s, 2);
    // The tap on a tile opens its card; Move is on it with the core's cost.
    const card = tapHex(IDLE, s, ID, to);
    expect(card).toEqual({ kind: 'inspect', hex: to });
    expect(moveOption(s, ID, onHex(to))).toEqual({ cost: 2, plus: false, enabled: true });
    const flow = planMove(s, ID, onHex(to), card);
    expect(flow?.kind).toBe('planned');
    if (flow?.kind !== 'planned') return;
    expect(flow.cost).toBe(2);
    expect(flow.steps[flow.steps.length - 1]!.place).toEqual(onHex(to));
    // The card stays open with Move armed: the route is drawn from the planned flow.
    expect(shownFlow(s, flow)).toEqual({ kind: 'inspect', hex: to });
    const done = confirmMove(flow, s, ID);
    expect(me(done.state).at).toEqual(onHex(to));
    expect(me(done.state).actionsLeft).toBe(s.config.actionsPerDay - 2);
    // Actions remain, so your own card opens for the next thing to do.
    expect(done.flow).toEqual({ kind: 'selected' });
  });

  it('spending every action ends the selection', () => {
    const s = game();
    const done = confirmMove(planned(s, target(s, s.config.actionsPerDay)), s, ID);
    expect(me(done.state).actionsLeft).toBe(0);
    expect(done.flow).toEqual(IDLE);
  });

  it('a planned move is a popover: a tap elsewhere closes it, and a second tap opens that tile', () => {
    const s = game();
    const plan = planned(s, target(s, 1));
    expect(isPopover(plan)).toBe(true);
    expect(isSelecting(plan)).toBe(false);
    expect(me(s).actionsLeft).toBe(s.config.actionsPerDay);
    const other = target(s, 2);
    expect(tapHex(plan, s, ID, other)).toEqual(IDLE);
    expect(tapHex(tapHex(plan, s, ID, other), s, ID, other)).toEqual({
      kind: 'inspect',
      hex: other,
    });
    // Your own figure closes it too, and nothing is spent.
    expect(tap(plan, s, ID, ME)).toEqual(IDLE);
    expect(confirmMove(IDLE, s, ID).state).toBe(s);
  });

  it('a planned move keeps the picker it came from, so back still works', () => {
    const s = game();
    const to = target(s, 1);
    const pick: Flow = { kind: 'pick', hex: to };
    const card: Flow = { kind: 'inspect', hex: to, back: pick };
    const flow = planMove(s, ID, onHex(to), card)!;
    expect(flow).toMatchObject({ kind: 'planned', back: pick });
    expect(shownFlow(s, flow)).toEqual(card);
  });

  it('a tile too far to walk to has Move greyed with the three pips and a plus, and plans nothing', () => {
    const s = game();
    const far = windowHexes(s).find(
      (h) => hexDistance(h, here(s)) > s.config.actionsPerDay + 1 && isPassable(s, h),
    )!;
    const option = moveOption(s, ID, onHex(far));
    expect(option).toMatchObject({
      cost: s.config.actionsPerDay,
      plus: true,
      enabled: false,
      why: 'why:too-far',
    });
    expect(planMove(s, ID, onHex(far), tapHex(IDLE, s, ID, far))).toBeNull();
    // The tap itself just opens its card, selected or not.
    expect(tapHex(IDLE, s, ID, far)).toEqual({ kind: 'inspect', hex: far });
    expect(tapHex({ kind: 'selected' }, s, ID, far)).toEqual({ kind: 'inspect', hex: far });
  });

  it('a tile within a day but not with what is left shows its real cost, greyed, without a plus', () => {
    const s = game();
    const to = target(s, 3);
    const tired: GameState = {
      ...s,
      characters: s.characters.map((c) => ({ ...c, actionsLeft: 1 })),
    };
    expect(moveOption(tired, ID, onHex(to))).toEqual({
      cost: 3,
      plus: false,
      enabled: false,
      why: 'why:not-enough-actions',
    });
    expect(planMove(tired, ID, onHex(to), IDLE)).toBeNull();
  });

  it('offers no Move onto where you stand, and none where there is no way', () => {
    const s = game();
    expect(moveOption(s, ID, onHex(here(s)))).toBeNull();
    expect(moveOption(s, ID, onHex({ q: 999, r: 999 }))).toBeNull();
  });

  it('pinned, Move is greyed with the reason', () => {
    const s = game();
    const pinned: GameState = {
      ...s,
      characters: s.characters.map((c) => ({ ...c, pinnedDay: s.day })),
    };
    expect(moveOption(pinned, ID, onHex(target(s, 1)))).toMatchObject({
      enabled: false,
      why: 'why:pinned',
    });
  });

  it('tapping a hex while idle inspects it; tapping it again closes', () => {
    const s = game();
    const h = { q: 3, r: -1 };
    const open = tapHex(IDLE, s, ID, h);
    expect(open).toEqual({ kind: 'inspect', hex: h });
    expect(tapHex(open, s, ID, h)).toEqual(IDLE);
  });

  it('a tap elsewhere closes an open popover and does nothing more; a second tap opens it', () => {
    const s = game();
    const a = { q: 3, r: -1 };
    const b = { q: 2, r: 1 };
    const open = tapHex(IDLE, s, ID, a);
    expect(isPopover(open)).toBe(true);
    expect(tapHex(open, s, ID, b)).toEqual(IDLE);
    expect(tapHex(tapHex(open, s, ID, b), s, ID, b)).toEqual({ kind: 'inspect', hex: b });
    // Every looking state closes on any map tap, your own figure and the creature included.
    const looking: Flow[] = [
      open,
      { kind: 'pick', hex: a },
      { kind: 'character', id: 'other' },
      { kind: 'threat', id: 'x' },
      { kind: 'settlement', id: 'x' },
      { kind: 'creature' },
      { kind: 'bubble', selecting: false },
    ];
    for (const flow of looking) {
      expect(isPopover(flow)).toBe(true);
      expect(tapHex(flow, s, ID, b)).toEqual(IDLE);
      expect(tap(flow, s, ID, ME)).toEqual(IDLE);
      expect(tap(flow, s, ID, { kind: 'character', id: 'other' })).toEqual(IDLE);
    }
  });

  it('your own card is a selection: the next tap goes on through it and opens that tile', () => {
    const s = game();
    for (const flow of [{ kind: 'selected' }, { kind: 'bubble', selecting: true }] as Flow[]) {
      expect(isPopover(flow)).toBe(false);
      expect(isSelecting(flow)).toBe(true);
    }
    expect(isPopover(IDLE)).toBe(false);
    const to = target(s, 1);
    expect(tapHex({ kind: 'selected' }, s, ID, to)).toEqual({ kind: 'inspect', hex: to });
  });

  it('a plan the state no longer allows is refused by the core and spends nothing', () => {
    const s = game();
    const plan = planned(s, target(s, 3));
    const tired = confirmMove(planned(s, target(s, 1)), s, ID).state;
    const done = confirmMove(plan, tired, ID);
    expect(done.state).toBe(tired);
    expect(done.flow).toEqual(IDLE);
  });

  it('with no actions left, tapping your character inspects its hex instead of selecting', () => {
    const s = game();
    const tired = confirmMove(planned(s, target(s, 3)), s, ID).state;
    expect(me(tired).actionsLeft).toBe(0);
    const spot = here(tired);
    expect(tap(IDLE, tired, ID, ME)).toEqual({ kind: 'inspect', hex: spot });
  });
});

describe('the creature as the hub', () => {
  const riding = (): GameState => createGame(20261119, { characterIds: [ID] });
  const footprint = (s: GameState): Hex[] =>
    windowHexes(s).filter((h) => hexDistance(h, s.creature.centre) <= s.config.creatureRadius);

  it('riding: a tap anywhere on the creature selects you and opens the bubble; again closes', () => {
    const s = riding();
    expect(me(s).at).toEqual(ON_CREATURE);
    for (const h of footprint(s)) {
      const open = tapHex(IDLE, s, ID, h);
      expect(open).toEqual({ kind: 'bubble', selecting: true });
      expect(isSelecting(open)).toBe(true);
      expect(tapHex(open, s, ID, h)).toEqual(IDLE);
    }
  });

  it('riding: a tap on a hex opens its card, and its Move steps off the creature', () => {
    const s = riding();
    const edge = creatureEdge(s).find((h) => isPassable(s, h))!;
    const card = tapHex(tapHex(IDLE, s, ID, s.creature.centre), s, ID, edge);
    expect(card).toEqual({ kind: 'inspect', hex: edge });
    const plan = planMove(s, ID, onHex(edge), card);
    expect(plan).toMatchObject({ kind: 'planned', to: onHex(edge), cost: 1 });
    const done = confirmMove(plan!, s, ID);
    expect(me(done.state).at).toEqual(onHex(edge));
  });

  it('riding and already selected (no bubble): the creature opens the bubble, keeping you selected', () => {
    const s = riding();
    expect(tapHex({ kind: 'selected' }, s, ID, s.creature.centre)).toEqual({
      kind: 'bubble',
      selecting: true,
    });
  });

  it('riding: a tap on the creature while the bubble or the hub card is open closes everything', () => {
    const s = riding();
    for (const open of [{ kind: 'bubble', selecting: true }, openHub()] as const) {
      expect(tapHex(open, s, ID, s.creature.centre)).toEqual(IDLE);
    }
  });

  it('riding with no actions left: the bubble opens without selecting', () => {
    const base = riding();
    const s: GameState = {
      ...base,
      characters: base.characters.map((c) => ({ ...c, actionsLeft: 0 })),
    };
    expect(tapHex(IDLE, s, ID, s.creature.centre)).toEqual({ kind: 'bubble', selecting: false });
  });

  it('not riding: the creature opens the bubble without selecting; the hub entry opens the card', () => {
    const s = game();
    for (const h of footprint(s)) {
      expect(tapHex(IDLE, s, ID, h)).toEqual({ kind: 'bubble', selecting: false });
    }
    expect(tapHex({ kind: 'bubble', selecting: false }, s, ID, s.creature.centre)).toEqual(IDLE);
    expect(openHub()).toEqual({ kind: 'creature' });
    expect(tapHex(openHub(), s, ID, s.creature.centre)).toEqual(IDLE);
  });

  it('not riding: the bubble has the Move that boards for one action, planned and shown as the bubble', () => {
    const s = game();
    const bubble = tapHex(IDLE, s, ID, s.creature.centre);
    expect(bubble).toEqual({ kind: 'bubble', selecting: false });
    expect(moveOption(s, ID, ON_CREATURE)).toEqual({ cost: 1, plus: false, enabled: true });
    const plan = planMove(s, ID, ON_CREATURE, bubble)!;
    expect(plan).toMatchObject({ kind: 'planned', to: ON_CREATURE, cost: 1 });
    expect(shownFlow(s, plan)).toEqual({ kind: 'bubble', selecting: false });
    const done = confirmMove(plan, s, ID);
    expect(me(done.state).at).toEqual(ON_CREATURE);
  });

  it('riding: there is no Move onto the creature you ride', () => {
    const s = riding();
    expect(moveOption(s, ID, ON_CREATURE)).toBeNull();
  });

  it('a tap on your own hex picks your character first', () => {
    const s = game();
    expect(tapHex(IDLE, s, ID, here(s))).toEqual({ kind: 'selected' });
    expect(tapHex({ kind: 'selected' }, s, ID, here(s))).toEqual(IDLE);
  });

  it('crosses the creature in two steps through one Move: board, then step off on the far side', () => {
    const s = game();
    const start = here(s);
    const c = s.creature.centre;
    const far = { q: 2 * c.q - start.q, r: 2 * c.r - start.r };
    expect(isPassable(s, far)).toBe(true);
    const plan = planned(s, far);
    expect(plan.kind).toBe('planned');
    if (plan.kind !== 'planned') return;
    expect(plan.cost).toBe(2);
    expect(plan.steps.map((st) => st.place)).toEqual([ON_CREATURE, onHex(far)]);
    expect(me(confirmMove(plan, s, ID).state).at).toEqual(onHex(far));
  });
});

describe('cards inside the bubble', () => {
  it('a rider opened from the bubble continues in it, and back returns to the bubble', async () => {
    const { openCharacter, goBack, IDLE } = await import('./flow.ts');
    const bubble = { kind: 'bubble', selecting: false } as const;
    const card = openCharacter('pip', bubble);
    expect(card).toEqual({ kind: 'character', id: 'pip', back: bubble });
    expect(goBack(card)).toBe(bubble);
    // A card opened from the map has nothing to go back to.
    expect(goBack(openCharacter('pip'))).toBe(IDLE);
  });
});
