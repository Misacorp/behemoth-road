import { createGame, type GameStateView, onHex, toPlayerView } from '@behemoth-road/core';
import { describe, expect, it } from 'vitest';
import { momentsBetween, momentsFromEvents } from './moments.ts';

const base = toPlayerView(createGame(7, { characterIds: ['me'], artSeed: 1 }));
const shown = (type: string, left = 1) => ({ type, revealed: true, left });
const centre = base.creature.centre;

function view(patch: Partial<GameStateView>): GameStateView {
  return { ...base, ...patch };
}

describe('moments between two views', () => {
  it('a newly explored hex lifts its veil; a new feature blooms; known ones do not', () => {
    const key = Object.keys(base.tiles).find((k) => !base.tiles[k]!.explored)!;
    const [q, r] = key.split(',').map(Number) as [number, number];
    const tiles = { ...base.tiles, [key]: { ...base.tiles[key]!, explored: true } };
    const after = view({ tiles, features: { [key]: shown('iron-deposit', 3) } });
    expect(momentsBetween(base, after, 'me')).toEqual([
      { kind: 'explore', hex: { q, r } },
      { kind: 'reveal', hex: { q, r } },
    ]);
    expect(momentsBetween(after, after, 'me')).toEqual([]);
  });

  it('an opened site raises the material that came into a pack', () => {
    const me = base.characters[0]!;
    const before = view({ features: { '0,3': shown('deep-tomb') } });
    const after = view({
      features: { '0,3': shown('deep-tomb', 0) },
      characters: [{ ...me, pack: { 'ancient-alloy': 1 } }],
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
    const elsewhere = view({ features: { '4,-2': shown('pitfall') }, characters: on(2) });
    expect(momentsBetween(before, elsewhere, 'me')).toEqual([
      { kind: 'reveal', hex: { q: 4, r: -2 } },
    ]);
  });

  it('stores growing and a finished unlock show on the creature', () => {
    const after = view({ stores: { iron: 2 }, unlocks: ['lantern'] });
    expect(momentsBetween(base, after, 'me')).toEqual([
      { kind: 'deposit', hex: centre, item: 'iron' },
      { kind: 'unlock', hex: centre, item: 'lantern' },
    ]);
  });
});

describe('moments from the core events', () => {
  it('maps explore, survey, reveal, trap, find, deposit and unlock-done; skips the rest', () => {
    const hex = { q: 1, r: 0 };
    expect(
      momentsFromEvents(
        [
          { kind: 'survey', hex },
          { kind: 'explore', hex },
          { kind: 'reveal', hex },
          { kind: 'gather', hex, material: 'iron' },
          { kind: 'trap', hex },
          { kind: 'find', hex, material: 'ancient-alloy' },
          { kind: 'deposit', materials: { iron: 1, timber: 2 } },
          { kind: 'unlock-progress', unlock: 'lantern' },
          { kind: 'unlock-done', unlock: 'lantern' },
          { kind: 'meteor', hex },
        ],
        centre,
      ),
    ).toEqual([
      { kind: 'survey', hex },
      { kind: 'explore', hex },
      { kind: 'reveal', hex },
      { kind: 'trap', hex },
      { kind: 'find', hex, item: 'ancient-alloy' },
      { kind: 'deposit', hex: centre, item: 'timber' },
      { kind: 'unlock', hex: centre, item: 'lantern' },
    ]);
  });
});

describe('Milestone 4 moments', () => {
  it('come from the fire-lit, fed and linger events', () => {
    const hex = { q: centre.q + 2, r: centre.r };
    expect(
      momentsFromEvents(
        [{ kind: 'fire-lit', hex }, { kind: 'fed', material: 'forage' }, { kind: 'linger' }],
        centre,
      ),
    ).toEqual([
      { kind: 'fire', hex },
      { kind: 'feed', hex: centre, item: 'forage' },
      { kind: 'linger', hex: centre },
    ]);
  });

  it("show others' fires, feeding and lingering from the views", () => {
    const hex = { q: centre.q + 2, r: centre.r };
    const before = view({ stores: { forage: 2 } });
    const after = view({
      stores: { forage: 1 },
      stimuli: [{ type: 'fire', hex, litDay: base.day }],
      creature: { ...base.creature, lingering: true },
    });
    expect(momentsBetween(before, after, 'me')).toEqual([
      { kind: 'fire', hex },
      { kind: 'feed', hex: centre, item: 'forage' },
      { kind: 'linger', hex: centre },
    ]);
  });
});
