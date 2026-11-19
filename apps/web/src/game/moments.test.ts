import { createGame, type GameStateView, onHex, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { momentsBetween } from './moments.ts';

const base = toPlayerView(createGame(7, { characterIds: ['me'], artSeed: 1 }));

/** A view with chain parts in the provisional shape (`chain.ts`). */
function withChain(
  v: GameStateView,
  chain: { features?: object; inventory?: object },
  patch: Partial<GameStateView> = {},
): GameStateView {
  return { ...v, ...patch, ...chain };
}

describe('moments between two views', () => {
  it('a newly revealed node or site blooms; one already known does not', () => {
    const before = withChain(base, { features: { '1,1': { kind: 'node', id: 'iron-deposit' } } });
    const after = withChain(base, {
      features: {
        '1,1': { kind: 'node', id: 'iron-deposit' },
        '2,-1': { kind: 'site', id: 'tomb', tier: 1 },
      },
    });
    expect(momentsBetween(before, after, 'me')).toEqual([{ kind: 'reveal', hex: { q: 2, r: -1 } }]);
    expect(momentsBetween(after, after, 'me')).toEqual([]);
  });

  it('an opened site raises the find that came into the inventory', () => {
    const site = { kind: 'site', id: 'tomb', tier: 2 };
    const before = withChain(base, { features: { '0,3': site }, inventory: { iron: 2 } });
    const after = withChain(base, {
      features: { '0,3': { ...site, spent: true } },
      inventory: { iron: 2, 'ancient-alloy': 1 },
    });
    expect(momentsBetween(before, after, 'me')).toEqual([
      { kind: 'find', hex: { q: 0, r: 3 }, item: 'ancient-alloy' },
    ]);
  });

  it('a trap snaps only where it caught you and ended your day', () => {
    const hex = { q: 0, r: 3 };
    const on = (actionsLeft: number) =>
      base.characters.map((c) => ({ ...c, at: onHex(hex), actionsLeft }));
    const before = withChain(base, {}, { characters: on(2) });
    const caught = withChain(
      base,
      { features: { '0,3': { kind: 'trap', id: 'snare' } } },
      { characters: on(0) },
    );
    expect(momentsBetween(before, caught, 'me')).toEqual([{ kind: 'trap', hex }]);
    // A trap revealed elsewhere (by a scout) is a plain reveal, no snap.
    const elsewhere = withChain(
      base,
      { features: { '4,-2': { kind: 'trap', id: 'pitfall' } } },
      { characters: on(2) },
    );
    expect(momentsBetween(before, elsewhere, 'me')).toEqual([
      { kind: 'reveal', hex: { q: 4, r: -2 } },
    ]);
  });

  it('a Milestone 2 view (no chain parts) has no moments', () => {
    expect(momentsBetween(base, { ...base, day: 2 }, 'me')).toEqual([]);
  });
});
