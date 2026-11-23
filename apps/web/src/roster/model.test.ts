import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../api/schema.ts';
import { IDLE, openCharacter } from '../map/flow.ts';
import { keepFound, rosterRows } from './model.ts';

interface C {
  id: string;
  userId: string;
  role: string;
  actionsLeft: number;
  status: string;
  at: unknown;
  stance: string;
  waiting: boolean;
}
const ch = (id: string, userId: string, o: Partial<C> = {}): C => ({
  id,
  userId,
  role: 'scout',
  actionsLeft: 2,
  status: 'active',
  at: { kind: 'hex', hex: { q: 0, r: 0 } },
  stance: 'rest',
  waiting: false,
  ...o,
});
const pl = (
  userId: string,
  name: string,
  characterId: string | null,
  role: string | null = null,
) => ({
  userId,
  name,
  characterId,
  role,
  joinedDay: null,
});
const view = (players: ReturnType<typeof pl>[], characters: C[], you = 'u1'): PlayerView =>
  ({
    you: { userId: you, characterId: null, admin: false },
    players,
    game: { characters },
  }) as never;

describe('roster rows', () => {
  const v = view(
    [
      pl('u3', 'zed', 'c3', 'keeper'),
      pl('u2', 'Ann', 'c2', 'scout'),
      pl('u1', 'Wes', 'c1', 'warden'),
      pl('u4', 'bea', null),
      pl('u5', 'Cy', 'c5', 'warden'),
    ],
    [
      ch('c1', 'u1', { role: 'warden', actionsLeft: 0 }),
      ch('c2', 'u2', { at: { kind: 'creature' } }),
      ch('c3', 'u3', { role: 'keeper', status: 'lost', actionsLeft: 1 }),
      ch('c5', 'u5', { role: 'warden', actionsLeft: 1 }),
    ],
  );
  const rows = rosterRows(v, 2);
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));

  it('lists you first, then the rest by name ignoring case', () => {
    expect(rows.map((r) => r.name)).toEqual(['Wes', 'Ann', 'bea', 'Cy', 'zed']);
    expect(rows.filter((r) => r.mine)).toHaveLength(1);
  });

  it('marks where each character is', () => {
    expect(Object.fromEntries(rows.map((r) => [r.name, r.where]))).toEqual({
      Wes: 'map',
      Ann: 'riding',
      bea: 'none',
      Cy: 'map',
      zed: 'lost',
    });
  });

  it('counts the day’s actions, and marks done only for an active character with none left', () => {
    expect(by.Wes).toMatchObject({ actionsLeft: 0, actionsPerDay: 2, done: true });
    expect(by.Ann).toMatchObject({ actionsLeft: 2, done: false });
    expect(by.Cy).toMatchObject({ actionsLeft: 1, done: false });
    expect(by.zed).toMatchObject({ actionsLeft: 0, done: false });
    expect(by.bea).toMatchObject({ actionsLeft: 0, done: false, characterId: null, role: null });
  });

  it('lets only active characters be tapped', () => {
    expect(Object.fromEntries(rows.map((r) => [r.name, r.tappable]))).toEqual({
      Wes: true,
      Ann: true,
      bea: false,
      Cy: true,
      zed: false,
    });
  });

  it('shows each active player’s stance and whether they ended their day', () => {
    expect(Object.fromEntries(rows.map((r) => [r.name, [r.stance, r.waiting]]))).toEqual({
      Wes: ['rest', false],
      Ann: ['rest', false],
      bea: [null, false],
      Cy: ['rest', false],
      zed: [null, false],
    });
    const waiting = rosterRows(
      view([pl('u1', 'Me', 'c1')], [ch('c1', 'u1', { waiting: true, stance: 'lie-in-wait' })]),
      2,
    );
    // The view has no tiles or config to fit a stance against: only rest never needs them.
    expect(waiting[0]).toMatchObject({ waiting: true });
  });

  it('keeps the order stable for equal names', () => {
    const same = rosterRows(
      view([pl('b', 'Sam', null), pl('a', 'sam', null), pl('u1', 'Me', null)], []),
      2,
    );
    expect(same.map((r) => r.userId)).toEqual(['u1', 'a', 'b']);
  });
});

describe('keeping a found character', () => {
  const v = view(
    [pl('u1', 'Wes', 'c1'), pl('u2', 'Ann', 'c2')],
    [ch('c1', 'u1'), ch('c2', 'u2', { status: 'lost' })],
  );
  const rows = rosterRows(v, 2);
  it('keeps the pin and the card while the character is findable', () => {
    const f = openCharacter('c1');
    expect(keepFound(rows, f, 'c1')).toEqual({ flow: f, pinned: 'c1' });
  });
  it('closes the card and drops the pin once the character is lost', () => {
    expect(keepFound(rows, openCharacter('c2'), 'c2')).toEqual({ flow: IDLE, pinned: undefined });
  });
  it('drops the pin but keeps another open card when the character left the view', () => {
    const f = openCharacter('c1');
    expect(keepFound(rows, f, 'gone')).toEqual({ flow: f, pinned: undefined });
  });
  it('does nothing without a pin', () => {
    const f = openCharacter('c2');
    expect(keepFound(rows, f, undefined)).toEqual({ flow: f, pinned: undefined });
  });
});
