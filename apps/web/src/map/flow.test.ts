import {
  createGame,
  findCharacter,
  hexDistance,
  creatureEdge,
  type Hex,
  isPassable,
  onHex,
  placeHex,
  reachablePlaces,
  windowHexes,
  type GameState,
} from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { confirmMove, type Flow, IDLE, tapHex } from './flow.ts';

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

describe('move flow', () => {
  it('select, plan, confirm: the core moves the character and spends the cost', () => {
    const s = game();
    let flow: Flow = tapHex(IDLE, s, ID, here(s));
    expect(flow).toEqual({ kind: 'selected' });
    const to = target(s, 2);
    flow = tapHex(flow, s, ID, to);
    expect(flow.kind).toBe('planned');
    if (flow.kind !== 'planned') return;
    expect(flow.cost).toBe(2);
    expect(flow.steps[flow.steps.length - 1]!.place).toEqual(onHex(to));
    const done = confirmMove(flow, s, ID);
    expect(me(done.state).at).toEqual(onHex(to));
    expect(me(done.state).actionsLeft).toBe(s.config.actionsPerDay - 2);
    // Actions remain, so the character stays selected for the next move.
    expect(done.flow).toEqual({ kind: 'selected' });
  });

  it('spending every action ends the selection', () => {
    const s = game();
    const plan = tapHex({ kind: 'selected' }, s, ID, target(s, s.config.actionsPerDay));
    const done = confirmMove(plan, s, ID);
    expect(me(done.state).actionsLeft).toBe(0);
    expect(done.flow).toEqual(IDLE);
  });

  it('tapping another reachable hex changes the plan; nothing is spent until confirm', () => {
    const s = game();
    const a = tapHex({ kind: 'selected' }, s, ID, target(s, 1));
    const b = tapHex(a, s, ID, target(s, 2));
    expect(b.kind).toBe('planned');
    expect(b).not.toEqual(a);
    expect(me(s).actionsLeft).toBe(s.config.actionsPerDay);
  });

  it('tapping your character again, or an unreachable hex, cancels and spends nothing', () => {
    const s = game();
    const planned = tapHex({ kind: 'selected' }, s, ID, target(s, 1));
    expect(tapHex(planned, s, ID, here(s))).toEqual(IDLE);
    const far = windowHexes(s).find((h) => hexDistance(h, here(s)) > s.config.actionsPerDay)!;
    expect(tapHex(planned, s, ID, far)).toEqual({ kind: 'inspect', hex: far });
    expect(confirmMove(IDLE, s, ID).state).toBe(s);
    expect(confirmMove({ kind: 'inspect', hex: far }, s, ID).state).toBe(s);
  });

  it('tapping a hex while idle inspects it; tapping it again closes', () => {
    const s = game();
    const h = { q: 3, r: -1 };
    const open = tapHex(IDLE, s, ID, h);
    expect(open).toEqual({ kind: 'inspect', hex: h });
    expect(tapHex(open, s, ID, h)).toEqual(IDLE);
  });

  it('a plan the state no longer allows is refused by the core and spends nothing', () => {
    const s = game();
    const planned = tapHex({ kind: 'selected' }, s, ID, target(s, 3));
    const tired = confirmMove(tapHex({ kind: 'selected' }, s, ID, target(s, 1)), s, ID).state;
    const done = confirmMove(planned, tired, ID);
    expect(done.state).toBe(tired);
    expect(done.flow).toEqual(IDLE);
  });

  it('with no actions left, tapping your character inspects its hex instead of selecting', () => {
    const s = game();
    const tired = confirmMove(tapHex({ kind: 'selected' }, s, ID, target(s, 3)), s, ID).state;
    expect(me(tired).actionsLeft).toBe(0);
    const spot = here(tired);
    expect(tapHex(IDLE, tired, ID, spot)).toEqual({ kind: 'inspect', hex: spot });
  });
});
