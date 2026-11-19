import { createGame, type GameStateView, onHex, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { momentsBetween, momentsFromEvents } from './moments.ts';

const base = toPlayerView(createGame(7, { characterIds: ['me'], artSeed: 1 }));
const shown = (type: string, left = 1) => ({ type, revealed: true, left });

function view(patch: Partial<GameStateView>): GameStateView {
  return { ...base, ...patch };
}

describe('moments between two views', () => {
  it('a newly revealed node or site blooms; one already known does not', () => {
    const before = view({ features: { '1,1': shown('iron-deposit', 3) } });
    const after = view({ features: { '1,1': shown('iron-deposit', 3), '2,-1': shown('tomb') } });
    expect(momentsBetween(before, after, 'me')).toEqual([{ kind: 'reveal', hex: { q: 2, r: -1 } }]);
    expect(momentsBetween(after, after, 'me')).toEqual([]);
  });

  it('an opened site raises the material that came into the inventory', () => {
    const before = view({
      features: { '0,3': shown('deep-tomb') },
      inventory: { materials: { iron: 2 }, items: {} },
    });
    const after = view({
      features: { '0,3': shown('deep-tomb', 0) },
      inventory: { materials: { iron: 2, 'ancient-alloy': 1 }, items: {} },
    });
    expect(momentsBetween(before, after, 'me')).toEqual([
      { kind: 'find', hex: { q: 0, r: 3 }, item: 'ancient-alloy' },
    ]);
  });

  it('a trap snaps only where it caught you and ended your day', () => {
    const hex = { q: 0, r: 3 };
    const on = (actionsLeft: number) =>
      base.characters.map((c) => ({ ...c, at: onHex(hex), actionsLeft }));
    const before = view({ characters: on(2) });
    const caught = view({ features: { '0,3': shown('snare') }, characters: on(0) });
    expect(momentsBetween(before, caught, 'me')).toEqual([{ kind: 'trap', hex }]);
    // A trap revealed elsewhere (by a scout) is a plain reveal, no snap.
    const elsewhere = view({ features: { '4,-2': shown('pitfall') }, characters: on(2) });
    expect(momentsBetween(before, elsewhere, 'me')).toEqual([
      { kind: 'reveal', hex: { q: 4, r: -2 } },
    ]);
  });

  it('a view with no chain changes has no moments', () => {
    expect(momentsBetween(base, { ...base, day: 2 }, 'me')).toEqual([]);
  });
});

describe('moments from the core events', () => {
  it('maps reveal, trap and find; skips sense, gather, craft and unknown kinds', () => {
    const hex = { q: 1, r: 0 };
    expect(
      momentsFromEvents([
        { kind: 'sense', hex },
        { kind: 'reveal', hex },
        { kind: 'gather', hex, material: 'iron' },
        { kind: 'trap', hex },
        { kind: 'find', hex, material: 'ancient-alloy' },
        { kind: 'craft' },
        { kind: 'meteor', hex },
      ]),
    ).toEqual([
      { kind: 'reveal', hex },
      { kind: 'trap', hex },
      { kind: 'find', hex, item: 'ancient-alloy' },
    ]);
  });
});
