import { describe, expect, it } from 'vitest';
import { joined, notJoined } from '../api/fixtures.ts';
import type { GameEvent, PlayerView } from '../api/schema.ts';
import { marksOf, MAX_DAYS, welcomeNeeded, welcomeOf } from './welcomeBack.ts';

const at = (view: PlayerView, day: number, lastDay: number | null): PlayerView => ({
  ...view,
  day,
  you: { ...view.you, lastDay, lastVersion: lastDay === null ? null : 1 },
});

const events = (view: PlayerView): GameEvent[] => {
  const hex = view.game.creature.centre;
  return [
    { kind: 'trap', hex, characterId: 'other' },
    { kind: 'trap', hex, characterId: 'other' },
    { kind: 'find', hex, material: 'ancient-alloy' },
    { kind: 'creature-step', from: hex, to: hex },
  ] as unknown as GameEvent[];
};

describe('whether to recap', () => {
  it('needs a character, a previous visit and at least one day turned', () => {
    const view = joined();
    expect(welcomeNeeded(at(view, 5, 4))).toBe(true);
    expect(welcomeNeeded(at(view, 9, 2))).toBe(true);
    expect(welcomeNeeded(at(view, 5, 5))).toBe(false);
    expect(welcomeNeeded(at(view, 5, null))).toBe(false);
    expect(welcomeNeeded(at(notJoined(), 5, 3))).toBe(false);
  });
});

describe('the recap', () => {
  it('counts the days that turned and lists them, ending today', () => {
    const w = welcomeOf(at(joined(), 7, 4), [], false);
    expect(w.dusks).toBe(3);
    expect(w.days).toEqual([4, 5, 6, 7]);
    expect(w.gap).toBe(false);
  });

  it('keeps the last days of a long absence and says earlier ones were left out', () => {
    const w = welcomeOf(at(joined(), 20, 2), [], false);
    expect(w.days).toHaveLength(MAX_DAYS);
    expect(w.days.at(-1)).toBe(20);
    expect(w.gap).toBe(true);
    expect(w.dusks).toBe(18);
  });

  it('turns the event log into marks by kind, with counts, and skips what is not a mark', () => {
    const view = at(joined(), 6, 5);
    const w = welcomeOf(view, events(view), false);
    expect(w.marks).toEqual([
      { kind: 'trap', count: 2 },
      { kind: 'find', count: 1 },
    ]);
  });

  it('shows no marks when the log no longer holds the days (it was truncated)', () => {
    const view = at(joined(), 6, 5);
    expect(welcomeOf(view, events(view), true).marks).toEqual([]);
  });

  it('reads peril and the route from the view alone', () => {
    const view = at(joined(), 6, 5);
    const w = welcomeOf(view, [], false);
    expect(w.peril).toBe(view.game.peril);
    expect(w.perilMax).toBe(view.game.config.perilMax);
    expect(w.steps).toBe(view.game.creature.steps);
    expect(w.routeLength).toBe(view.game.config.routeLength);
  });

  it('orders marks by their kind order and caps them', () => {
    const hex = { q: 0, r: 0 };
    const many = [
      'angered',
      'befriended',
      'cleared',
      'fire',
      'reveal',
      'find',
      'hungry',
      'trap',
      'strike',
      'threat',
    ].map((kind) => ({ kind, hex }));
    const marks = marksOf(many as never);
    expect(marks.map((m) => m.kind)).toEqual([
      'threat',
      'strike',
      'trap',
      'hungry',
      'find',
      'reveal',
    ]);
  });
});
