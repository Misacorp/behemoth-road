import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../api/schema.ts';
import { rosterRows } from './model.ts';

interface C {
  id: string;
  userId: string;
  role: string;
  actionsLeft: number;
  status: string;
  at: unknown;
}
const ch = (id: string, userId: string, o: Partial<C> = {}): C => ({
  id,
  userId,
  role: 'scout',
  actionsLeft: 2,
  status: 'active',
  at: { kind: 'hex', hex: { q: 0, r: 0 } },
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
      pl('u1', 'Wes', 'c1', 'guardian'),
      pl('u4', 'bea', null),
      pl('u5', 'Cy', 'c5', 'envoy'),
    ],
    [
      ch('c1', 'u1', { role: 'guardian', actionsLeft: 0 }),
      ch('c2', 'u2', { at: { kind: 'creature' } }),
      ch('c3', 'u3', { role: 'keeper', status: 'lost', actionsLeft: 1 }),
      ch('c5', 'u5', { role: 'envoy', actionsLeft: 1 }),
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

  it('keeps the order stable for equal names', () => {
    const same = rosterRows(
      view([pl('b', 'Sam', null), pl('a', 'sam', null), pl('u1', 'Me', null)], []),
      2,
    );
    expect(same.map((r) => r.userId)).toEqual(['u1', 'a', 'b']);
  });
});
