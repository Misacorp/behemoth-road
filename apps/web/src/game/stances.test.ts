import { createGame, type GameState, hex, onHex, STANCES, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { characterArts } from '../map/cells.ts';
import { actingStance, canWait, stanceIcon, stanceView, waitTap } from './stances.ts';

const game = (): GameState => createGame(7, { characterIds: ['a', 'b'] });
const edit = (state: GameState, id: string, change: object): GameState => ({
  ...state,
  characters: state.characters.map((c) => (c.id === id ? { ...c, ...change } : c)),
});
const view = (state: GameState) => toPlayerView(state);
const find = (state: GameState, id: string) => view(state).characters.find((c) => c.id === id)!;

describe('the stance control', () => {
  it('lists the stances in content order, marking the chosen one', () => {
    const state = game();
    const v = stanceView(view(state), find(state, 'a'));
    expect(v.choices.map((c) => c.id)).toEqual(STANCES.map((s) => s.id));
    expect(v.choices.filter((c) => c.chosen).map((c) => c.id)).toEqual(['rest']);
    expect(v.chosen).toBe('rest');
    expect(v.icon).toBe(stanceIcon('rest'));
    expect(v.fallback).toBe(false);
  });

  it('shows a stance that does not fit where you stand as falling back, riding or not', () => {
    // A rider who chose to lie in wait: nowhere to lie in wait; nor is there a node to gather from.
    let state = edit(game(), 'a', { stance: 'lie-in-wait' });
    let v = stanceView(view(state), find(state, 'a'));
    expect(v).toMatchObject({ chosen: 'lie-in-wait', fallback: true });
    expect(v.choices.map((c) => [c.id, c.fits])).toEqual([
      ['rest', true],
      ['lie-in-wait', false],
      ['gather', false],
    ]);
    // Out on a hex, lie in wait fits (gather still needs a node).
    state = edit(state, 'a', { at: onHex(hex(3, -1)) });
    v = stanceView(view(state), find(state, 'a'));
    expect(v.fallback).toBe(false);
    expect(v.choices.find((c) => c.id === 'gather')).toMatchObject({ fits: false });
  });
});

describe('the mark others see', () => {
  const out = (state: GameState, id: string, stance: string): GameState =>
    edit(state, id, { at: onHex(hex(3, -1)), stance });

  it('shows only a stance that is doing something, and the one that acts (after any fallback)', () => {
    let state = out(game(), 'a', 'lie-in-wait');
    expect(actingStance(view(state), find(state, 'a'))).toBe('lie-in-wait');
    expect(actingStance(view(state), find(state, 'b'))).toBeNull();
    // Riding, the same choice falls back to rest: no mark.
    state = edit(state, 'a', { at: { kind: 'creature' } });
    expect(actingStance(view(state), find(state, 'a'))).toBeNull();
  });

  it('is on the figure on the map, with the hourglass for an ended day', () => {
    const state = edit(out(game(), 'a', 'lie-in-wait'), 'b', { waiting: true });
    const arts = characterArts(view(state));
    expect(arts.find((a) => a.id === 'a')?.marks).toEqual({ stance: stanceIcon('lie-in-wait') });
    expect(arts.find((a) => a.id === 'b')?.marks).toEqual({ waiting: true });
  });

  it('is absent for the default', () => {
    expect(characterArts(view(game())).every((a) => a.marks === undefined)).toBe(true);
  });
});

describe('the wait button', () => {
  it('is possible with actions left, until the day is ended', () => {
    const state = game();
    expect(canWait(find(state, 'a'))).toBe(true);
    expect(canWait(find(edit(state, 'a', { actionsLeft: 0 }), 'a'))).toBe(false);
    expect(canWait(find(edit(state, 'a', { waiting: true }), 'a'))).toBe(false);
    expect(canWait(find(edit(state, 'a', { status: 'lost' }), 'a'))).toBe(false);
    expect(canWait(undefined)).toBe(false);
  });
});

describe('the wait button taps', () => {
  it('arms on the first tap and ends the day on the second', () => {
    expect(waitTap(false, true)).toEqual({ armed: true, fire: false });
    expect(waitTap(true, true)).toEqual({ armed: false, fire: true });
  });

  it('does nothing when it is not possible', () => {
    expect(waitTap(false, false)).toEqual({ armed: false, fire: false });
    expect(waitTap(true, false)).toEqual({ armed: false, fire: false });
  });
});
